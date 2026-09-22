import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveQuestion, NO_INFORMATION } from './brain-context.mjs';
import { providers, queryProviders, ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS } from './chat-providers.mjs';

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
