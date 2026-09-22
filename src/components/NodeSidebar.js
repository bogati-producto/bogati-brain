"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText } from 'lucide-react';

export default function NodeSidebar({ node, onClose }) {
  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-[400px] bg-white text-gray-900 shadow-2xl z-40 border-l border-gray-200 flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileText className="w-5 h-5 text-[#B429F9] shrink-0" />
              <h2 className="font-bold text-lg truncate">{node.label}</h2>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-colors bg-gray-200 p-2 rounded-full hover:bg-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {node.content}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
