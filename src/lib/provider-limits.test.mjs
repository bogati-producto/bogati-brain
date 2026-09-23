import test from 'node:test';
import assert from 'node:assert/strict';
import {providers, queryProviders, retryDelay} from './chat-providers.mjs';
test('unconfirmed Groq and paid OpenRouter models are excluded',()=>{
 const list=providers([],{GROQ_API_KEY:'test',OPENROUTER_API_KEY:'test',OPENROUTER_MODEL:'paid/model',OPENROUTER_FALLBACK_MODEL:'openrouter/auto:free'});
 assert.ok(list.length);
 assert.ok(list.every(p=>p.name==='openrouter'&&(p.model==='openrouter/free'||p.model.endsWith(':free'))));
 assert.ok(!list.some(p=>p.model.includes('auto')||p.model==='paid/model'));
});
test('cooldown survives another query and permits a different provider',async()=>{
 const cooldownStore=new Map();let calls=0;
 const options=[{name:'openrouter',key:'test',model:'openrouter/free',url:'https://example.com'},{name:'groq',key:'test',model:'example',url:'https://example.com'}];
 const settings={cooldownStore,log(){},fetchImpl:async(url,request)=>{
  calls++;
  return JSON.parse(request.body).model==='openrouter/free'?new Response('{}',{status:429,headers:{'retry-after':'60'}}):new Response(JSON.stringify({choices:[{message:{content:'Respuesta'}}]}));
 }};
 assert.equal((await queryProviders([],options,settings)).attempts,2);
 const second=await queryProviders([],options,settings);
 assert.equal(second.attempts,1);assert.equal(calls,3);assert.equal(second.reply,'Respuesta');
});
test('Retry-After handles seconds and HTTP dates',()=>{
 assert.equal(retryDelay('28'),28000);
 assert.equal(retryDelay('Wed, 23 Sep 2026 12:00:30 GMT',Date.parse('2026-09-23T12:00:00Z')),30000);
});
