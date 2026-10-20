import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseConfigured,supabaseTransaction} from '../lib/supabase-store.mjs';
import {seed} from '../public/engine.mjs';
const originalFetch=globalThis.fetch;
test('Supabase server adapter: authorization, snapshots, concurrency and safe errors',async t=>{
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,oldRole=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{
 await t.test('Reads seed and state using server-only apikey',async()=>{assert.equal(supabaseConfigured(),true);globalThis.fetch=async(url,options)=>{assert.match(url,/horeca_read_state$/);assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);assert.deepEqual(JSON.parse(options.body).p_initial_config,seed());return {ok:true,json:async()=>({config:seed(),quotes:[],revision:2})};};const value=await supabaseTransaction(s=>({value:s.revision}),seed());assert.equal(value,2);});
 await t.test('Writes only new documents with expected revision',async()=>{let calls=0;globalThis.fetch=async(url,options)=>{calls++;if(calls===1)return {ok:true,json:async()=>({config:seed(),quotes:[{id:'old'}],revision:7})};assert.match(url,/horeca_commit_state$/);const body=JSON.parse(options.body);assert.equal(body.p_expected_revision,7);assert.deepEqual(body.p_new_quotes,[{id:'new'}]);return {ok:true,json:async()=>true};};await supabaseTransaction(s=>{s.quotes.unshift({id:'new'});return {write:true,value:'ok'};},seed());assert.equal(calls,2);});
 await t.test('Conflicting changes reject without pretending save succeeded',async()=>{let count=0;globalThis.fetch=async()=>({ok:true,json:async()=>++count===1?{config:seed(),quotes:[],revision:1}:false});await assert.rejects(()=>supabaseTransaction(()=>({write:true,value:'no'}),seed()),e=>e.status===409);});
 await t.test('Database errors do not expose secrets or provider responses',async()=>{globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({secret:'never show'})});await assert.rejects(()=>supabaseTransaction(()=>({}),seed()),e=>e.status===503&&!e.message.includes('never show'));});
 }finally{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({SUPABASE_URL:oldUrl,SUPABASE_SECRET_KEY:oldKey,SUPABASE_SERVICE_ROLE_KEY:oldRole})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
