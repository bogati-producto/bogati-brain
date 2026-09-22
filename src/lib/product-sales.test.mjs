import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readProductParts, queryProducts, formatProducts, PRODUCT_INDEX } from './product-sales.mjs';
import { plannerMessages, validatePlan } from './semantic-router.mjs';

const header = 'Producto,Bodega,Suma de Ventas $,Suma de Unidades,Año Mes\n';
const sample = { id: 'ventas/productos_pdv/parte_001.csv', content: header + 'Copa Bogati,Latacunga Norte,4.50,2,2025-10\nCopa Bogati,Latacunga Sur,6.75,3,2025-10\nCopa Bogati,Quito,9,4,2025-10\n2 Copas Bogati,Latacunga Norte,10,2,2025-10' };

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
