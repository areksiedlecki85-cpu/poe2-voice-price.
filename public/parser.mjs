export const aliases=[
{name:'Minion Critical Strike Damage',words:['minion critical strike damage','minion critical damage','minion crit damage','minion crit dmg','minion cdmg','crit dmg minion','obrazenia krytyczne minionow','kryt dmg minion'],want:['minion','critical','damage'],exclude:['chance']},
{name:'Minion Critical Strike Chance',words:['minion critical strike chance','minion crit chance','szansa na krytyka minionow'],want:['minion','critical','chance'],exclude:['damage']},
{name:'Minion Damage',words:['minion damage increased','increased minion damage','minion damage','minion dmg','obrazenia minionow'],want:['minion','damage'],exclude:['critical','crit']},
{name:'Companion Damage',words:['companions deal increased damage','companion increased damage','companion damage','companions damage','companion dmg','comp dmg','dmg companion','obrazenia kompanionow','damage kompanionow'],want:['companion','damage'],exclude:['minion']},
{name:'Increased Effect of Suffixes',words:['increased effect of suffixes','increase effect of suffixes','effect of suffixes','suffix effect','efekt sufiksow','moc sufiksow'],want:['effect','suffixes'],exclude:['prefixes']},
{name:'Minion Attack Speed',words:['minion attack speed','szybkosc ataku minionow'],want:['minion','attack','speed']},
{name:'Minion Skill Levels',words:['level of all minion skills','minion skill level','poziom minionow'],want:['level','minion']},
{name:'Spirit',words:['spirit','spirita'],want:['spirit']},
{name:'Reservation Efficiency',words:['reservation efficiency','efektywnosc rezerwacji'],want:['reservation','efficiency']},
{name:'Companion Reservation Efficiency',words:['reservation efficiency of companion skills','rezerwacja kompanionow'],want:['companion','reservation','efficiency']},
{name:'Maximum Life',words:['maximum life','max life','zycia'],want:['maximum','life']},
{name:'Cold Resistance',words:['cold resistance','cold res','odpornosc na zimno'],want:['cold','resistance']},
{name:'Lightning Resistance',words:['lightning resistance','lightning res','odpornosc na blyskawice'],want:['lightning','resistance']},
{name:'Fire Resistance',words:['fire resistance','fire res','odpornosc na ogien'],want:['fire','resistance']},
{name:'Chaos Resistance',words:['chaos resistance','chaos res','odpornosc chaos'],want:['chaos','resistance']},
{name:'All Attributes',words:['all attributes','wszystkie atrybuty'],want:['all','attributes']},
{name:'Item Rarity',words:['item rarity','rarity of items'],want:['rarity','items']},
{name:'Increased Energy Shield',words:['increased energy shield','energy shield increased'],want:['increased','energy','shield']}
];
const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/\s+/g,' ').trim();
const numbers={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,jeden:1,dwa:2,trzy:3,cztery:4,piec:5,szesc:6,siedem:7,osiem:8,dziewiec:9,dziesiec:10,dwadziescia:20,trzydziesci:30,czterdziesci:40,piecdziesiat:50};
function convert(s){return fold(s).replace(/\b[a-z]+\b/g,w=>numbers[w]===undefined?w:String(numbers[w])).replace(/\b(20|30|40|50|60|70|80|90) (\d)\b/g,(_,a,b)=>String(Number(a)+Number(b)))}
export function parseSpeech(raw){
 const text=convert(raw),category=/\b(jewel|jewels|klejnot)\b/.test(text)?'jewel':/\b(helmet|helm)\b/.test(text)?'armour.helmet':/\b(gloves|rekawice)\b/.test(text)?'armour.gloves':/\b(chest|body armour|klata)\b/.test(text)?'armour.chest':/\b(boots|buty)\b/.test(text)?'armour.boots':/\b(ring|pierscien)\b/.test(text)?'accessory.ring':'';
 const rarity=/\bmagic|magiczny\b/.test(text)?'magic':/\b(unique|unikat)\b/.test(text)?'unique':/\b(rare|rzadki)\b/.test(text)?'rare':'';
 const esMatch=text.match(/\b(?:es|energy shield)\s*(\d{2,5})\b|\b(\d{2,5})\s*(?:es|energy shield)\b/);
 const energyShield=esMatch?Number(esMatch[1]||esMatch[2]):null;
 const hits=[];
 for(const alias of aliases)for(const phrase of alias.words){const w=fold(phrase);let from=0;while(true){const at=text.indexOf(w,from);if(at<0)break;if((at===0||/[^a-z]/.test(text[at-1]))&&(at+w.length===text.length||/[^a-z]/.test(text[at+w.length])))hits.push({at,end:at+w.length,alias});from=at+w.length}}
 hits.sort((a,b)=>a.at-b.at||(b.end-b.at)-(a.end-a.at));
 const selected=[];for(const h of hits){if(!selected.some(x=>h.at<x.end&&h.end>x.at))selected.push(h)}
 selected.sort((a,b)=>a.at-b.at);
 const mods=selected.map((h,i)=>{
 const following=text.slice(h.end,selected[i+1]?.at??text.length);
 let match=following.match(/^\W*(?:increased|decreased|more|by|plus|o)?\s*([+-]?\d+(?:[.,]\d+)?)/);
 if(!match)match=text.slice(selected[i-1]?.end??0,h.at).match(/([+-]?\d+(?:[.,]\d+)?)\s*%?\s*$/);
 return {text:h.alias.name,min:match?Number(match[1].replace(',','.')):null};
 });
 return {category,rarity,energyShield,mods,recognized:mods.length>0||energyShield!==null};
}
export function rankCatalog(text,catalog){
 const alias=aliases.find(a=>a.name===text),desired=alias?.want||fold(text).split(' ').filter(Boolean),exclude=alias?.exclude||[];
 return (catalog||[]).map(c=>{
  const hay=fold(c.text),words=new Set(hay.replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean));
  const matched=desired.filter(w=>words.has(w)||hay.includes(w)).length;
  const bad=exclude.some(w=>words.has(w)||hay.includes(w));
  return {...c,score:matched/Math.max(1,desired.length)+(c.id.startsWith('explicit.')?.12:0)-(bad?1.5:0)};
 }).filter(x=>x.score>.48).sort((a,b)=>b.score-a.score||a.text.length-b.text.length).slice(0,14);
}
