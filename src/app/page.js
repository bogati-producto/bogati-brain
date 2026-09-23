"use client";
import {useState,useEffect,useMemo} from 'react';
import {Brain,Network,ChevronDown,FileText,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import LoginForm from '@/components/LoginForm';
import BrainGraph from '@/components/BrainGraph';
import SearchBar from '@/components/SearchBar';
import NodeSidebar from '@/components/NodeSidebar';
import {neuralMap,regionColors} from '@/lib/neural-map.mjs';
export default function Home(){
 const [authenticated,setAuthenticated]=useState(false),[data,setData]=useState(null),[selected,setSelected]=useState(null),[active,setActive]=useState([]),[error,setError]=useState(false),[explorerOpen,setExplorerOpen]=useState(true);
 useEffect(()=>{fetch('/brain-data.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(setData).catch(()=>setError(true));},[]);
 const map=useMemo(()=>data?neuralMap(data):null,[data]);
 return <main className="brain-app">
 {!authenticated&&<LoginForm onLogin={()=>setAuthenticated(true)}/>}
 {authenticated&&<>
 {explorerOpen&&<aside className="knowledge-panel"><div className="eyebrow">EXPLORADOR</div><h1>Un cerebro.<br/><span>Todo conectado.</span></h1><p className="intro">Explora el conocimiento que da vida a Bogati.</p><div className="map-stats"><div><b>{map?.nodes.length??'—'}</b><span>archivos</span></div><div><b>{map?.links.length??'—'}</b><span>relaciones</span></div></div><div className="category-list">{map?.groups.map((g,i)=><details key={g}><summary><i style={{background:regionColors[i%regionColors.length]}}/><span>{g==='root'?'Marco central':g}</span><small>{map.nodes.filter(n=>n.group===g).length}</small><ChevronDown size={12}/></summary>{map.nodes.filter(n=>n.group===g).map(n=><button key={n.id} onClick={()=>setSelected(n)}><FileText size={12}/>{n.label.replaceAll('_',' ')}</button>)}</details>)}</div><div className="relation-key"><Network size={15}/><span>Líneas tenues: relaciones entre archivos.<br/>Nodos iluminados: fuentes consultadas.</span></div></aside>}
 <button className={`explorer-toggle ${explorerOpen?'is-open':''}`} onClick={()=>setExplorerOpen(v=>!v)} aria-label={explorerOpen?'Ocultar documentos':'Mostrar documentos'}>{explorerOpen?<PanelLeftClose size={17}/>:<PanelLeftOpen size={17}/>}</button>
 {map?<BrainGraph map={map} onNodeClick={setSelected} activeFiles={active}/>:<div className="webgl-notice">{error?'No se pudieron cargar los archivos. Recarga la página.':'Preparando el cerebro…'}</div>}
 <SearchBar onActivity={setActive} onSource={id=>setSelected(data?.nodes.find(n=>n.id===id)||null)}/><NodeSidebar node={selected} onClose={()=>setSelected(null)}/>
 </>}
 </main>;
}
