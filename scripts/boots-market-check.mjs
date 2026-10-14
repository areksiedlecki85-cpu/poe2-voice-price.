// One-shot manual boots valuation; no persistent scanning.
const host='https://www.pathofexile.com',league='Forbidden%20Rites',wait=ms=>new Promise(r=>setTimeout(r,ms));
let last=0,requests=0;
async function req(path,body=null){
 const delay=Math.max(0,2300-(Date.now()-last));if(delay)await wait(delay);
 last=Date.now();requests++;
 const headers={'User-Agent':'PoE2VoicePrice/0.2 (single item market comparison)','Accept':'application/json'};
 if(body)headers['Content-Type']='application/json';
 const res=await fetch(host+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(19000)});
 if(!res.ok){const e=new Error('HTTP '+res.status);e.status=res.status;e.retry=res.headers.get('retry-after');throw e}
 return res.json();
}
function norm(t){return String(typeof t==='string'?t:t?.description||t?.text||JSON.stringify(t)).replace(/\[[^\]|]+\|([^\]]+)\]/g,'$1').replace(/\s+/g,' ').trim()}
const hits=[],stat=[];
try{
 const stats=await req('/api/trade2/data/stats');
 for(const g of stats.result||[])for(const x of g.entries||[])stat.push({...x,group:g.label});
 const terms=['increased Movement Speed','to maximum Life','to Fire Resistance','to Cold Resistance','Effect of Socketed Augment Items','Runic Ward','to Evasion Rating'];
 for(const t of terms){const match=stat.filter(x=>norm(x.text).toLowerCase().includes(t.toLowerCase())&&(x.id.startsWith('explicit.')||x.id.startsWith('rune.')||x.id.startsWith('enchant.')||x.id.startsWith('implicit.'))).slice(0,12);console.log('[BOOTS:STAT] '+t+' '+JSON.stringify(match.map(x=>({id:x.id,text:norm(x.text)}))))}
 const first=t=>stat.find(x=>x.id.startsWith('explicit.')&&norm(x.text).toLowerCase()===t.toLowerCase());
 const move=first('#% increased Movement Speed'),life=first('# to maximum Life'),fire=first('#% to Fire Resistance'),cold=first('#% to Cold Resistance');
 const augment=stat.filter(x=>norm(x.text).toLowerCase().includes('effect of socketed augment items')).slice(0,20);
 console.log('[BOOTS:CHOICE] '+JSON.stringify({move,life,fire,cold,augment}));
 if(!move||!life||!fire||!cold)throw new Error('Missing main filters');
 const horror={id:'explicit.stat_2081918629'};
 const groups=[
  {key:'same-base-Horror-35move-life2res',base:'Runeforged Daggerfoot Shoes',mods:[[move,35],[life,90],[fire,38],[cold,35],[horror,60]]},
  {key:'any-base-Horror-35move-life2res',mods:[[move,35],[life,90],[fire,38],[cold,35],[horror,60]]},
  {key:'same-base-Horror-35move-life',base:'Runeforged Daggerfoot Shoes',mods:[[move,35],[life,90],[horror,60]]},
  {key:'any-base-Horror-35move-2res',mods:[[move,35],[fire,38],[cold,35],[horror,60]]}
 ];
 for(const c of groups){
  const query={status:{option:'available'},...c.base?{type:c.base}:{},stats:[{type:'and',filters:c.mods.map(([x,min])=>({id:x.id,value:{min}}))}],filters:{type_filters:{filters:{rarity:{option:'rare'}}}}};
  try{
   const search=await req('/api/trade2/search/poe2/'+league,{query,sort:{price:'asc'}});
   console.log('[BOOTS:SEARCH] '+JSON.stringify({key:c.key,count:search.total,url:'https://www.pathofexile.com/trade2/search/poe2/'+league+'/'+search.id}));
   const ids=(search.result||[]).slice(0,15);let offers=[];
   for(let i=0;i<ids.length;i+=10){
    try{
     const fetchResult=await req('/api/trade2/fetch/'+ids.slice(i,i+10).map(encodeURIComponent).join(',')+'?query='+encodeURIComponent(search.id));
     for(const x of fetchResult.result||[]){
      if(!x.item)continue;
      const it=x.item,p=x.listing?.price||{};
      offers.push({id:x.id,p:p.amount,cur:p.currency,base:it.baseType,name:it.name,corrupt:!!it.corrupted,mods:(it.explicitMods||[]).map(norm),aug:(it.runeMods||[]).map(norm),ench:(it.enchantMods||[]).map(norm),implicit:(it.implicitMods||[]).map(norm),def:it.defences,quality:it.properties,listed:x.listing?.indexed});
     }
    }catch(e){console.log('[BOOTS:FETCHERR] '+c.key+' '+e.message);if(e.status===429)throw e;}
   }
   console.log('[BOOTS:OFFERS] '+JSON.stringify({key:c.key,offers}));
  }catch(e){console.log('[BOOTS:ERROR] '+c.key+' '+e.message+' retry='+e.retry);if(e.status===429)break}
 }
}catch(e){console.log('[BOOTS:FATAL] '+e.message+' requests='+requests)}
