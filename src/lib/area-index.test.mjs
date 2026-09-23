import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAreaIndex,areaHints,resolveQuestion} from './brain-context.mjs';
const nodes=JSON.parse(fs.readFileSync(new URL('../data/brain-data.json',import.meta.url))).nodes;
test('area index locates sections within router-authorized files and corrects a wrong sibling',()=>{
 const index=buildAreaIndex(nodes);
 const recipes=index.find(a=>a.files.includes('procesos/recetas_postres_cafeteria_otros.md'));
 assert.ok(recipes.documents.some(d=>d.sections.some(s=>s.title.includes('019 - WAFFLE BOGATI'))));
 assert.match(areaHints(nodes,'receta waffle bogati'),/recetas_postres_cafeteria_otros/);
 assert.deepEqual(resolveQuestion(nodes,'receta waffle bogati','procesos/recetas_instructivo.md').files,['procesos/recetas_postres_cafeteria_otros.md']);
 const added=[...nodes,{id:'unlisted.md',content:'# WAFFLE SECRETO'}];
 assert.ok(!buildAreaIndex(added).some(a=>a.files.includes('unlisted.md')));
 assert.throws(()=>buildAreaIndex(nodes.filter(n=>n.id!=='procesos/recetas_instructivo.md')),/ausente/);
});
