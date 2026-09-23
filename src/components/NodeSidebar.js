"use client";
import {X,FileText} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export default function NodeSidebar({node,onClose}){
 if(!node)return null;
 return <aside className="document-panel" aria-label="Contenido del archivo"><header><FileText size={20}/><div><small>DOCUMENTO SELECCIONADO</small><h2>{node.label.replaceAll('_',' ')}</h2></div><button onClick={onClose} aria-label="Cerrar documento"><X size={20}/></button></header><div className="document-path">{node.id}</div><div className="document-body prose-brain">{node.id.endsWith('.csv')?<><p>Vista previa: primeras 80 líneas del archivo.</p><pre>{node.content.split('\n').slice(0,80).join('\n')}</pre></>:<Markdown remarkPlugins={[remarkGfm]}>{node.content}</Markdown>}</div></aside>;
}
