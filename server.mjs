import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveStat,buildQuery,estimateListings} from './trade.mjs';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const HOST='https://www.pathofexile.com',PORT=Number(process.env.PORT||3000);
const USER_AGENT='PoE2VoicePrice/0.2 (community trade pricing research)';
const cache=new Map(),limit=new Map();
let lastGGG=0;
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ggg(url,method='GET',body=null){
  const now=Date.now(),wait=Math.max(0,1200-(now-lastGGG));if(wait)await pause(wait);lastGGG=Date.now();
  const headers={'Accept':'application/json','User-Agent':USER_AGENT};
  if(body)headers['Content-Type']='application/json';
  const r=await fetch(HOST+url,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
  const text=await r.text();
  if(!r.ok){console.error('[poe-trade] '+method+' '+url.split('?')[0]+' => HTTP '+r.status+'; content-type '+r.headers.get('content-type'));const err=new Error('Serwer PoE zwrócił '+r.status+(r.status===429?' (limit zapytań)':''));err.http=r.status;err.retryAfter=r.headers.get('retry-after');throw err;}
  try{return JSON.parse(text)}catch{throw new Error('PoE zwróciło niepoprawną odpowiedź. Możliwa blokada lub wymagane logowanie.')}
}
async function data(kind){
  const prev=cache.get(kind);if(prev&&Date.now()-prev.at<3600000)return prev.value;
  const response=await ggg('/api/trade2/data/'+kind);
  if(!Array.isArray(response.result))throw new Error('Katalog PoE jest niedostępny');
  cache.set(kind,{at:Date.now(),value:response.result});return response.result;
}
async function json(req){
 let payload='',length=0;for await(const c of req){length+=c.length;if(length>50000)throw new Error('Przekroczono rozmiar żądania');payload+=c.toString()}
 return JSON.parse(payload||'{}');
}
function rate(req){
 const ip=req.socket.remoteAddress||'unknown',now=Date.now(),old=limit.get(ip)||{at:now,n:0};
 if(now-old.at>60000){old.at=now;old.n=0}old.n++;limit.set(ip,old);return old.n<=12;
}
async function search(input,multiplier=1){
 const {query,matched}=buildQuery({...input,multiplier});
 const league=encodeURIComponent(input.league);
 const response=await ggg('/api/trade2/search/poe2/'+league,'POST',{query,sort:{price:'asc'}});
 if(!response.id)throw new Error('PoE Trade nie zwróciło identyfikatora wyszukiwania');
 const url='https://www.pathofexile.com/trade2/search/poe2/'+league+'/'+encodeURIComponent(response.id);
 const ids=(response.result||[]).filter(Boolean).slice(0,20),items=[];
 for(let i=0;i<ids.length;i+=10){
  const batch=ids.slice(i,i+10).map(encodeURIComponent).join(',');
  const loaded=await ggg('/api/trade2/fetch/'+batch+'?query='+encodeURIComponent(response.id));
  items.push(...(loaded.result||[]));
 }
 const result=estimateListings(items);
 return {url,total:Number(response.total||0),listings:result.listings,estimate:result.estimate,matched,multiplier};
}
async function handler(req,res){
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health')return send(res,200,{ok:true,note:'Serwer działa, nie oznacza to dostępności PoE Trade'});
 if(url.pathname==='/api/catalog'&&req.method==='GET'){
  try{
   const [stats,leagues]=await Promise.all([data('stats'),data('leagues')]);
   return send(res,200,{stats:stats.flatMap(g=>(g.entries||[]).map(x=>({id:x.id,text:x.text,group:g.label}))),
    leagues:leagues.filter(x=>!x.realm||x.realm==='poe2').map(x=>x.id)});
  }catch(e){return send(res,503,{error:'Nie udało się pobrać katalogu PoE Trade: '+e.message})}
 }
 if(url.pathname==='/api/estimate'&&req.method==='POST'){
  if(!rate(req))return send(res,429,{error:'Przekroczono lokalny limit 12 wyszukiwań na minutę'});
  try{
   const input=await json(req),available=await data('leagues'),league=String(input.league||'').trim();
   if(!league||!available.some(x=>x.id===league))return send(res,400,{error:'Wybierz poprawną ligę z listy'});
   const all=(await data('stats')).flatMap(g=>g.entries||[]),mods=[],unknown=[];
   for(const m of (Array.isArray(input.mods)?input.mods:[]).slice(0,10)){
    const match=resolveStat(m,all);if(!match){unknown.push(String(m.text||m.id||''));continue;}
    const v=m.min!==''&&m.min!=null&&Number.isFinite(Number(m.min))?Number(m.min):null;
    mods.push({...match,min:v});
   }
   if(unknown.length)return send(res,422,{error:'Nierozpoznane mody: '+unknown.join(', ')});
   const es=Number(input.energyShield)||null;
   if(!mods.length&&!es)return send(res,422,{error:'Dodaj mod lub wartość Energy Shield'});
   const params={league,mods,energyShield:es,rarity:String(input.rarity||'').slice(0,30),category:String(input.category||'').slice(0,80),itemType:String(input.itemType||'').trim().slice(0,100)};
   const attempts=[await search(params,1)];
   if(attempts[0].total===0&&(es||mods.some(m=>m.min!=null)))attempts.push(await search(params,.85));
   const chosen=attempts.find(a=>a.estimate)||attempts.find(a=>a.total>0)||attempts.at(-1);
   return send(res,200,{league,mode:chosen.multiplier===1?'dokładny':'zbliżony (85% wartości)',
     chosen,attempts:attempts.map(a=>({url:a.url,total:a.total,mode:a.multiplier===1?'dokładny':'zbliżony'})),
     note:'Wyłącznie ceny aktualnie wystawionych ofert; nie są to potwierdzone transakcje.'});
  }catch(e){return send(res,e.http===429?429:502,{error:e.message,retryAfter:e.retryAfter||null})}
 }
 if(req.method!=='GET')return send(res,405,{error:'Niedozwolona metoda'});
 let pathname;try{pathname=decodeURIComponent(url.pathname)}catch{return send(res,400,{error:'Błędna ścieżka'})}
 const target=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(ROOT+path.sep))return send(res,403,{error:'Brak dostępu'});
 try{const contents=await readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-cache'});res.end(contents)}
 catch{return send(res,404,{error:'Nie znaleziono pliku'})}
}
http.createServer((req,res)=>handler(req,res).catch(e=>send(res,500,{error:e.message}))).listen(PORT,'0.0.0.0',()=>{console.log('PoE2 Voice Price listening on '+PORT);
 (async()=>{for(const kind of ['stats','leagues']){try{const entries=await data(kind);console.log('[poe-trade] '+kind+' available: '+entries.length)}catch(e){console.error('[poe-trade] '+kind+' ERROR: '+e.message)}}
    try {
      const leagues=await data('leagues');
      const league=(leagues.find(x=>x.realm==='poe2'&&!/hardcore|standard/i.test(x.id))||leagues.find(x=>x.id==='Standard')||leagues[0])?.id;
      if(league){
        const query={query:{status:{option:'available'},filters:{type_filters:{filters:{rarity:{option:'magic'}}}}},sort:{price:'asc'}};
        const result=await ggg('/api/trade2/search/poe2/'+encodeURIComponent(league),'POST',query);
        console.log('[poe-trade] live-search smoke '+league+': id='+(result.id?'yes':'none')+', total='+result.total+', error='+(result.error?.message||'none'));
      }
    } catch(e){console.error('[poe-trade] live-search smoke ERROR: '+e.message)}
 })().catch(e=>console.error('[poe-trade] startup failed: '+e.message));});
