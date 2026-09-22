import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveQuestion, NO_INFORMATION } from './brain-context.mjs';

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
