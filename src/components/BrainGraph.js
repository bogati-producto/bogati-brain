"use client";
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export default function BrainGraph({map,onNodeClick,activeFiles=[]}){
 const host=useRef(null),callback=useRef(onNodeClick),active=useRef(activeFiles),reset=useRef(null);
 const [hover,setHover]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{callback.current=onNodeClick;active.current=activeFiles;},[onNodeClick,activeFiles]);
 useEffect(()=>{
 const container=host.current;let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{const pending=setTimeout(()=>setFailed(true),0);return()=>clearTimeout(pending);}
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));container.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,.4,6.8);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=3.6;controls.maxDistance=10;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;controls.autoRotate=!reduced;controls.autoRotateSpeed=.22;
 reset.current=()=>{camera.position.set(0,.4,6.8);controls.target.set(0,0,0);controls.update();};
 const brain=new THREE.Group();scene.add(brain);brain.rotation.z=-.1;
 // Decorative bilateral envelope: only the larger colored spheres represent files.
 const surface=[];
 for(const side of [-1,1])for(let i=0;i<6200;i++){const y=1-2*(i+.5)/6200,phi=i*2.399963,r=Math.sqrt(1-y*y),x=r*Math.cos(phi),z=r*Math.sin(phi),fold=1+.042*Math.sin(phi*5+y*23)*Math.sin(y*31+z*8);surface.push(side*(.11+(x+1)*.79)*fold,y*1.24*fold,z*.92*fold);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(surface,3));brain.add(new THREE.Points(geo,new THREE.PointsMaterial({color:'#9076cd',size:.012,transparent:true,opacity:.29,depthWrite:false})));
 const meshes=map.nodes.map(n=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.039,12,12),new THREE.MeshBasicMaterial({color:n.color}));m.position.set(...n.position);m.userData=n;brain.add(m);m.add(new THREE.Mesh(new THREE.SphereGeometry(.082,12,12),new THREE.MeshBasicMaterial({color:n.color,transparent:true,opacity:.13,depthWrite:false})));return m;});
 const byId=new Map(meshes.map(m=>[m.userData.id,m]));
 const edges=map.links.map(l=>{const a=byId.get(l.source).position,b=byId.get(l.target).position,line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:l.kind==='Referencia entre archivos'?'#a6a0eb':'#55718e',transparent:true,opacity:.13}));brain.add(line);const pulse=new THREE.Mesh(new THREE.SphereGeometry(.025,8,8),new THREE.MeshBasicMaterial({color:'#d8fff5'}));pulse.visible=false;brain.add(pulse);return {line,pulse,a,b,...l};});
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null,hovered=null;
 const locate=e=>{const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(meshes,false)[0]?.object;};
 const move=e=>{hovered=locate(e);setHover(hovered?.userData||null);container.style.cursor=hovered?'pointer':'grab';};
 const start=e=>{down=[e.clientX,e.clientY];};const end=e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<6){const m=locate(e);if(m)callback.current(m.userData);}down=null;};
 renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',end);
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.zoom=Math.min(1,camera.aspect/1.1);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(container);resize();
 let frame;const draw=t=>{controls.update();const ids=new Set(active.current);for(const m of meshes)m.scale.setScalar(ids.has(m.userData.id)?1.7:m===hovered?1.5:1);edges.forEach((e,i)=>{const lit=ids.has(e.source)&&ids.has(e.target);e.line.material.opacity=lit?.65:hovered&&(e.source===hovered.userData.id||e.target===hovered.userData.id)?.48:.13;e.pulse.visible=lit&&!reduced;if(e.pulse.visible)e.pulse.position.lerpVectors(e.a,e.b,(t/2500+i*.19)%1);});renderer.render(scene,camera);frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
 return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();renderer.domElement.remove();};
 },[map]);
 return <><div className="neural-canvas" ref={host}/><div className="brain-caption"><span>VISTA NEURONAL / 3D</span><p>{hover?hover.label.replaceAll('_',' '):'Cada punto de luz, una fuente de conocimiento.'}</p><small>{hover?hover.group:'Arrastra para girar · Desplaza para acercarte'}</small></div><button className="reset-view" onClick={()=>reset.current?.()}>↺ Restablecer vista</button>{failed&&<div className="webgl-notice">No se pudo iniciar la vista 3D. Explora los archivos en el panel izquierdo.</div>}</>;
}
