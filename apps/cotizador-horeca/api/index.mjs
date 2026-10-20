import {createHmac, timingSafeEqual,randomUUID} from 'node:crypto';
import {transact} from '../lib/store.mjs';
import {validateConfig,quoteSnapshot} from '../public/engine.mjs';
const secret=()=>process.env.APP_PASSWORD;
function signature(day){return createHmac('sha256',secret()).update('bogati:'+day).digest('hex');}
function authorized(req){if(!secret())return !process.env.VERCEL;const cookie=req.headers.cookie||'';const match=cookie.match(/(?:^|; )bogati_session=(\d+)\.([a-f0-9]{64})(?:;|$)/);if(!match)return false;const day=Number(match[1]);return Math.abs(Math.floor(Date.now()/86400000)-day)<=1&&timingSafeEqual(Buffer.from(match[2]),Buffer.from(signature(day)));}
async function body(req){if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){try{return JSON.parse(req.body);}catch{throw Error('Datos inválidos.');}}let s='';for await(const chunk of req){s+=chunk;if(s.length>1000000){const e=Error('El archivo es demasiado grande.');e.status=413;throw e;}}try{return JSON.parse(s);}catch{throw Error('Datos inválidos.');}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try{const route=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return send(403,{error:'Origen no permitido.'});
 if(route==='/api/login'&&req.method==='POST'){if(!secret())return send(503,{error:'El acceso del equipo no está configurado.'});const data=await body(req);const a=Buffer.from(String(data.password||'')),b=Buffer.from(secret());if(a.length!==b.length||!timingSafeEqual(a,b)){await new Promise(r=>setTimeout(r,700));return send(401,{error:'Clave incorrecta.'});}const day=Math.floor(Date.now()/86400000);res.setHeader('Set-Cookie',`bogati_session=${day}.${signature(day)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.VERCEL?'; Secure':''}`);return send(200,{ok:true});}
 if(!authorized(req))return send(401,{error:'Ingresa la clave del equipo para continuar.'});
 if(route==='/api/state'&&req.method==='GET')return send(200,await transact(s=>({value:{config:s.config,quotes:s.quotes,storage:process.env.KV_REST_API_URL?'shared':'local-server'}})));
 if(route==='/api/config'&&req.method==='PUT'){const c=await body(req);validateConfig(c);return send(200,await transact(s=>{if(c.revision!==s.config.revision){const e=Error('La configuración cambió en otro equipo. Recarga antes de guardar.');e.status=409;throw e;}s.config={...c,revision:c.revision+1,discounts:{enabled:false}};return {write:true,value:s.config};}));}
 if(route==='/api/quotes'&&req.method==='POST'){const d=await body(req);return send(201,await transact(s=>{if(d.configRevision!==s.config.revision){const e=Error('Los precios cambiaron. Actualiza antes de emitir.');e.status=409;throw e;}const q={...quoteSnapshot(s.config,d),id:randomUUID(),number:`BGT-${new Date().getUTCFullYear()}-${String(s.quotes.length+1).padStart(5,'0')}`,createdAt:new Date().toISOString()};s.quotes.unshift(q);return {write:true,value:q};}));}
 return send(404,{error:'Ruta no encontrada.'});
 }catch(e){send(e.status||400,{error:e.message||'No se pudo completar la operación.'});}
}
