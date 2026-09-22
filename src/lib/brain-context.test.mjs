import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveQuestion, NO_INFORMATION } from './brain-context.mjs';
import { providers, queryProviders, ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS } from './chat-providers.mjs';
import { querySales, parseCsv, SALES_SOURCE } from './sales-query.mjs';
import { validatePlan } from './semantic-router.mjs';

const { nodes } = JSON.parse(fs.readFileSync(new URL('../data/brain-data.json', import.meta.url), 'utf8'));
test('routes real questions to canonical documents and retains complete laws', () => {
  for (const [question, file] of [
    ['ventas por local', 'ventas/ventas_por_pdv_historico.md'],
    ['margen de utilidad', 'finanzas/margenes_utilidad_productos.md'],
    ['receta de capuchino', 'procesos/recetas_postres_cafeteria_otros.md'],
    ['precio del waffle', 'marketing/menus_por_formato.md'],
    ['calibración de selladora', 'procesos/planta/calibracion_selladora.md'],
    ['teléfono de Quito', 'comercial/pdvs_directorio.md'],
  ]) {
    const result = resolveQuestion(nodes, question);
    assert.deepEqual(result.files, [file], question);
    assert.ok(result.messages[0].content.includes(nodes.find(n => n.id === 'LEYES_SUPREMAS.md').content));
    assert.ok(result.messages[1].content.includes(nodes.find(n => n.id === file).content));
  }
});
test('uses new index entries without code changes', () => {
  const updated = nodes.map(n => n.id === 'ROUTER.md' ? { ...n, content: n.content + '\n| Nuevo | Inventario | inventario | `nuevo.md` | Ana | 2026-09-22 |' } : n);
  updated.push({ id: 'nuevo.md', content: 'Inventario autorizado' });
  assert.deepEqual(resolveQuestion(updated, 'inventario').files, ['nuevo.md']);
});
test('unknown topics do not need an AI call; missing rules fail closed', () => {
  assert.equal(resolveQuestion(nodes, 'astronomía').reply, NO_INFORMATION);
  assert.throws(() => resolveQuestion(nodes.filter(n => n.id !== 'LEYES_SUPREMAS.md'), 'ventas'));
});

test('exact reported sales question qualifies for Groq and retains seven fallbacks', () => {
  const context = resolveQuestion(nodes, 'MEJOR PRODUCTO VENDIDO EN 2026');
  assert.deepEqual(context.files, ['ventas/ventas_productos_acumulado_2026.md']);
  const options = providers(context.messages, { GROQ_API_KEY: 'test', OPENROUTER_API_KEY: 'test' });
  assert.equal(options[0].name, 'groq');
  assert.equal(options.length, MAX_ATTEMPTS);
  assert.equal(ATTEMPT_TIMEOUT_MS, 15000);
  assert.equal(providers([{content:'a'.repeat(15000)}], {GROQ_API_KEY:'test',OPENROUTER_API_KEY:'test'}).length, 7);
});
test('provider 429 falls back and success stops further attempts', async () => {
  const options = providers([], {OPENROUTER_API_KEY:'test'});
  let calls = 0;
  const result = await queryProviders([], options, {log(){}, fetchImpl:async()=> {
    calls++;
    return calls === 1 ? new Response(JSON.stringify({error:{metadata:{provider_name:'upstream'}}}),{status:429})
      : new Response(JSON.stringify({choices:[{message:{content:'Respuesta'}}]}));
  }});
  assert.equal(calls,2);
  assert.equal(result.reply,'Respuesta');
  assert.equal(result.failures[0].kind,'rate_limit');
});
test('account cooldown is respected rather than retrying all free models', async () => {
  let calls=0;
  const result=await queryProviders([],providers([],{OPENROUTER_API_KEY:'test'}),{log(){},fetchImpl:async()=>{
    calls++;
    return new Response(JSON.stringify({error:{code:429}}),{status:429,headers:{'retry-after':'60','x-ratelimit-remaining':'0'}});
  }});
  assert.equal(calls,1);
  assert.equal(result.failures[0].accountRateLimit,true);
});
test('timeouts try all seven candidates and preserve diagnostics', async () => {
  let calls=0;
  const result=await queryProviders([],providers([],{OPENROUTER_API_KEY:'test'}),{log(){},fetchImpl:async()=>{
    calls++;
    throw new DOMException('Timed out','TimeoutError');
  }});
  assert.equal(calls,7);
  assert.ok(result.failures.every(f=>f.kind==='timeout'));
});

