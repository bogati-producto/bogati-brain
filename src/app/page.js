"use client";

import { useState, useEffect } from 'react';
import LoginForm from '@/components/LoginForm';
import BrainGraph from '@/components/BrainGraph';
import SearchBar from '@/components/SearchBar';
import NodeSidebar from '@/components/NodeSidebar';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [brainData, setBrainData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    // Fetch generated brain data
    fetch('/brain-data.json')
      .then(res => res.json())
      .then(data => setBrainData(data))
      .catch(err => console.error("Error loading brain data:", err));
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#03001C]">
      {!isAuthenticated && (
        <LoginForm onLogin={() => setIsAuthenticated(true)} />
      )}

      {isAuthenticated && (
        <>
          {brainData && (
            <BrainGraph 
              data={brainData} 
              onNodeClick={(node) => {
                if (node.id !== 'BOGATI_BRAIN') {
                  setSelectedNode(node);
                }
              }} 
            />
          )}
          
          <SearchBar />
          
          <NodeSidebar 
            node={selectedNode} 
            onClose={() => setSelectedNode(null)} 
          />
        </>
      )}
    </main>
  );
}
