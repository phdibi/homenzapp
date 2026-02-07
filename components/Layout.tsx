
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center h-20">
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
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#1D4998] -mt-1 uppercase">
                Saúde e Estética Masculina
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {children}
      </main>

      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[#1D4998] opacity-50 text-xs font-medium tracking-wide">
            &copy; 2024 HOMENZ. TECNOLOGIA DE PONTA EM SAÚDE CAPILAR.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
