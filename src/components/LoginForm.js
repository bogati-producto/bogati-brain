"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, ArrowRight } from 'lucide-react';

export default function LoginForm({ onLogin }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === '123456789') {
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#03001C] flex items-center justify-center z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#B429F9]/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#B429F9]/50">
            <Lock className="w-8 h-8 text-[#B429F9]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wider">BOGATI <span className="text-[#B429F9]">BRAIN</span></h1>
          <p className="text-[#26C5F3] text-sm tracking-widest uppercase">Sistema de Inteligencia Central</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa la clave de acceso..."
                className={`w-full bg-black/40 border ${error ? 'border-red-500' : 'border-white/10 focus:border-[#B429F9]'} rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none transition-colors duration-300 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-sm mt-2 ml-2"
              >
                Clave incorrecta. Acceso denegado.
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-[#B429F9] to-[#26C5F3] hover:from-[#9b20db] hover:to-[#1ea7cf] text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(180,41,249,0.3)] hover:shadow-[0_0_30px_rgba(180,41,249,0.5)]"
          >
            INICIAR SECUENCIA
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
