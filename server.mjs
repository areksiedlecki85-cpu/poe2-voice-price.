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

 // One-click link from ChatGPT: generate official trade search and redirect.
 // /go?league=Forbidden%20Rites&category=jewel&rarity=magic&m=explicit.stat_1854213750:20&m=explicit.stat_1589917703:20
 if(url.pathname==='/go'&&req.method==='GET'){
   const errorPage=(message,statusCode=400)=>{
     const safe=String(message).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
     res.writeHead(statusCode,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
     res.end('<!doctype html><html lang="pl"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>PoE2 Trade</title><body style="font:16px system-ui;background:#111821;color:#f0f1f5;padding:20px"><h2>Nie mogę otworzyć wyszukiwania</h2><p>'+safe+'</p><p>Nie zmieniłam filtrów wyszukiwania.</p><a style="color:#eac08b" href="/">Przejdź do aplikacji</a></body></html>');
   };
   if(!rate(req))return errorPage('Za dużo zapytań. Spróbuj za minutę.',429);
   try{
     const league=String(url.searchParams.get('league')||'Forbidden Rites').trim();
     const available=await data('leagues');
     if(!available.some(x=>x.id===league))return errorPage('Nieznana liga. Otwórz aplikację i sprawdź dostępną ligę.');
     const rarity=String(url.searchParams.get('rarity')||'').toLowerCase();
     if(rarity&&!['normal','magic','rare','unique'].includes(rarity))return errorPage('Niewłaściwa rzadkość przedmiotu.');
     const category=String(url.searchParams.get('category')||'');
     if(category&&!['jewel','armour.helmet','armour.chest','armour.gloves','armour.boots','accessory.ring','accessory.amulet','accessory.belt','weapon'].includes(category))return errorPage('Nieznana kategoria przedmiotu.');
     const requestedBase=String(url.searchParams.get('base')||'').slice(0,100).trim();
     // PoE Trade names the Diamond Jewel base 'Diamond'; accept natural-language aliases.
     const baseMatch=requestedBase.match(/^(diamond|sapphire|emerald|ruby)(?: jewel)?$/i);
     const itemType=baseMatch?baseMatch[1].slice(0,1).toUpperCase()+baseMatch[1].slice(1).toLowerCase():requestedBase;
     const itemName=String(url.searchParams.get('name')||'').trim().slice(0,80);
     const esRaw=url.searchParams.get('es');
     const energyShield=esRaw&&Number.isFinite(Number(esRaw))&&Number(esRaw)>=0&&Number(esRaw)<=3000?Number(esRaw):null;
     const all=(await data('stats')).flatMap(x=>x.entries||[]);
     const mods=[],countMods=[],rawMods=url.searchParams.getAll('m');
     const countMinRaw=url.searchParams.get('count_min');
     const countMin=countMinRaw===null?null:Number(countMinRaw);
     if(countMin!==null&&(!Number.isInteger(countMin)||countMin<1||countMin>8))return errorPage('Count min musi być liczbą od 1 do 8.');
     if(rawMods.length>12)return errorPage('Maksymalnie 12 modów w jednym wyszukiwaniu.');
     for(const token of rawMods){
       const match=token.match(/^([a-z]+\.[a-z0-9_]+)(?::(-?\d+(?:\.\d+)?))?$/i);
       if(!match)return errorPage('Nieprawidłowy format moda: '+token);
       const mod=all.find(x=>x.id===match[1]);
       if(!mod)return errorPage('Nieznany mod w katalogu PoE: '+match[1]);
       const min=match[2]!=null?Number(match[2]):null;
       if(min!=null&&(!Number.isFinite(min)||Math.abs(min)>1e6))return errorPage('Nieprawidłowa wartość moda.');
       mods.push({id:mod.id,min});
     }
     // An unambiguous crafted prefix can be resolved dynamically without hardcoding a trade stat ID.
     // /go?...&effect=suffixes verifies its exact presence in the live official PoE Trade catalog.
     const effect=String(url.searchParams.get('effect')||'').trim().toLowerCase();
     if(effect){
       if(effect!=='suffixes')return errorPage('Nieznany efekt: '+effect);
       const statCandidates=all.filter(s =>
         String(s.text||'').toLowerCase().includes('increased effect of suffixes')
       );
       const found=statCandidates.find(s=>s.id.startsWith('crafted.'))
         ||statCandidates.find(s=>s.id.startsWith('explicit.'))
         ||statCandidates[0];
       if(!found)return errorPage('Oficjalny katalog PoE Trade nie zawiera filtra Increased Effect of Suffixes. Nie uruchamiam wyszukiwania bez tego moda.');
       if(!mods.some(m=>m.id===found.id))mods.push({id:found.id,min:null});
     }
     // Cultivated The Adorned: additional effect for socketed corrupted RARE jewels.
     // Match its exact text dynamically against GGG's live stat catalog, not magic jewels.
     const exactRareRaw=url.searchParams.get('rare_effect_exact');
     const minRareRaw=url.searchParams.get('rare_effect_min');
     const rareEffectRaw=exactRareRaw??minRareRaw;
     let rareStatId=null;
     if(rareEffectRaw!==null){
       const rareValue=Number(rareEffectRaw);
       if(!Number.isInteger(rareValue)||rareValue<0||rareValue>75)return errorPage('Rare jewel effect musi wynosić od 0 do 75%.');
       const candidates=all.filter(s=>{
         const label=String(s.text||'').replace(/\s+/g,' ').replace(/,/g,'').trim();
         return /^#% increased Effect of Jewel Socket Passive Skills containing Corrupted Rare Jewels$/i.test(label);
       });
       const stat=candidates.find(s=>s.id.startsWith('explicit.'))
         ||candidates.find(s=>s.id.startsWith('enchant.'))
         ||candidates[0];
       if(!stat)return errorPage('Brak moda efektu Corrupted Rare Jewels w katalogu PoE Trade. Nie wyszukuję Magic Jewels.');
       rareStatId=stat.id;
       if(!mods.some(m=>m.id===stat.id))mods.push({id:stat.id,min:rareValue});
     }
     // Shortcuts are resolved against the live catalogue, so stat hashes stay current.
     // count_min=2 with three stat=... shortcuts matches any two of those three.
     const shortcut=url.searchParams.getAll('stat');
     if(shortcut.length>8)return errorPage('Maksymalnie 8 skrótów modów w jednym wyszukiwaniu.');
     for(const name of shortcut){
       const patterns={
         'companion-damage':/^Companions deal #?%? increased Damage$/i,
         'minion-damage':/^Minions deal #?%? increased Damage$/i,
         'minion-crit-damage':/^Minions have #?%? increased Critical Damage Bonus$/i
       };
       const pattern=patterns[name];
       if(!pattern)return errorPage('Nieznany skrót moda: '+name);
       const candidates=all.filter(x=>pattern.test(String(x.text||'').replace(/\s+/g,' ').trim()));
       const match=candidates.find(x=>x.id.startsWith('explicit.'))||candidates[0];
       if(!match)return errorPage('Brak jednoznacznego moda '+name+' w katalogu PoE.');
       if(!mods.some(m=>m.id===match.id)&&!countMods.some(m=>m.id===match.id)){
         (countMin===null?mods:countMods).push({id:match.id,min:null});
       }
     }
     if(countMin!==null&&countMods.length<countMin)return errorPage('Za mało różnych modów dla warunku Count min '+countMin+'.');
     if(!mods.length&&!countMods.length&&!energyShield&&!itemType)return errorPage('Wyszukiwanie wymaga przynajmniej jednego moda, ES lub konkretnej bazy.');
     const {query}=buildQuery({mods,energyShield,rarity,category,itemType});
     if(countMin!==null)query.stats.push({type:'count',value:{min:countMin},filters:countMods.map(m=>({id:m.id}))});
     if(exactRareRaw!==null&&rareStatId){
       const row=query.stats.flatMap(g=>g.filters||[]).find(f=>f.id===rareStatId);
       if(!row)return errorPage('Błąd dokładnego filtra Corrupted Rare Jewels.',502);
       row.value={min:Number(exactRareRaw),max:Number(exactRareRaw)};
     }
     if(itemName)query.name=itemName;
     const result=await ggg('/api/trade2/search/poe2/'+encodeURIComponent(league),'POST',{query,sort:{price:'asc'}});
     if(!result.id)return errorPage('PoE Trade nie zwróciło linku do wyników.',502);
     const destination='https://www.pathofexile.com/trade2/search/poe2/'+encodeURIComponent(league)+'/'+encodeURIComponent(result.id);
     console.log('[trade-link] generated '+league+' mods='+mods.map(m=>m.id).join(',')+' count='+countMin+' countMods='+countMods.map(m=>m.id).join(',')+' total='+Number(result.total||0));
     res.writeHead(302,{location:destination,'cache-control':'no-store'});return res.end();
   }catch(e){console.error('[trade-link] '+e.message);return errorPage(e.http===429?'PoE Trade ogranicza liczbę zapytań. Spróbuj później.':'PoE Trade chwilowo nie odpowiada: '+e.message,502)}
 }

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
http.createServer((req,res)=>handler(req,res).catch(e=>send(res,500,{error:e.message}))).listen(PORT,'0.0.0.0',()=>{
 console.log('PoE2 Voice Price listening on '+PORT);

 if(process.env.RUN_SYLVAN_SKILL_CHECK==='1'){
  (async()=>{
   const ids=['220498b3ec04deada63ca5ec7d84d831ffc2ffa04be60215eb21b8858609c65a','36bc18894dd1851f9ba69ad5d400e97441a75f86d42e2fa64d4a95f616e31223','c7e4cfb5098580bce7f690467eefea2b8d0594c207dd3c006e61b9a790171dcf'];
   const q='H4sIAAAAAAAAA3VQzW6DMAx-lcqXXdBEaaGU-56gx6lCLpjJWghpYlARyrs3jP0wbc3J-ezvx57ACUrvoJigM8KdhgJwQFZ4UQQ-Ao0tBew0qgH1k9u8NA2_jRCBjOajIR1Xm1NFRiwFeNYLcq_T1wDqOsANKyG7NLgOMN2M4orleSaUu2O-z7M0T_dhdkDV05yo5RDnsPM--pe0jbNDliRp8pd0TL0_-_PKd8lTrv6r0qJlGX8dodd8DYI-mINYrB9RjeVq8cUbFNs4jn40ah5Yf2rQtWfTkpZHEXpNpeuqdxL3vUbi53cHzbhnq6UBAAA';
   for(let attempts=0;attempts<3;attempts++){
    try{
     const r=await ggg('/api/trade2/fetch/'+ids.join(',')+'?query='+q);
     console.log('[SYLVAN:SKILLS] '+JSON.stringify((r.result||[]).map(x=>({
      id:x.id,price:x.listing?.price,properties:x.item?.properties,requirements:x.item?.requirements,implicit:x.item?.implicitMods,
      skills:x.item?.grantedSkills,skillgems:x.item?.socketedItems,selected:x.item?.extended?.mods?.explicit,base:x.item?.baseType,
      info:x.item?.additionalProperties,corrupt:x.item?.corrupted
     }))));
     break;
    }catch(e){console.log('[SYLVAN:SKILLERROR] '+e.message);if(e.http!==429||attempts===2)break;await pause(25000)}
   }
  })().catch(e=>console.error('[SYLVAN:SKILLFATAL] '+e.message));
 }


 if(process.env.RUN_SYLVAN_DEEP==='1'){
  (async()=>{
   const a=(await data('stats')).flatMap(g=>g.entries||[]);
   const sp=a.find(x=>x.id==='explicit.stat_3984865854');
   const cp=a.find(x=>x.id==='explicit.stat_1067622524');
   const cases=[
    {key:'2socket-strong-under100',spirit:73,companion:95,max:100,two:true},
    {key:'2socket-strong-100to250',spirit:73,companion:95,min:100,max:250,two:true},
    {key:'2socket-top-75-100',spirit:75,companion:100,max:250,two:true},
    {key:'2socket-any-high-roll',spirit:73,companion:90,max:250,two:true},
    {key:'2socket-all',max:100,two:true}
   ];
   for(const c of cases){
    const query={status:{option:'available'},name:"Sylvan's Effigy",type:"Stoic Sceptre",stats:[],
      filters:{type_filters:{filters:{rarity:{option:'unique'}}},trade_filters:{filters:{price:{...c.min?{min:c.min}:{},...c.max?{max:c.max}:{},option:'divine'}}}}};
    if(c.two)query.filters.equipment_filters={filters:{rune_sockets:{min:2}}};
    const filters=[];
    if(sp&&c.spirit)filters.push({id:sp.id,value:{min:c.spirit}});
    if(cp&&c.companion)filters.push({id:cp.id,value:{min:c.companion}});
    if(filters.length)query.stats=[{type:'and',filters}];
    try{
     const r=await ggg('/api/trade2/search/poe2/Forbidden%20Rites','POST',{query,sort:{price:'asc'}});
     console.log('[SYLVAN2:SEARCH] '+JSON.stringify({key:c.key,total:r.total,uri:'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites/'+r.id}));
     const ids=(r.result||[]).filter(Boolean).slice(0,25),offers=[];
     for(let j=0;j<ids.length;j+=10){
      const fetched=await ggg('/api/trade2/fetch/'+ids.slice(j,j+10).map(encodeURIComponent).join(',')+'?query='+encodeURIComponent(r.id));
      for(const x of fetched.result||[]){
       const it=x.item||{},p=x.listing?.price||{},toStr=o=>typeof o==='string'?o:String(o?.description||'');
       offers.push({id:x.id,price:p.amount,unit:p.currency,corrupt:!!it.corrupted,sockets:it.sockets?.length||0,
        explicit:(it.explicitMods||[]).map(toStr).slice(0,9),
        implicit:(it.implicitMods||[]).map(toStr).slice(0,5),
        enchants:(it.enchantMods||[]).map(toStr).slice(0,3),
        runes:(it.runeMods||[]).map(toStr).slice(0,3),
        date:x.listing?.indexed});
      }
     }
     console.log('[SYLVAN2:OFFERS] '+JSON.stringify({key:c.key,offers}));
    }catch(e){console.log('[SYLVAN2:ERROR] '+c.key+' '+e.message)}
   }
  })().catch(e=>console.error('[SYLVAN2:FATAL] '+e.message));
 }


 if(process.env.RUN_SYLVAN_CHECK==='1'){
   (async()=>{
     const all=(await data('stats')).flatMap(g=>(g.entries||[]).map(x=>({...x,group:g.label})));
     const spirit=all.filter(x=>/^#% increased Spirit$/i.test(String(x.text||'').replace(/\s+/g,' ').trim()));
     const companion=all.filter(x=>/Companions deal #?%? increased Damage to your Marked targets/i.test(String(x.text||'').replace(/\s+/g,' ').trim()));
     console.log('[SYLVAN:STATS] '+JSON.stringify({spirit,companion}));
     const sp=spirit.find(x=>x.id.startsWith('explicit.'))||spirit[0],cp=companion.find(x=>x.id.startsWith('explicit.'))||companion[0];
     const cases=[
       {key:'market-50-200',price:{min:50,max:200,option:'divine'}},
       {key:'bargain-10-70',price:{min:10,max:70,option:'divine'}},
       {key:'high-rolls-under-150',price:{max:150,option:'divine'},spirit:73,companion:95},
       {key:'max-spirit-under-150',price:{max:150,option:'divine'},spirit:75},
       {key:'best-150-400',price:{min:150,max:400,option:'divine'},spirit:73,companion:95}
     ];
     for(const c of cases){
       const query={status:{option:'available'},name:"Sylvan's Effigy",type:'Stoic Sceptre',
         filters:{type_filters:{filters:{rarity:{option:'unique'}}},trade_filters:{filters:{price:c.price}}},stats:[]};
       const rows=[];
       if(c.spirit&&sp)rows.push({id:sp.id,value:{min:c.spirit}});
       if(c.companion&&cp)rows.push({id:cp.id,value:{min:c.companion}});
       if(rows.length)query.stats=[{type:'and',filters:rows}];
       try{
         const result=await ggg('/api/trade2/search/poe2/Forbidden%20Rites','POST',{query,sort:{price:'asc'}});
         const id=result.id;
         console.log('[SYLVAN:SEARCH] '+JSON.stringify({key:c.key,total:result.total,id,uri:'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites/'+id}));
         const rawids=(result.result||[]).filter(Boolean).slice(0,35);
         const items=[];
         for(let j=0;j<rawids.length;j+=10){
           const batch=rawids.slice(j,j+10).map(encodeURIComponent).join(',');
           const r=await ggg('/api/trade2/fetch/'+batch+'?query='+encodeURIComponent(id));
           for(const x of r.result||[]){
             if(!x?.item)continue;
             const it=x.item,p=x.listing?.price||{};
             items.push({
               id:x.id,amount:p.amount,unit:p.currency,spirit:it.explicitMods?.find(t=>/increased Spirit/i.test(t))||'',
               companion:it.explicitMods?.find(t=>/Companions deal/i.test(t))||'',
               attribute:it.explicitMods?.find(t=>/to all Attributes/i.test(t))||'',
               skills:(it.implicitMods||[]).filter(t=>/Grants Skill/i.test(t)),
               socketCount:it.sockets?.length||0,corrupted:!!it.corrupted,
               socketText:it.sockets?.map(x=>x.group).join(',')||'',
               notes:(it.enchantMods||[]).concat(it.runeMods||[]).slice(0,3),
               indexed:x.listing?.indexed||''
             });
           }
         }
         console.log('[SYLVAN:OFFERS] '+JSON.stringify({key:c.key,items}));
       }catch(e){console.log('[SYLVAN:ERROR] '+c.key+' '+e.message)}
     }
   })().catch(e=>console.error('[SYLVAN:FATAL] '+e.message));
 }

 if(process.env.RUN_ADORNED_SMOKE==='1'){
   (async()=>{
     const all=(await data('stats')).flatMap(g=>(g.entries||[]).map(x=>({...x,group:g.label})));
     const hits=all.filter(x=>/corrupted.*rare.*jewels/i.test(String(x.text||'')));
     console.log('[ADORNED:CANDIDATES] '+JSON.stringify(hits));
     const qs='?league=Forbidden%20Rites&category=jewel&rarity=unique&base=Diamond&name=The%20Adorned&rare_effect_exact=41';
     const response=await fetch('http://127.0.0.1:'+PORT+'/go'+qs,{redirect:'manual',signal:AbortSignal.timeout(30000)});
     console.log('[ADORNED:GO] HTTP '+response.status+' location='+(response.headers.get('location')||'')+' body='+(response.status!==302?(await response.text()).slice(0,900):''));
   })().catch(e=>console.error('[ADORNED:ERROR] '+e.message));
 }


 if(process.env.RUN_SAPPHIRE_SMOKE==='1'){
   (async()=>{
     const qs='?league=Forbidden%20Rites&category=jewel&rarity=rare&base=Sapphire%20Jewel&effect=suffixes&count_min=2&stat=minion-damage&stat=companion-damage&stat=minion-crit-damage';
     const response=await fetch('http://127.0.0.1:'+PORT+'/go'+qs,{redirect:'manual',signal:AbortSignal.timeout(30000)});
     console.log('[SAPPHIRE-TEST] status='+response.status+' location='+(response.headers.get('location')||'')+' body='+(response.status!==302?(await response.text()).slice(0,900):''));
   })().catch(e=>console.error('[SAPPHIRE-TEST] error='+e.message));
 }

 if(process.env.RUN_TRADE_LINK_SMOKE==='1'){
   (async()=>{
     const all=(await data('stats')).flatMap(g=>(g.entries||[]).map(x=>({...x,group:g.label})));
     for(const term of ['suffix','companion','critical damage']){
       const hits=all.filter(x=>String(x.text).toLowerCase().includes(term)&&(!['companion','critical damage'].includes(term)||/damage/i.test(x.text))).slice(0,45);
       console.log('[DIAGNOSTIC:catalog] '+term+' '+JSON.stringify(hits.map(x=>({id:x.id,text:x.text,group:x.group}))));
     }
     for(const base of ['Diamond Jewel','Diamond']){
       const url='/go?league=Forbidden%20Rites&category=jewel&rarity=rare&base='+encodeURIComponent(base)+'&m=explicit.stat_1854213750&stat=companion-damage&effect=suffixes';
       const response=await fetch('http://127.0.0.1:'+PORT+url,{redirect:'manual',signal:AbortSignal.timeout(24000)});
       console.log('[DIAGNOSTIC:go] '+base+' HTTP '+response.status+' location='+String(response.headers.get('location')||'')+' text='+(response.status===302?'':(await response.text()).slice(0,600)));
     }
   })().catch(e=>console.error('[DIAGNOSTIC:error] '+e.message));
 }
});
