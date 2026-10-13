import {parseSpeech,rankCatalog} from './parser.mjs';
const $=id=>document.getElementById(id);
const make=(tag,cls='',value='')=>{const x=document.createElement(tag);if(cls)x.className=cls;x.textContent=value;return x};
let catalog=[],leagues=[],rows=[],busy=false,mic=null,listening=false;
const format=n=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:1}).format(n);
function status(text,kind=''){$('status').className='status '+kind;$('status').textContent=text}
function getLeague(){
 const last=localStorage.getItem('poe2-voice-league')||'';
 const guess=leagues.find(l=>l===last)||leagues.find(l=>/forbidden rites/i.test(l))||leagues.find(l=>!/(hardcore|standard|ssf)/i.test(l))||leagues[0]||'';
 const sel=$('league');sel.replaceChildren();
 if(!leagues.length)sel.add(new Option('PoE Trade niedostępne',''));
 else for(const name of leagues)sel.add(new Option(name,name));
 sel.value=guess;
}
async function load(){
 status('Pobieram aktualne ligi i katalog modów z PoE Trade…');
 try{
  const response=await fetch('/api/catalog'),data=await response.json();
  if(!response.ok)throw new Error(data.error||'HTTP '+response.status);
  catalog=data.stats||[];leagues=data.leagues||[];getLeague();
  status('Połączono. Pobrano '+format(catalog.length)+' modów. Możesz dyktować.','good');render();
 }catch(e){status('Brak dostępu do danych PoE: '+e.message+'. Mikrofon działa, ale ceny nie mogą być zweryfikowane.','bad');getLeague()}
}
function parse(text){
 const parsed=parseSpeech(text);
 if(parsed.category)$('category').value=parsed.category;
 if(parsed.rarity)$('rarity').value=parsed.rarity;
 if(parsed.energyShield!==null)$('es').value=parsed.energyShield;
 rows=parsed.mods.map((m,i)=>({id:'',text:m.text,min:m.min,key:i+'_'+Date.now()}));
 render();
 status(parsed.recognized?'Rozpoznano '+rows.length+' modów'+(parsed.energyShield!==null?' i ES '+parsed.energyShield:'')+'. Sprawdź dopasowanie do katalogu.':'Nie rozpoznano statystyk. Popraw tekst lub dodaj mod ręcznie.',parsed.recognized?'good':'bad');
}
// Weryfikowane identyfikatory z aktualnego katalogu PoE2 (kontrolowane przy ładowaniu).
const verifiedStatIds={
 'Minion Critical Strike Damage':'explicit.stat_1854213750',
 'Minion Critical Strike Chance':'explicit.stat_491450213',
 'Minion Damage':'explicit.stat_1589917703'
};
function ranked(row,sel){
 if(!row.id&&verifiedStatIds[row.text]&&catalog.some(c=>c.id===verifiedStatIds[row.text]))row.id=verifiedStatIds[row.text];
 const matches=rankCatalog(row.text,catalog);sel.replaceChildren();sel.add(new Option('— Wybierz mod z katalogu —',''));
 for(const m of matches)sel.add(new Option(m.text+' ['+m.id.split('.')[0]+']',m.id));
 if(row.id&&catalog.some(c=>c.id===row.id)){
  if(!matches.some(x=>x.id===row.id))sel.add(new Option(catalog.find(x=>x.id===row.id).text,row.id));
  sel.value=row.id;
 }else if(matches.length&&matches[0].score>.89&&(!matches[1]||matches[0].score-matches[1].score>.15)){
  row.id=matches[0].id;sel.value=row.id;
 }
}
function render(){
 const list=$('modList');list.replaceChildren();
 if(!rows.length){list.append(make('p','note','Brak modów. Dodaj je ręcznie lub podyktuj.'));return}
 for(const row of rows){
  const card=make('div','mod'),top=make('div','row');
  const input=make('input','name');input.value=row.text;input.placeholder='Nazwa moda';input.setAttribute('aria-label','Nazwa moda');
  const num=make('input','number');num.type='number';num.step='.1';num.placeholder='Min';num.title='Minimalna wartość';num.value=row.min==null?'':String(row.min);
  const del=make('button','remove','×');del.title='Usuń mod';del.onclick=()=>{rows=rows.filter(x=>x!==row);render()};
  top.append(input,num,del);card.append(top);
  const select=make('select');select.setAttribute('aria-label','Wybór właściwego moda z katalogu');ranked(row,select);
  input.oninput=()=>{row.text=input.value;row.id='';ranked(row,select)};
  num.onchange=()=>row.min=num.value===''?null:Number(num.value);
  select.onchange=()=>{row.id=select.value;const c=catalog.find(x=>x.id===row.id);if(c)row.text=c.text};
  card.append(select);list.append(card);
 }
}
function say(message){
 if(!window.speechSynthesis)return;
 try{speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance(message);speech.lang='pl-PL';speech.rate=.94;speechSynthesis.speak(speech)}catch{}
}
function resultError(message){
 const out=$('result');out.replaceChildren();
 out.append(make('div','status bad',message),make('p','note','Bez zweryfikowanych ofert nie podaję ceny. Możesz spróbować później.'));
 $('output').classList.remove('hidden');$('output').scrollIntoView({behavior:'smooth'});
}
function link(parent,url,caption){
 if(!url||!url.startsWith('https://www.pathofexile.com/trade2/'))return;
 const a=make('a','',caption);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
}
function show(data){
 const out=$('result');out.replaceChildren();const chosen=data.chosen;
 out.append(make('p','note',data.league+' · '+data.mode+' · '+chosen.total+' ofert spełniających kryteria'));
 if(chosen.estimate){
  const p=make('div','summary');p.append(make('div','big',format(chosen.estimate.median)+' '+chosen.estimate.currency),make('div','','Mediana '+chosen.estimate.count+' porównywalnych ofert w tej walucie'),make('p','note','Zakres: '+format(chosen.estimate.minimum)+'–'+format(chosen.estimate.maximum)+' '+chosen.estimate.currency));
  out.append(p);
  say('Wycena na podstawie aktualnych ofert: około '+format(chosen.estimate.median)+' '+chosen.estimate.currency+'.');
 }else{
  out.append(make('div','status bad',chosen.total===0?'Nie ma ofert z takimi modami.':'Za mało wycenionych w divine ofert, żeby wiarygodnie oszacować cenę.'));
  say('Nie mam wystarczających danych rynkowych, aby podać cenę.');
 }
 for(const a of data.attempts||[]){
  const p=make('p','note',a.mode+': '+a.total+' ofert · ');link(p,a.url,'Otwórz wyszukiwanie na PoE Trade ↗');out.append(p);
 }
 out.append(make('h2','','Przykładowe ogłoszenia'));
 if(!(chosen.listings||[]).length)out.append(make('p','note','Brak dostępnych ogłoszeń z ceną.'));
 for(const item of (chosen.listings||[]).slice(0,12)){
  const line=make('div','offer'),left=make('div');
  left.append(make('div','',item.name));
  if(item.mods?.length)left.append(make('small','',item.mods.slice(0,2).join(' · ')));
  line.append(left,make('div','price',format(item.amount)+' '+item.currency));out.append(line);
 }
 out.append(make('p','note','Są to ceny wystawionych ofert, nie historia sprzedaży. Przy rzadkich kombinacjach i korupcjach wycena może być niepewna.'));
 $('output').classList.remove('hidden');$('output').scrollIntoView({behavior:'smooth'});
}
async function search(){
 if(busy)return;
 if(!catalog.length)return resultError('Nie ma dostępu do katalogu modów PoE Trade. Spróbuj ponownie później.');
 if(rows.some(r=>!r.id))return resultError('Nie wybrano dokładnych modów z katalogu. Wybierz właściwy wariant dla każdej statystyki.');
 busy=true;$('search').disabled=true;$('search').textContent='Szukam na rynku…';
 try{
  const payload={league:$('league').value,category:$('category').value,rarity:$('rarity').value,energyShield:$('es').value,itemType:$('itemType').value.trim(),mods:rows.map(r=>({id:r.id,text:r.text,min:r.min}))};
  const response=await fetch('/api/estimate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd serwera '+response.status);
  show(data);
 }catch(e){resultError(e.message);say('Wycena jest niedostępna.')}finally{busy=false;$('search').disabled=false;$('search').textContent='🔎 Sprawdź aktualne oferty'}
}
function initSpeech(){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){$('mic').disabled=true;status('Brak rozpoznawania mowy w tej przeglądarce. Użyj Chrome na Androidzie lub wpisz statystyki.','bad');return}
 $('mic').onclick=()=>{
  if(listening){mic?.stop();return}
  mic=new Recognition();mic.lang=$('speechLang').value;mic.interimResults=true;mic.maxAlternatives=2;
  let transcript='';
  mic.onstart=()=>{listening=true;$('mic').classList.add('active');$('micLabel').textContent='Słucham… dotknij, by skończyć';status('Mów statystyki po polsku lub angielsku…')};
  mic.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)transcript+=e.results[i][0].transcript+' ';else interim+=e.results[i][0].transcript}$('dictation').value=transcript+interim};
  mic.onerror=e=>status('Mikrofon: '+e.error+'. Sprawdź uprawnienia w Chrome.','bad');
  mic.onend=()=>{listening=false;$('mic').classList.remove('active');$('micLabel').textContent='Rozpocznij dyktowanie';
   if($('dictation').value.trim()){parse($('dictation').value);if(/\b(znajdź|znajdz|wyceń|wycen|wyszukaj)\b/i.test($('dictation').value)&&catalog.length&&rows.every(r=>r.id))search();}
  };
  try{mic.start()}catch(e){status('Nie udało się włączyć mikrofonu: '+e.message,'bad')}
 };
}
async function photo(file){
 if(!file)return;status('Odczytuję tekst ze zdjęcia…');
 try{
  const {createWorker}=await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
  const worker=await createWorker('eng');const result=await worker.recognize(file);await worker.terminate();
  const text=result?.data?.text?.trim();if(!text)throw new Error('Nie znaleziono tekstu na zdjęciu.');
  $('dictation').value=text;parse(text);status('Odczytano zdjęcie. Sprawdź wszystkie statystyki przed wyceną.','good');
 }catch(e){status('Nie udało się odczytać zdjęcia: '+e.message,'bad')}
}
$('parse').onclick=()=>parse($('dictation').value);
$('sample').onclick=()=>{$('dictation').value='Jewel, minion critical strike damage 20, minion damage increased 20, magic, znajdź';parse($('dictation').value)};
$('addMod').onclick=()=>{rows.push({id:'',text:'',min:null,key:Date.now()});render()};
$('search').onclick=search;$('league').onchange=()=>localStorage.setItem('poe2-voice-league',$('league').value);
$('photo').onchange=e=>photo(e.target.files?.[0]);
initSpeech();load();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
