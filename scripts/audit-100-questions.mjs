import fs from 'node:fs';
import {parseCsv} from '../src/lib/sales-query.mjs';
const nodes=JSON.parse(fs.readFileSync('src/data/brain-data.json')).nodes;
// Independent aggregation oracle: does not call queryProducts or the planner.
const unique=new Map();
for(const n of nodes.filter(n=>/^ventas\/productos_pdv\/parte_.*csv$/.test(n.id))){
 for(const [product,store,money,units,month] of parseCsv(n.content).slice(1)){
  const key=JSON.stringify([product,store,month]),row={product,store,month,units:Number(units),cents:Math.round(Number(money)*100)};
  if(unique.has(key)&&JSON.stringify(unique.get(key))!==JSON.stringify(row))throw Error('Conflicting data');
  unique.set(key,row);
 }
}
const rows=[...unique.values()], norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=n=>n.toLocaleString('es-EC',{maximumFractionDigits:2});
const money=c=>(c/100).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const selected=(place,month)=>rows.filter(r=>(!month||r.month===month)&&norm(place).split(' ').every(w=>norm(r.store).split(' ').includes(w)));
const total=rs=>({units:rs.reduce((s,r)=>s+r.units,0),cents:rs.reduce((s,r)=>s+r.cents,0)});
const cases=[];
const products=['Vaso Atenea','Vaso Hades','Vaso Zeus','Copa Bogati','Waffle Bogati'];
for(const product of products)for(const place of ['Quito','Latacunga','Chillogallo','Shopping Ambato'])for(const month of ['2025-10','2026-01','2026-08']){
 const rs=selected(place,month).filter(r=>r.product===product),t=total(rs);
 cases.push({kind:'product',question:`¿Cuántas unidades y cuántos dólares se vendieron de ${product} en ${place} en ${month}?`,expected:{...t,records:rs.length},check:reply=>rs.length?reply.includes(num(t.units)+' unidades')&&reply.includes('$'+money(t.cents)): /no hay registros|no encuentro/i.test(reply)});
}
for(const place of ['Quito','Latacunga','Chillogallo','Shopping Ambato','Riobamba'])for(const metric of ['units','cents']){
 const rs=selected(place,'2026-08'),sums=new Map();for(const r of rs){const t=sums.get(r.product)||{units:0,cents:0};t.units+=r.units;t.cents+=r.cents;sums.set(r.product,t);}
 const winner=[...sums].sort((a,b)=>b[1][metric]-a[1][metric])[0];
 cases.push({kind:'ranking',question:`¿Cuál fue el producto con ${metric==='units'?'más unidades vendidas':'mayor facturación en dólares'} en ${place} en agosto de 2026?`,expected:winner,check:r=>r.includes(winner[0])&&r.includes(num(winner[1].units))&&r.includes(money(winner[1].cents))});
}
for(const place of ['Quito','Latacunga','Chillogallo','Shopping Ambato','Riobamba'])for(const month of ['2026-01','2026-08']){
 const totals=products.slice(0,3).map(p=>({product:p,...total(selected(place,month).filter(r=>r.product===p)),records:selected(place,month).filter(r=>r.product===p).length}));
 cases.push({kind:'comparison',question:`Compara Vaso Atenea y Vaso Hades vs Vaso Zeus en ${place}, ${month}, unidades y ventas.`,expected:totals,check:r=>totals.every(t=>t.records?r.includes(t.product)&&r.includes(num(t.units))&&r.includes(money(t.cents)):/incompleta|no hay registros|no encuentro/i.test(r))});
}
const recipeFiles=nodes.filter(n=>n.id.startsWith('procesos/recetas'));
const recipes=recipeFiles.flatMap(n=>[...n.content.matchAll(/^### RECETA[^\n]* - (.+)$/gm)].map(m=>({file:n.id,title:m[1].trim(),heading:m[0]}))).slice(0,10);
for(const r of recipes)cases.push({kind:'recipe',question:`receta de ${r.title}`,expected:r,check:s=>s.includes(r.heading)&&s.includes(r.file)});
for(const place of ['Quito','Latacunga','Chillogallo','Shopping Ambato','Riobamba']){
 cases.push({kind:'missing',question:`¿Cuántas unidades del producto Helado Marciano XYZ999 se vendieron en ${place} en agosto 2026?`,expected:'Missing product, never zero',check:r=>/no encuentro|no hay registros|no tengo/i.test(r)&&!/\b0 unidades/.test(r)});
 cases.push({kind:'daily',question:`¿Cuántos Vaso Atenea se vendieron en ${place} el 21 de agosto de 2026?`,expected:'Monthly granularity clarification',check:r=>/mensual|meses completos|días específicos|diari/i.test(r)&&!r.includes('unidades registradas')});
}
if(cases.length!==100)throw Error(`Expected 100, got ${cases.length}`);
fs.mkdirSync('artifacts',{recursive:true});
const output='artifacts/audit-100-paced.json',results=[];let cursor=0;
const started=new Date().toISOString();
async function worker(){while(cursor<cases.length){const index=cursor++,c=cases[index],start=Date.now();let status,reply='',error;
 try{const r=await fetch('http://127.0.0.1:3000/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:c.question}),signal:AbortSignal.timeout(125000)});status=r.status;reply=(await r.json()).reply||'';}catch(e){error=e.message;}
 const pass=status===200&&c.check(reply);
 results.push({number:index+1,kind:c.kind,question:c.question,expected:c.expected,status,ms:Date.now()-start,pass,reply,error});
 fs.writeFileSync(output,JSON.stringify({started,updated:new Date().toISOString(),completed:results.length,passed:results.filter(r=>r.pass).length,results:[...results].sort((a,b)=>a.number-b.number)},null,2));
 if(results.length%5===0||!pass)console.log(JSON.stringify({completed:results.length,passed:results.filter(r=>r.pass).length,last:index+1,status,pass,ms:Date.now()-start,...(!pass?{question:c.question,reply:reply.slice(0,500)}:{})}));
 if(status!==200){console.log('Stopped: service unavailable; preserve quota.');break;}
 if(cursor<cases.length)await new Promise(resolve=>setTimeout(resolve,60000));
}}
await worker();
console.log('Finished: '+output);
