export const regionColors=['#bda0ff','#64dace','#73b9ff','#f3bd83','#ed91bb','#91bda7','#b7c8ed','#d3aeec'];
export function neuralMap(data){
 const files=data.nodes.filter(n=>n.id!=='BOGATI_BRAIN');
 const groups=[...new Set(files.map(n=>n.group))].sort();
 const nodes=files.map(n=>{const g=groups.indexOf(n.group),siblings=files.filter(f=>f.group===n.group).sort((a,b)=>a.id.localeCompare(b.id)),i=siblings.findIndex(f=>f.id===n.id),a=g/groups.length*Math.PI*2,s=i*2.39996;return {...n,color:regionColors[g%regionColors.length],position:[Math.cos(a)*1.05+Math.cos(s)*.38,Math.sin(a)*.82+Math.sin(s)*.34,Math.sin(i*1.7+g)*.65]};});
 const links=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],ref=a.content?.includes(b.id)||b.content?.includes(a.id);if(ref||(a.group===b.group&&j-i<=2))links.push({source:a.id,target:b.id,kind:ref?'Referencia entre archivos':'Misma categoría'});}
 return {nodes,links,groups};
}
