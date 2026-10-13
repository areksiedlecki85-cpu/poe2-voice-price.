// Price estimates use real asking prices returned by PoE Trade; never fabricate listings.
function normalize(str){return String(str||'').toLowerCase().replace(/[#%+()—–-]|\d+(?:[.,]\d+)?/g,' ').replace(/[^a-ząćęłńóśźż ]/gi,' ').replace(/\s+/g,' ').trim()}
function similarity(a,b){const A=new Set(a.split(' ').filter(Boolean)),B=new Set(b.split(' ').filter(Boolean));return [...A].filter(w=>B.has(w)).length/Math.max(A.size,B.size,1)}
export function resolveStat(mod,catalog){
  if(mod?.id){const s=catalog.find(x=>x.id===mod.id);return s?{id:s.id,text:s.text}:null}
  const query=normalize(mod?.text);if(!query)return null;
  const matches=catalog.map(s=>({s,score:similarity(query,normalize(s.text))})).sort((a,b)=>b.score-a.score);
  return matches[0]?.score>=.83&&(!matches[1]||matches[0].score-matches[1].score>.075)?{id:matches[0].s.id,text:matches[0].s.text}:null;
}
export function buildQuery({itemType='',rarity='',category='',energyShield=null,mods=[],multiplier=1}){
  const query={status:{option:'available'},stats:[]};
  if(itemType)query.type=itemType;
  const filters={};if(rarity||category){const f={};if(rarity)f.rarity={option:rarity};if(category)f.category={option:category};filters.type_filters={filters:f};}
  if(Number(energyShield)>0)filters.armour_filters={filters:{es:{min:Math.ceil(Number(energyShield)*multiplier)}}};
  if(Object.keys(filters).length)query.filters=filters;
  const rows=mods.filter(x=>x.id).map(x=>({id:x.id,...(x.min!=null?{value:{min:Math.round(x.min*multiplier*100)/100}}:{})}));
  if(rows.length)query.stats=[{type:'and',filters:rows}];
  return {query,matched:rows};
}
export function estimateListings(entries){
 const listings=(entries||[]).map(x=>{const p=x?.listing?.price||{};return {
  id:String(x.id||''),name:[x.item?.name,x.item?.typeLine].filter(Boolean).join(' ')||x.item?.baseType||'Przedmiot',
  amount:Number(p.amount)||0,currency:String(p.currency||''),
  mods:[...(x.item?.explicitMods||[]),...(x.item?.implicitMods||[]),...(x.item?.enchantMods||[])].slice(0,10)
 };}).filter(x=>x.amount>0&&x.currency);
 const currencies={'divine':'divine','divine orb':'divine','exalted':'exalted','exalted orb':'exalted','chaos':'chaos','chaos orb':'chaos'};
 const pools=new Map();
 for(const row of listings.slice(0,20)){
  const currency=currencies[row.currency.toLowerCase()];
  if(!currency)continue;
  if(!pools.has(currency))pools.set(currency,[]);
  pools.get(currency).push(row.amount);
 }
 // Currencies are NOT converted without a live exchange rate. Prefer the currency
 // represented by the earliest (cheapest) listings, only with >=3 actual quotes.
 const groups=[...pools.entries()].filter(([,prices])=>prices.length>=3);
 let estimate=null;
 if(groups.length){
  const [currency,all]=groups[0];
  const prices=all.sort((a,b)=>a-b).slice(0,8);
  const n=prices.length,median=(prices[Math.floor((n-1)/2)]+prices[Math.floor(n/2)])/2;
  estimate={currency,median,minimum:prices[0],maximum:prices[n-1],count:n};
 }
 return {listings:listings.slice(0,20),estimate};
}
