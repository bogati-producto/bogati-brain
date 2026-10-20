import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import handler from './api/index.mjs';
const root=path.resolve('public'),port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{if(req.url.startsWith('/api/'))return handler(req,res);try{const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,name);if(!file.startsWith(root+path.sep))throw Error();const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.mjs')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.end(data);}catch{res.statusCode=404;res.end('No encontrado');}}).listen(port,'127.0.0.1',()=>console.log(`Bogati HORECA: http://localhost:${port}`));
