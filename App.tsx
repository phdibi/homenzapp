
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import HairRestore from './components/HairRestore';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if an API key has already been selected using the global AI Studio helper
    const checkKey = async () => {
      if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(!!selected);
      }
      setLoading(false);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (typeof (window as any).aistudio?.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
      /**
       * Guideline: A race condition can occur where hasSelectedApiKey() may not 
       * immediately return true. Assume the key selection was successful.
       */
      setHasKey(true);
    }
  };

  if (loading) return null;

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100 text-center space-y-8">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <span className="text-3xl font-black tracking-tighter text-[#57BEB7]">HOMENZ</span>
              <div className="text-[#1D4998]">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="14" r="6" />
                  <line x1="14.5" y1="9.5" x2="19" y2="5" />
                  <polyline points="13 5 19 5 19 11" />
                </svg>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-2xl font-black text-[#1D4998]">PLATAFORMA PRIVADA</h1>
            <p className="text-gray-500 font-medium">
              Para acessar nossas ferramentas de análise e simulação avançada, utilize sua chave de acesso corporativa.
            </p>
          </div>
          <button 
            onClick={handleSelectKey}
            className="w-full py-5 bg-[#1D4998] text-white rounded-2xl font-black shadow-xl hover:bg-[#153a7a] transition-all tracking-widest text-sm"
          >
            ATIVAR CHAVE DE API
          </button>
          
          <div className="mt-4">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] text-[#57BEB7] font-bold uppercase hover:underline tracking-widest"
            >
              Documentação de Faturamento e Cotas
            </a>
          </div>

          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Uso restrito a profissionais autorizados
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <HairRestore />
    </Layout>
  );
};

export default App;
