export const clone = x => JSON.parse(JSON.stringify(x));
export const cents = n => Math.round((n + Number.EPSILON) * 100);
export const money = n => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n / 100);
export const liters = n => new Intl.NumberFormat('es-EC', {maximumFractionDigits: 2}).format(n);
export function seed() {
 const premium = ['Kinder','Yogurt Durazno','Yogurt Mora','Chocobanana','Higos con Queso'];
 const traditional = ['Café','Chicle','Chocolate','Coco','Fresa','Galleta','Guanábana','Manjar','Maracuyá','Mora','Naranjilla','Ron Pasas','Vainilla'];
 return { revision: 1, iva: 15, business: 'Bogati · Helados de Paila', validity: 15, payment: 'Pago previo a la entrega.', categories: [{id:'trad', name:'Tradicional', price:3},{id:'prem',name:'Premium',price:3.5}], presentations: [{id:'p35',liters:3.5},{id:'p5',liters:5},{id:'p12',liters:12}], flavors:[...premium.map((name,i)=>({id:'f'+i,name,category:'prem'})),...traditional.map((name,i)=>({id:'t'+i,name,category:'trad'}))], cities:[{id:'amb',name:'Ambato',freight:17},{id:'qui',name:'Quito',freight:50},{id:'rio',name:'Riobamba',freight:70},{id:'sal',name:'Salcedo',freight:25},{id:'lat',name:'Latacunga',freight:30},{id:'gye',name:'Guayaquil',freight:30}], ranges:[20,30,50,80,100,150,200].map((min,i)=>({id:'r'+i,min})), discounts:{enabled:false} };
}
export function validateConfig(c) {
 if (!c || !Number.isFinite(c.iva) || c.iva<0 || c.iva>100) throw Error('El IVA debe estar entre 0 y 100.');
 if(typeof c.business !== 'string' || !c.business.trim() || c.business.length>120) throw Error('Escribe un nombre comercial válido.');
 if(!Number.isInteger(c.validity)||c.validity<1||c.validity>365) throw Error('La vigencia debe ser de 1 a 365 días.');
 if(typeof c.payment!=='string'||c.payment.length>1000) throw Error('Revisa las condiciones de pago.');
 for(const key of ['categories','presentations','flavors','cities','ranges']) {
  if(!Array.isArray(c[key])||!c[key].length||c[key].length>500) throw Error('Debe existir al menos un registro en '+key+'.');
  const ids=new Set(); for(const x of c[key]){if(typeof x.id!=='string'||!x.id||ids.has(x.id))throw Error('Identificadores duplicados o inválidos.');ids.add(x.id);}
 }
 for(const x of [...c.categories,...c.flavors,...c.cities]) if(typeof x.name!=='string'||!x.name.trim()||x.name.length>100)throw Error('Todos los nombres son obligatorios (máximo 100 caracteres).');
 for(const x of c.categories) if(!Number.isFinite(x.price)||x.price<=0||x.price>10000)throw Error('El precio por litro debe ser mayor a cero.');
 for(const x of c.presentations) if(!Number.isFinite(x.liters)||x.liters<=0||x.liters>1000)throw Error('Las presentaciones deben tener litros mayores a cero.');
 if(new Set(c.presentations.map(x=>x.liters)).size!==c.presentations.length)throw Error('Hay presentaciones repetidas.');
 for(const x of c.flavors)if(!c.categories.some(y=>y.id===x.category))throw Error('Hay sabores sin categoría válida.');
 for(const x of c.cities)if(!Number.isFinite(x.freight)||x.freight<0||x.freight>100000)throw Error('El flete debe ser cero o positivo.');
 const ranges=[...c.ranges].sort((a,b)=>a.min-b.min);
 if(ranges[0].min!==20||new Set(ranges.map(x=>x.min)).size!==ranges.length||ranges.some(x=>!Number.isInteger(x.min)||x.min<20||x.min>100000))throw Error('Los rangos deben empezar en 20 L, ser enteros y no repetirse.');
 return true;
}
export function rangeLabel(range, ranges){const sorted=[...ranges].sort((a,b)=>a.min-b.min);const next=sorted[sorted.findIndex(x=>x.id===range.id)+1];return next?`${range.min}–<${next.min} L`:`${range.min}+ L`;}
function allocate(total, weights){const sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map(()=>0);const raw=weights.map(x=>total*x/sum),out=raw.map(Math.floor);let left=total-out.reduce((a,b)=>a+b,0);const order=raw.map((x,i)=>({i,r:x-out[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);for(let i=0;i<left;i++)out[order[i].i]++;return out;}
export function calculate(c,d){
 validateConfig(c);
 if(!Array.isArray(d.items)||d.items.length>200)throw Error('Revisa los productos del pedido.');
 if(!['none','fixed','spread'].includes(d.logistics))throw Error('Selecciona una modalidad de logística válida.');
 const rows=d.items.map(it=>{const f=c.flavors.find(x=>x.id===it.flavor),p=c.presentations.find(x=>x.id===it.presentation);if(!f||!p)throw Error('Un producto cambió en Configuración. Vuelve a seleccionarlo.');if(!Number.isInteger(it.qty)||it.qty<1||it.qty>10000)throw Error('La cantidad de baldes debe ser un entero entre 1 y 10.000.');const cat=c.categories.find(x=>x.id===f.category),volume=p.liters*it.qty;return {flavor:f.name,category:cat.name,liters:p.liters,qty:it.qty,volume,base:cat.price*volume};});
 const volume=rows.reduce((s,r)=>s+r.volume,0),ranges=[...c.ranges].sort((a,b)=>a.min-b.min),range=ranges.filter(x=>x.min<=volume).at(-1),city=c.cities.find(x=>x.id===d.city);
 if(d.logistics!=='none'&&!city)throw Error('Selecciona una ciudad de entrega.');
 const freight=cents(d.logistics==='none'||(d.logistics==='spread'&&!range)?0:city.freight*(d.logistics==='spread'?volume/range.min:1));
 const productNet=cents(rows.reduce((s,r)=>s+r.base,0)),productGross=cents(productNet/100*(1+c.iva/100));
 const nets=allocate(productNet,rows.map(r=>r.base)),grosses=allocate(productGross,rows.map(r=>r.base)),logs=d.logistics==='spread'?allocate(freight,rows.map(r=>r.volume)):rows.map(()=>0);
 const logNets=d.logistics==='spread'?allocate(cents(freight/100/(1+c.iva/100)),rows.map(r=>r.volume)):rows.map(()=>0);
 rows.forEach((r,i)=>{r.productNet=nets[i];r.productGross=grosses[i];r.freight=logs[i];r.gross=grosses[i]+logs[i];r.net=nets[i]+logNets[i];r.unit=r.gross/r.qty;});
 const total=productGross+freight,net=productNet+cents(freight/100/(1+c.iva/100));
 const nextRange=range?ranges.find(x=>x.min>range.min):null;
 const volumePrices=d.logistics==='spread'&&range?c.categories.filter(cat=>rows.some(r=>r.category===cat.name)).map(cat=>({category:cat.name,net:cents(cat.price+city.freight/range.min/(1+c.iva/100)),gross:cents(cat.price*(1+c.iva/100)+city.freight/range.min),nextGross:nextRange?cents(cat.price*(1+c.iva/100)+city.freight/nextRange.min):null})):[];
 return {rows,volume,range:range?rangeLabel(range,c.ranges):null,rangeMin:range?.min,city:city?.name||'',freight,freightBase:cents(city?.freight||0),rate:d.logistics==='spread'&&range?city.freight/range.min:0,productNet,productGross,net,tax:total-net,total,valid:volume>=20&&rows.length>0,iva:c.iva,mode:d.logistics,volumePrices,nextRangeMin:nextRange?.min||null};
}
export function quoteSnapshot(c,d){const result=calculate(c,d);if(!result.valid)throw Error('El pedido mínimo es de 20 litros.');const details={};for(const key of ['client','taxId','seller','contact','payment','notes']){if(typeof d[key]!=='string'||d[key].length>2000)throw Error('Revisa los datos de la cotización.');details[key]=d[key].trim();}if(!Number.isInteger(d.validity)||d.validity<1||d.validity>365)throw Error('Revisa la vigencia de la cotización.');return {business:c.business,configRevision:c.revision,details:{...details,validity:d.validity,anonymous:!!d.anonymous},result};}
