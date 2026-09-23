import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readProductParts, queryProducts, formatProducts, PRODUCT_INDEX } from './product-sales.mjs';
import { plannerMessages, validatePlan } from './semantic-router.mjs';

const header = 'Producto,Bodega,Suma de Ventas $,Suma de Unidades,Año Mes\n';

test('comparison calculates groups, preserves missing values and rejects overlapping groups',()=>{
  const parts=[{id:'test.csv',content:header+'A,Local,10,2,2026-08\nB,Local,12,3,2026-08\nC,Local,20,4,2026-08\nA,Otro,100,20,2026-08\nA,Local,99,10,2025-08'}];
  const f={products:['A','B','C'],store:'Local',from:'2026-08',to:'2026-08',comparisonGroups:[[0,1],[2]]};
  const r=queryProducts(parts,f);
  assert.deepEqual(r.comparison.map(i=>i.units),[2,3,4]);
  assert.match(formatProducts(r),/5 unidades y \$22,00/);
  assert.match(formatProducts(r),/25%/);
  const missing=queryProducts(parts,{...f,products:['A','B','Falta']});
  assert.match(formatProducts(missing),/no se determina un ganador/);
  assert.throws(()=>queryProducts(parts,{...f,comparisonGroups:[[0,1],[1]]}));
  assert.throws(()=>queryProducts(parts,{...f,products:['A','a']}));
});
const sample = { id: 'ventas/productos_pdv/parte_001.csv', content: header + 'Copa Bogati,Latacunga Norte,4.50,2,2025-10\nCopa Bogati,Latacunga Sur,6.75,3,2025-10\nCopa Bogati,Quito,9,4,2025-10\n2 Copas Bogati,Latacunga Norte,10,2,2025-10' };

test('rankings respect place, period, metric and duplicate records',()=>{
  const f={ranking:true,product:null,metric:'units',limit:1,store:'Latacunga Norte',from:'2025-10',to:'2025-10'};
  const parts=[sample,{...sample,id:'copy.csv'}];
  const tied=queryProducts(parts,f);
  assert.equal(tied.ranking.length,2);
  assert.equal(tied.ranking[0].units,2);
  assert.equal(queryProducts(parts,{...f,metric:'revenue'}).ranking[0].product,'2 Copas Bogati');
  assert.equal(queryProducts(parts,{...f,store:null}).ranking[0].units,9);
  assert.match(formatProducts(tied,{parts:2}),/Carga parcial/);
  assert.match(queryProducts(parts,{...f,from:'2026-01',to:'2026-12'}).reply,/No hay registros de productos/);
  assert.throws(()=>queryProducts(parts,{...f,limit:0}));
});

test('city sums product across matching stores; exact PDV and combo remain separate', () => {
  const filter = { product:'Copa Bogati',store:'Latacunga',from:'2025-10',to:'2025-10' };
  const city = queryProducts([sample],filter);
  assert.equal(city.units,5); assert.equal(city.cents,1125); assert.equal(city.stores.length,2);
  assert.equal(queryProducts([sample],{...filter,store:'Latacunga Norte'}).units,2);
  assert.equal(queryProducts([sample],{...filter,product:'2 Copas Bogati'}).units,2);
});
test('identical overlap in future parts is counted once; conflicting values are rejected', () => {
  const repeated = {...sample,id:'ventas/productos_pdv/parte_002.csv'};
  assert.equal(readProductParts([sample,repeated]).rows.length,4);
  assert.equal(readProductParts([sample,repeated]).duplicates,4);
  assert.throws(()=>readProductParts([sample,{...repeated,content:repeated.content.replace('4.50,2','6.75,3')}]),/conflicto/);
});
test('missing records in partial deliveries do not become zero totals', () => {
  const result=queryProducts([sample],{product:'Crepe',store:'Latacunga',from:null,to:null});
  assert.ok(result.reply.includes('no significa'));assert.equal(result.units,undefined);
  assert.match(formatProducts(result,{parts:1}),/Carga parcial/);
  assert.match(formatProducts(result,{parts:1}),/Canal: no especificado/);
});
test('real delivery has expected dimensions and no duplicates', () => {
  const nodes=JSON.parse(fs.readFileSync(new URL('../data/brain-data.json',import.meta.url))).nodes;
  const part=nodes.find(n=>n.id==='ventas/productos_pdv/parte_001.csv');
  assert.ok(part);
  const data=readProductParts([part]);
  assert.equal(data.rows.length,4854);assert.equal(data.duplicates,0);
  assert.equal(new Set(data.rows.map(r=>r.product)).size,54);
  assert.equal(new Set(data.rows.map(r=>r.store)).size,189);
  assert.equal(data.rows.reduce((s,r)=>s+r.units,0),28723);
  assert.equal(data.rows.reduce((s,r)=>s+r.cents,0),12925059);
  assert.ok(!data.rows.some(r=>r.product==='Copa Bogati'));
  const plan={file:PRODUCT_INDEX,productSales:{product:'2 Copas Bogati',store:'Latacunga',from:'2025-10',to:'2025-10'},clarification:null};
  assert.equal(validatePlan(JSON.stringify(plan),nodes).productSales.product,'2 Copas Bogati');
  const messages=plannerMessages(nodes,'cuántas copas se vendieron en Latacunga');
  assert.ok(messages[0].content.includes('SÍ cruza productos'));
  assert.ok(Buffer.byteLength(JSON.stringify(messages))<14000);
});
