/**
 * Pure calculator used by the manual Market Hunter price-check form.
 * No real-time auction search: this compares a seller's asking price to a reference.
 */
export function parseDivine(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const norm=String(value).trim().replace(/\s/g,'').replace(',','.');
 if(!/^\d+(?:\.\d+)?$/.test(norm))return null;
 const n=Number(norm);
 return Number.isFinite(n)&&n>0?n:null;
}
export function evaluateAuction({name,ask,reference,minimumDiscount=35,listingCount=null}={}){
 const item=String(name||'').trim();
 const price=parseDivine(ask),market=parseDivine(reference);
 if(!item)return {ok:false,error:'Podaj nazwę przedmiotu lub wybierz ją z listy.'};
 if(price===null)return {ok:false,error:'Podaj poprawną cenę aukcji w divine (np. 65 lub 65,5).'};
 if(market===null)return {ok:false,error:'Podaj cenę referencyjną w divine lub wybierz przedmiot z pobranej listy.'};
 const percent=Math.round((1-price/market)*10000)/100;
 const difference=Math.round((market-price)*100)/100;
 const significant=percent>=minimumDiscount-0.00001;
 const sampleOk=listingCount!==null&&Number(listingCount)>=5;
 return {
  ok:true,item,price,market,discountPercent:percent,difference,
  status:significant?(sampleOk?'candidate':'review'):'below-threshold',
  sampleOk,
  note:significant?'Cena jest co najmniej '+minimumDiscount+'% niższa od referencji. Przed zakupem sprawdź rolle, sockety, corruption i aktualność aukcji.':'Oferta nie spełnia progu '+minimumDiscount+'% przeceny.'
 };
}
