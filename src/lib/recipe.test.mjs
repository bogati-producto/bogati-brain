import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findRecipe} from './brain-context.mjs';
const nodes=JSON.parse(fs.readFileSync(new URL('../data/brain-data.json',import.meta.url))).nodes;
test('recipe lookup finds actual recipe instead of the general equipment manual',()=>{
 const r=findRecipe(nodes,'receta del waffle bogati');
 assert.deepEqual(r.files,['procesos/recetas_postres_cafeteria_otros.md']);
 assert.match(r.reply,/RECETA No\. 019/);
 assert.match(r.reply,/160 Gramos/);
 assert.doesNotMatch(r.reply,/RECETA No\. 020/);
 assert.match(findRecipe(nodes,'receta de masa waffle bogati').reply,/RECETA No\. 072/);
 assert.equal(findRecipe(nodes,'precio del waffle bogati'),null);
 assert.equal(findRecipe(nodes,'receta del producto inexistente'),null);
 assert.equal(findRecipe(nodes,'receta'),null);
});
