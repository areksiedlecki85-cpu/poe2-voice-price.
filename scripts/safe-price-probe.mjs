const base = 'https://poe.ninja';
const agent = 'PoE2MarketHunter/0.1 (contact: https://github.com/areksiedlecki85-cpu/poe2-voice-price.)';
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function request(path){
  const response=await fetch(base+path,{headers:{'Accept':'application/json','User-Agent':agent},signal:AbortSignal.timeout(12000),redirect:'error'});
  const meta={status:response.status,kind:response.headers.get('content-type'),cache:response.headers.get('cache-control'),etag:!!response.headers.get('etag'),retryAfter:response.headers.get('retry-after')};
  if(response.status===429){console.log('[HUNTER:PROBE] throttled '+JSON.stringify(meta));return {meta};}
  if(!response.ok||!String(meta.kind||'').includes('application/json')){console.log('[HUNTER:PROBE] unavailable '+JSON.stringify(meta));return {meta};}
  const data=await response.json();return {meta,data};
}
async function probe(){
 try{
  const leagues=await request('/poe2/api/economy/leagues');
  const list=Array.isArray(leagues.data)?leagues.data:[];
  console.log('[HUNTER:PROBE] leagues '+JSON.stringify({meta:leagues.meta,count:list.length,ids:list.map(x=>x.id).slice(0,15)}));
  const league=list.find(x=>String(x.id).toLowerCase()==='forbidden rites');
  if(!league){console.log('[HUNTER:PROBE] STOP: requested league is not listed; no further requests');return;}
  await wait(1700);
  const s=await request('/poe2/api/economy/stash/current/item/overview?league='+encodeURIComponent(league.id)+'&type=UniqueWeapons');
  const rows=Array.isArray(s.data?.lines)?s.data.lines:[];
  console.log('[HUNTER:PROBE] stash '+JSON.stringify({meta:s.meta,count:rows.length,keys:rows[0]?Object.keys(rows[0]).slice(0,20):[],core:s.data?.core?{primary:s.data.core.primary,secondary:s.data.core.secondary}:null,hasSylvan:rows.some(r=>String(r.name).toLowerCase().includes('sylvan'))}));
  if(s.meta.status!==200)return;
  await wait(1700);
  const c=await request('/poe2/api/economy/exchange/current/overview?league='+encodeURIComponent(league.id)+'&type=Currency');
  const cur=Array.isArray(c.data?.lines)?c.data.lines:[];
  console.log('[HUNTER:PROBE] currency '+JSON.stringify({meta:c.meta,count:cur.length,keys:cur[0]?Object.keys(cur[0]).slice(0,12):[],core:c.data?.core?{primary:c.data.core.primary,secondary:c.data.core.secondary}:null}));
 }catch(e){console.log('[HUNTER:PROBE] ERROR '+e.message);}
}
await probe();
