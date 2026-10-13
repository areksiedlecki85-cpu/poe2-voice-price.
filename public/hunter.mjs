const $=id=>document.getElementById(id);
let data=null,selected=null;
const KEY='poe2-market-hunter-watch-v1';
const fmt=n=>Number(n).toLocaleString('pl-PL',{maximumFractionDigits:2});
let watches=readWatches();
function readWatches(){try{const w=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(w)?w.slice(0,120):[]}catch{return []}}
function persist(){localStorage.setItem(KEY,JSON.stringify(watches))}
function el(tag,cls='',text=''){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e}
function makeButton(label,onClick,cls='smallButton'){const b=el('button',cls,label);b.type='button';b.addEventListener('click',onClick);return b}
function status(s){$('status').textContent=s}
function label(i){
 const v=[i.name];
 if(i.variant)v.push('wariant: '+i.variant);
 if(i.corrupted)v.push('corrupted');
 return v.join(' • ');
}
function categoryOptions(){
 const sel=$('category'),prev=sel.value;sel.replaceChildren(new Option('Wszystkie','all'));
 const cats=[...new Set((data?.items||[]).map(x=>x.category))].sort();
 for(const c of cats)sel.add(new Option(c,c));
 sel.value=cats.includes(prev)||prev==='all'?prev:'all';
}
function renderItems(){
 const out=$('items');out.replaceChildren();const q=$('query').value.toLowerCase().trim(),cat=$('category').value;
 if(!data){$('count').textContent='Brak danych';return}
 const filtered=data.items.filter(i=>(cat==='all'||i.category===cat)&&(!q||[i.name,i.baseType,i.variant].join(' ').toLowerCase().includes(q)));
 $('count').textContent='Znaleziono '+filtered.length+' pozycji w wybranym zakresie. Wyświetlam pierwsze '+Math.min(90,filtered.length)+'.';
 for(const i of filtered.slice(0,90)){
  const card=el('article','item');card.append(el('h3','',label(i)));
  const p=el('div','row');p.append(el('span','price',fmt(i.value)+' div'),el('span','tag',i.listingCount===null?'brak liczby ofert':fmt(i.listingCount)+' ofert'));card.append(p);
  const more=el('div','tag',i.baseType||i.group);card.append(more);
  const confidence=el('div','tag '+(i.confidence==='low'?'warn':'ok'),i.confidence==='low'?'Mało danych — wycena niepewna':'Cena referencyjna: próba ≥5 ofert');
  card.append(confidence);
  const buttons=el('div','controls');
  buttons.append(makeButton('Sprawdź ofertę',()=>{selected=i;$('selected').value=label(i);$('calculation').textContent='Cena referencyjna: '+fmt(i.value)+' div. Wpisz cenę aukcji.';$('ask').focus()}));
  const watch=watches.some(w=>w.id===i.id);
  buttons.append(makeButton(watch?'Obserwowany ✓':'Obserwuj',()=>{
   if(!watches.some(w=>w.id===i.id)){watches.push({id:i.id,name:label(i),baseline:i.value,target:Math.round(i.value*.65*100)/100});persist();}
   renderWatches();renderItems();
  }));
  card.append(buttons);out.append(card);
 }
}
function renderWatches(){
 const root=$('watch');root.replaceChildren();
 if(!watches.length){root.append(el('p','note','Brak obserwowanych przedmiotów.'));return}
 for(const w of watches){
  const match=data?.items?.find(x=>x.id===w.id),v=match?.value;
  const flagged=Number.isFinite(v)&&v<=w.target;
  const card=el('div','item');
  card.append(el('strong','',w.name));
  card.append(el('div','tag','Cena przy dodaniu: '+fmt(w.baseline)+' div • próg -35%: '+fmt(w.target)+' div'));
  card.append(el('div',flagged?'tag ok':'tag',v===undefined?'Brak aktualnych danych':flagged?'Spadek ceny referencyjnej ≥35% • teraz '+fmt(v)+' div':'Bieżąca cena referencyjna: '+fmt(v)+' div'));
  card.append(makeButton('Usuń',()=>{watches=watches.filter(x=>x.id!==w.id);persist();renderItems();renderWatches()}));
  root.append(card);
 }
}
function calculate(){
 if(!selected){$('calculation').textContent='Najpierw wybierz przedmiot z listy.';return}
 const ask=Number($('ask').value),ref=selected.value;
 if(!Number.isFinite(ask)||ask<=0){$('calculation').textContent='Wpisz dodatnią cenę aukcji w divine.';return}
 const pct=(1-ask/ref)*100,diff=ref-ask;
 let message='Cena: '+fmt(ask)+' div • referencja: '+fmt(ref)+' div. Różnica: '+fmt(pct)+'% ('+fmt(diff)+' div). ';
 if(pct>=35){
  message+=selected.listingCount>=5?'Potencjalny kandydat do sprawdzenia.':'Niepewna wycena (mało ofert).';
 }else message+='Poniżej progu przeceny 35%.';
 message+=' To nie jest potwierdzony zysk. Porównaj dokładnie rolle, wariant, corruption i sockety.';
 $('calculation').textContent=message;
}
async function refresh(){
 const button=$('refresh');button.disabled=true;status('Pobieram ceny referencyjne (pierwsze wczytanie może trwać kilkanaście sekund)...');
 try{
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),65000);
  let response;try{response=await fetch('/api/hunter',{signal:ctrl.signal,cache:'no-cache'})}finally{clearTimeout(timeout)}
  const payload=await response.json();
  if(!response.ok)throw Error(payload.error||'HTTP '+response.status);
  if(!Array.isArray(payload.items))throw Error('Brak danych o przedmiotach');
  data=payload;
  status('Pobrano '+data.items.length+' wycen (łącznie '+data.total+'). '+new Date(data.updatedAt).toLocaleString('pl-PL')+'. '+(data.partial?'Częściowe dane: '+(data.errors||[]).map(e=>e.type).join(', '):'Wszystkie kategorie odświeżone.'));
  categoryOptions();renderItems();renderWatches();
 }catch(err){status('Nie udało się pobrać danych: '+err.message+' — spróbuj później.');}
 finally{button.disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('query').addEventListener('input',renderItems);
$('category').addEventListener('change',renderItems);
$('calculate').addEventListener('click',calculate);
renderWatches();
