export function supabaseConfigured(){return !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);}
async function rpc(name,payload){
 const url=process.env.SUPABASE_URL.replace(/\/$/,'');
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const headers={'Content-Type':'application/json',apikey:key};
 // Legacy service-role JWTs use Authorization. New secret keys use apikey only.
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 if(!response.ok){const code=response.status;const e=Error(code===401||code===403?'Revisa la clave privada y los permisos de Supabase en Vercel.':code===404?'Falta ejecutar el script de instalación del cotizador en Supabase.':'No se pudo guardar o leer la información de Supabase. Intenta nuevamente.');e.status=503;throw e;}
 return response.json();
}
export async function supabaseTransaction(fn,initialConfig){
 const state=await rpc('horeca_read_state',{p_initial_config:initialConfig});
 if(!state||!state.config||!Array.isArray(state.quotes)||!Number.isInteger(state.revision))throw Error('La respuesta de almacenamiento no es válida.');
 const revision=state.revision,existing=new Set(state.quotes.map(q=>q.id));
 const result=await fn(state);
 if(result.write){const committed=await rpc('horeca_commit_state',{p_expected_revision:revision,p_config:state.config,p_new_quotes:state.quotes.filter(q=>!existing.has(q.id))});if(committed!==true){const e=Error('Otra persona guardó cambios. Actualiza antes de volver a intentar. Tu edición no se ha perdido.');e.status=409;throw e;}}
 return result.value;
}
