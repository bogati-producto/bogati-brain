import {execFileSync} from 'node:child_process';
for(const f of ['public/engine.mjs','public/catalog.mjs','public/app.mjs','server.mjs','api/index.mjs','lib/store.mjs'])execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
console.log('Archivos de la aplicación verificados.');
