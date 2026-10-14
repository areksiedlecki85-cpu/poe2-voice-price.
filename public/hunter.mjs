import {evaluateAuction,parseDivine} from './hunter-calc.mjs';
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
function pickItem(item,scroll=true){
 selected=item;
 $('auctionName').value=label(item);
 $('reference').value=String(item.value);
 $('auctionPick').value=item.id;
 $('calculation').textContent='Cena odniesienia: '+fmt(item.value)+' div. Wpisz cenę aukcji i kliknij „Porównaj ceny”.';
 if(scroll){$('auctionForm').scrollIntoView({behavior:'smooth',block:'center'});$('ask').focus({preventScroll:true});}
}
function fillPicker(){
 const picker=$('auctionPick'),old=selected?.id;
 picker.replaceChildren(new Option('— wybierz z cen referencyjnych —',''));
 for(const item of data?.items||[])picker.add(new Option(label(item)+' — '+fmt(item.value)+' div',item.id));
 picker.value=old&&data?.items?.some(i=>i.id===old)?old:'';
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
  buttons.append(makeButton('Sprawdź ofertę',()=>pickItem(i)));
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
 const name=$('auctionName').value;
 const reference=$('reference').value;
 const asking=$('ask').value;
 const exactSource=selected&&name===label(selected)&&parseDivine(reference)===selected.value;
 const result=evaluateAuction({name,ask:asking,reference,minimumDiscount:35,listingCount:exactSource?selected.listingCount:null});
 if(!result.ok){$('calculation').textContent=result.error;return}
 let message=result.item+' — cena: '+fmt(result.price)+' div, wartość porównawcza: '+fmt(result.market)+' div. ';
 message+='Różnica: '+fmt(result.discountPercent)+'% ('+fmt(result.difference)+' div). ';
 if(result.status==='candidate')message+='Możliwa okazja według ceny zbiorczej, ale niezweryfikowana aukcja. ';
 else if(result.status==='review')message+='Przekroczony próg 35%, lecz brak wystarczających danych porównawczych. ';
 else message+='Poniżej progu 35% przeceny. ';
 message+='Weryfikuj rolle, corruption, sockety i możliwość sprzedaży. Wprowadzone ceny nie są sprawdzane na PoE Trade.';
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
  categoryOptions();fillPicker();renderItems();renderWatches();
 }catch(err){status('Nie udało się pobrać danych: '+err.message+' — spróbuj później.');}
 finally{button.disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('query').addEventListener('input',renderItems);
$('category').addEventListener('change',renderItems);
$('auctionForm').addEventListener('submit',e=>{e.preventDefault();calculate()});
$('auctionPick').addEventListener('change',()=>{
 const item=data?.items?.find(x=>x.id===$('auctionPick').value);
 if(item)pickItem(item,false);
});
$('auctionName').addEventListener('input',()=>{selected=null;$('auctionPick').value='';});

renderWatches();
refresh();
