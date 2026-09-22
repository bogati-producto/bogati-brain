"use client";

import { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setIsOpen(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });
      const data = await res.json();
      setResult(data.reply || "Error al procesar la solicitud.");
    } catch (error) {
      setResult("Error de conexión con el cerebro.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 w-full p-6 flex flex-col items-center pointer-events-none z-40">
      
      {/* Resultados Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-3xl bg-white text-gray-900 p-6 rounded-2xl shadow-2xl mb-6 pointer-events-auto relative overflow-hidden"
          >
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-sm font-bold text-[#B429F9] uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2">
              <Search className="w-4 h-4" />
              SÍNTESIS DE RESPUESTA
            </h3>
            
            <div className="min-h-[100px] max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-[#26C5F3]" />
                  <p className="text-sm animate-pulse">Conectando sinapsis...</p>
                </div>
              ) : (
                <div 
                  className="text-lg leading-relaxed whitespace-pre-wrap font-medium"
                >{result}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Input */}
      <form 
        onSubmit={handleSearch} 
        className="w-full max-w-3xl relative pointer-events-auto"
      >
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-[#26C5F3]" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Consulta al Cerebro Bogati..."
          className="w-full bg-black/60 backdrop-blur-md border border-white/20 text-white rounded-full py-4 pl-14 pr-6 text-lg focus:outline-none focus:border-[#B429F9] focus:ring-1 focus:ring-[#B429F9] shadow-[0_0_15px_rgba(38,197,243,0.2)] transition-all"
        />
        <button type="submit" className="hidden">Buscar</button>
      </form>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
      `}} />
    </div>
  );
}
