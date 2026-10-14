// One-shot targeted comparison, explicitly inspect augment socket count and offer ages.
const host='https://www.pathofexile.com';
let last=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(path,body){
 const d=Math.max(0,last+2600-Date.now());if(d)await sleep(d);
 last=Date.now();
 const r=await fetch(host+path,{method:body?'POST':'GET',headers:{'Accept':'application/json','User-Agent':'PoE2VoicePrice/0.2 (targeted manual trade valuation)',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw new Error('trade HTTP '+r.status);
 return r.json();
}
const mk=(id,min)=>({id,value:{min}});
const mods=[mk('explicit.stat_2250533757',35),mk('explicit.stat_3299347043',90),mk('explicit.stat_3372524247',38),mk('explicit.stat_4220027924',35),mk('explicit.stat_2081918629',60)];
const cases=[
 {label:'five-stats-any-base-available',stats:mods},
 {label:'horror-movespeed-fire-cold-any-base',stats:mods.filter((_,i)=>i!==1)}
];
const clean=s=>typeof s==='string'?s:(s?.description||s?.text||JSON.stringify(s));
for(const c of cases){
 try{
  const query={status:{option:'available'},stats:[{type:'and',filters:c.stats}],filters:{type_filters:{filters:{rarity:{option:'rare'},category:{option:'armour.boots'}}}}};
  const resp=await call('/api/trade2/search/poe2/Forbidden%20Rites',{query,sort:{price:'asc'}});
  console.log('[ONEBOOT:SEARCH] '+JSON.stringify({case:c.label,total:resp.total,url:'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites/'+resp.id}));
  const offers=[];
  for(let i=0;i<Math.min(25,(resp.result||[]).length);i+=10){
   const ids=resp.result.slice(i,i+10).join(',');
   const fetched=await call('/api/trade2/fetch/'+ids+'?query='+encodeURIComponent(resp.id));
   for(const x of fetched.result||[]){
    if(!x.item)continue;
    const it=x.item;
    offers.push({name:it.name,type:it.baseType,price:x.listing?.price?.amount,cur:x.listing?.price?.currency,indexed:x.listing?.indexed,corrupt:!!it.corrupted,sockets:it.sockets,runicWard:(it.properties||[]).filter(p=>/Ward/i.test(p.name)),mods:(it.explicitMods||[]).map(clean),augments:(it.runeMods||[]).map(clean),enchant:(it.enchantMods||[]).map(clean)});
   }
  }
  console.log('[ONEBOOT:OFFERS] '+JSON.stringify({case:c.label,offers}));
 }catch(e){console.log('[ONEBOOT:ERROR] '+c.label+' '+e.message);break}
}
