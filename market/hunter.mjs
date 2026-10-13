// Market Hunter: documented poe.ninja economy overview ONLY.
// This module never fetches individual trade listings or undisclosed endpoints.
// Data refreshes roughly hourly. The same cached snapshot is shared by all visitors.
const BASE='https://poe.ninja';
const UA='PoE2MarketHunter/0.1 (contact: https://github.com/areksiedlecki85-cpu/poe2-voice-price.)';
const TTL=60*60*1000, REQUEST_GAP=1700, MAX_RESULTS=500;
export const HUNTER_CONFIG=Object.freeze({league:'Forbidden Rites',minValue:50,maxValue:200,minDiscount:35,currency:'divine'});
export const HUNTER_TYPES=Object.freeze(['UniqueWeapons','UniqueArmours','UniqueAccessories','UniqueFlasks','UniqueCharms','UniqueJewels','UniqueSanctumRelics','UniqueTablets','PrecursorTablets']);
const cache=new Map();
const pending=new Map();
let lastRequest=0,networkQueue=Promise.resolve(),blockedUntil=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function boundedRetryAfter(v){
 const seconds=Number(v);
 if(Number.isFinite(seconds)&&seconds>=0)return Math.min(seconds*1000,60*60*1000);
 const date=Date.parse(v||'');
 return Number.isFinite(date)?Math.max(60000,Math.min(date-Date.now(),60*60*1000)):60000;
}
function queueRequest(task){
 const runner=async()=>{
  const delay=Math.max(0,lastRequest+REQUEST_GAP-Date.now());
  if(delay)await sleep(delay);
  if(Date.now()<blockedUntil)throw new Error('Źródło cen ogranicza zapytania. Odczekaj przed ponowieniem.');
  lastRequest=Date.now();
  return task();
 };
 const out=networkQueue.then(runner,runner);
 networkQueue=out.then(()=>{},()=>{});
 return out;
}
async function source(path,key){
 const saved=cache.get(key);
 if(saved&&Date.now()-saved.updated<TTL)return saved.data;
 if(pending.has(key))return pending.get(key);
 const promise=queueRequest(async()=>{
  const headers={'User-Agent':UA,'Accept':'application/json'};
  if(saved?.etag)headers['If-None-Match']=saved.etag;
  const response=await fetch(BASE+path,{headers,signal:AbortSignal.timeout(14000),redirect:'error'});
  if(response.status===304&&saved){
   cache.set(key,{...saved,updated:Date.now()});return saved.data;
  }
  if(response.status===429){
   blockedUntil=Date.now()+boundedRetryAfter(response.headers.get('retry-after'));
   throw new Error('poe.ninja: limit zapytań (429), ponów później');
  }
  if(!response.ok)throw new Error('poe.ninja: HTTP '+response.status);
  if(!String(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Nieprawidłowy format danych poe.ninja');
  const data=await response.json();
  cache.set(key,{data,etag:response.headers.get('etag'),updated:Date.now()});
  return data;
 });
 pending.set(key,promise);
 try{return await promise}finally{pending.delete(key)}
}
function number(v){const n=Number(v);return Number.isFinite(n)?n:null}
function divineRows(data,type){
 if(!data||!Array.isArray(data.lines))throw new Error('Nieoczekiwany format danych '+type);
 // Never silently treat chaos / exalted denominated prices as divine.
 const primary=String(data.core?.primary||'').toLowerCase().trim();
 if(!['divine','divine orb'].includes(primary))throw new Error('Kategoria '+type+' nie jest wyceniona w divine ('+primary+')');
 return data.lines.flatMap((r)=>{
  const reference=number(r.primaryValue);
  const listings=number(r.listingCount);
  if(reference===null||reference<HUNTER_CONFIG.minValue||reference>HUNTER_CONFIG.maxValue)return [];
  const name=String(r.name||'').trim();
  if(!name)return [];
  const variant=String(r.variant||'');
  const corrupted=Boolean(r.corrupted);
  const category=String(r.category||type);
  const id=[type,String(r.itemId||r.id||name),variant,corrupted?'corrupt':'clean'].join('|');
  const item={
   id,name,baseType:String(r.baseType||''),category:type,group:category,
   value:Math.round(reference*100)/100,
   listingCount:listings===null?null:Math.max(0,Math.trunc(listings)),
   variant,corrupted,confidence:(listings!==null&&listings>=5)?'ok':'low',
   target:Math.round(reference*(1-HUNTER_CONFIG.minDiscount/100)*100)/100
  };
  return [item];
 });
}
export function assessListing(ask,reference,listingCount,discount=HUNTER_CONFIG.minDiscount){
 const price=number(ask),market=number(reference);
 if(price===null||price<=0||market===null||market<=0)return {status:'invalid'};
 const diff=Math.round((market-price)*100)/100;
 const pct=Math.round(10000*(1-price/market))/100;
 return {
  status:pct>=discount?(Number(listingCount)>=5?'candidate':'uncertain'):'below-threshold',
  ask:price,reference:market,difference:diff,discountPercent:pct,
  reason:Number(listingCount)>=5?'To tylko cena referencyjna kategorii. Zweryfikuj wariant, rolle, korupcję, sockety i aktualność aukcji.':'Zbyt mało ofert referencyjnych, aby uznać wycenę za wiarygodną.'
 };
}
export async function getHunterSnapshot(){
 const now=new Date().toISOString();
 const league=HUNTER_CONFIG.league;
 const available=await source('/poe2/api/economy/leagues','leagues');
 if(!Array.isArray(available)||!available.some(l=>l.id===league))throw new Error('Liga Forbidden Rites nie jest dostępna w poe.ninja');
 const items=[],errors=[];
 for(const type of HUNTER_TYPES){
  try{
   const data=await source('/poe2/api/economy/stash/current/item/overview?league='+encodeURIComponent(league)+'&type='+encodeURIComponent(type),'stash:'+league+':'+type);
   items.push(...divineRows(data,type));
  }catch(e){
   errors.push({type,message:String(e.message||e)});
   // Stop after throttling. Never keep hitting an API that has asked us to wait.
   if(Date.now()<blockedUntil)break;
  }
 }
 // Some lines represent different variants/corruption states: preserve their identity.
 const distinct=[...new Map(items.map(x=>[x.id,x])).values()];
 distinct.sort((a,b)=>Math.abs(a.value-100)-Math.abs(b.value-100)||b.listingCount-a.listingCount||a.name.localeCompare(b.name));
 return {
  config:HUNTER_CONFIG,items:distinct.slice(0,MAX_RESULTS),
  total:distinct.length,updatedAt:now,
  source:'poe.ninja documented PoE2 economy overview',
  isIndividualListings:false,automaticListingAlerts:false,
  partial:errors.length>0,errors,
  note:'Wartości referencyjne, nie ceny konkretnych aukcji. Market Hunter nie wykrywa jeszcze automatycznie przecenionych ofert.'
 };
}