const csv = nodes.find(n => n.id === SALES_SOURCE).content;
test('Chillogallo totals reconcile to the independently prepared historical summary', () => {
  const result = querySales(csv, {store:'Chillogallo',from:null,to:null,groupBy:'year'});
  assert.equal(result.cents, 17872400);
  assert.equal(result.count,26);
  assert.equal(result.transactions,31527);
  assert.deepEqual(result.annual,[['2024',3227400],['2025',8457400],['2026',6187600]]);
  assert.equal(querySales(csv,{store:'Chillogallo',from:'2024-11',to:'2024-11'}).cents,540900);
  assert.equal(querySales(csv,{store:'Chillogallo',from:'2025-01',to:'2025-12'}).cents,8457400);
});
test('a city query aggregates its PDVs while a full store name stays specific', () => {
  const city = querySales(csv, {store:'Latacunga',from:'2026-08',to:'2026-08',groupBy:'month'});
  assert.equal(city.cents, 1167100);
  assert.equal(city.stores.length, 3);
  const specific = querySales(csv, {store:'Cotx Latacunga Sur Av. Quijano',from:'2026-02',to:'2026-02',groupBy:'month'});
  assert.equal(specific.cents, 273100);
  assert.equal(specific.stores.length, 1);
});
test('unknown and ambiguous stores and absent periods never become fabricated totals', () => {
  for (const filter of [{store:'Local inexistente',from:null,to:null},{store:'Quito',from:null,to:null},
    {store:'Chillogallo',from:'2030-01',to:'2030-12'}]) {
    const result=querySales(csv,filter);
    assert.ok(result.clarification);
    assert.equal(result.cents,undefined);
  }
});
test('CSV supports quoted fields and decimal cents; duplicate months fail closed', () => {
  const sample='RUC,Bodega,Año Mes,Ventas,Transacciones\n1,"Local, Uno",2025-01,$0.10,1\n1,"Local, Uno",2025-02,$0.20,2';
  assert.equal(parseCsv(sample)[1][1],'Local, Uno');
  assert.equal(querySales(sample,{store:'Local Uno',from:null,to:null}).cents,30);
  assert.throws(()=>querySales(sample+'\n1,"Local, Uno",2025-02,$0.20,2',{store:'Local Uno',from:null,to:null}),/duplicados/);
});
test('semantic plans can only select indexed paths and validated dates', () => {
  const plan={file:'ventas/ventas_por_pdv_historico.md',sales:{store:'Chillogallo',from:null,to:null,groupBy:'year'},clarification:null};
  assert.equal(validatePlan(JSON.stringify(plan),nodes).sales.store,'Chillogallo');
  assert.throws(()=>validatePlan(JSON.stringify({...plan,file:'../../secrets'}),nodes));
  assert.throws(()=>validatePlan(JSON.stringify({...plan,sales:{...plan.sales,from:'2024-99'}}),nodes));
  assert.throws(()=>validatePlan(JSON.stringify({...plan,sales:{...plan.sales,from:'2025-01',to:'2024-01'}}),nodes));
});
test('invalid structured responses are retried rather than treated as answers',async()=>{
  let calls=0;
  const result=await queryProviders([],providers([],{GROQ_API_KEY:'test'}),{log(){},validateReply:t=>validatePlan(t,nodes),fetchImpl:async()=>{
    calls++;
    return new Response(JSON.stringify({choices:[{message:{content:calls===1?'not JSON':'{"file":null,"sales":null,"clarification":null}'}}]}));
  }});
  assert.equal(calls,2);assert.ok(result.reply);
});
test('planner calendar dates normalize only when they cover complete months', () => {
  const plan={file:'ventas/ventas_por_pdv_historico.md',sales:{store:'Chillogallo',from:'2024-11-01',to:'2024-11-30',groupBy:'month'},clarification:null};
  const validated=validatePlan(JSON.stringify(plan),nodes);
  assert.equal(validated.sales.from,'2024-11');assert.equal(validated.sales.to,'2024-11');
  assert.equal(querySales(csv,validated.sales).cents,540900);
  assert.ok(validatePlan(JSON.stringify({...plan,sales:{...plan.sales,from:'2024-11-05'}}),nodes).clarification);
  assert.throws(()=>validatePlan(JSON.stringify({...plan,sales:{...plan.sales,to:'2024-11-31'}}),nodes));
});
