import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {seed} from '../public/engine.mjs';
const dir=process.env.DATA_DIR||path.resolve('data');
const url=process.env.KV_REST_API_URL,token=process.env.KV_REST_API_TOKEN;
async function redis(...args){const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok)throw Error('No se pudo conectar al almacenamiento compartido.');const j=await r.json();if(j.error)throw Error(j.error);return j.result;}
let lock=Promise.resolve();
export async function transact(fn){const pending=lock.then(async()=>{
 if(process.env.VERCEL&&(!url||!token))throw Error('Configura KV_REST_API_URL y KV_REST_API_TOKEN para habilitar el almacenamiento compartido.');
 let raw;if(url&&token) raw=await redis('GET','bogati:state:v1');else{try{raw=await readFile(path.join(dir,'state.json'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const state=raw?JSON.parse(raw):{config:seed(),quotes:[],revision:0};
 const result=await fn(state);if(result.write){const old=raw||'';const next=JSON.stringify({...state,revision:state.revision+1});if(url&&token){const ok=await redis('EVAL',"local v=redis.call('GET',KEYS[1]); if (v or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1",1,'bogati:state:v1',old,next);if(ok!==1){const e=Error('Otra persona guardó cambios. Recarga y vuelve a intentar.');e.status=409;throw e;}}else{await mkdir(dir,{recursive:true});const temp=path.join(dir,'state.tmp');await writeFile(temp,next,'utf8');await rename(temp,path.join(dir,'state.json'));}}
 return result.value;
 });lock=pending.catch(()=>{});return pending;}
