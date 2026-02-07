
import React, { useState } from 'react';
import { restoreHairVisual } from '../services/geminiService';

const HairRestore: React.FC = () => {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [restoredImage, setRestoredImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const MAX_IMAGES = 6;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const remainingSlots = MAX_IMAGES - selectedImages.length;
      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      filesToProcess.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedImages(prev => [...prev, reader.result as string].slice(0, MAX_IMAGES));
          setRestoredImage(null);
          setError(null);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setRestoredImage(null);
  };

  const processRestauration = async () => {
    if (selectedImages.length === 0) return;

    setIsProcessing(true);
    setError(null);
    try {
      const result = await restoreHairVisual(selectedImages);
      setRestoredImage(result);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("Requested entity was not found.")) {
        if (typeof (window as any).aistudio?.openSelectKey === 'function') {
          await (window as any).aistudio.openSelectKey();
        }
      }
      setError("Erro ao processar simulação. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-4xl font-black text-[#1D4998] leading-tight">
          SIMULAÇÃO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 font-medium leading-relaxed">
          Nossa IA utiliza os múltiplos ângulos enviados para reconstruir seu visual com fidelidade total à sua face.
        </p>
      </div>

      <div className="flex flex-col items-center">
        {/* Input/Upload Grid */}
        <div className="w-full max-w-4xl space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {selectedImages.map((img, index) => (
              <div key={index} className="relative rounded-2xl overflow-hidden aspect-square shadow-md border-4 border-gray-50 group">
                <img src={img} alt={`Ângulo ${index + 1}`} className="w-full h-full object-cover" />
                <button 
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}

            {selectedImages.length < MAX_IMAGES && (
              <label className="flex flex-col items-center justify-center px-4 py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#57BEB7] hover:bg-[#57BEB7]/5 transition-all aspect-square group">
                <div className="bg-white p-3 rounded-xl shadow-sm mb-2 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-[#57BEB7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-[10px] font-black text-[#1D4998] uppercase tracking-wider text-center">
                  Adicionar Ângulo<br/>({selectedImages.length}/{MAX_IMAGES})
                </span>
                <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
              </label>
            )}
          </div>

          {selectedImages.length > 0 && !restoredImage && !isProcessing && (
            <button
              onClick={processRestauration}
              className="w-full py-5 bg-[#57BEB7] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-3 animate-slide-up"
            >
              INICIAR SIMULAÇÃO FOTORREALISTA
            </button>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <div className="w-16 h-16 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-[#1D4998] font-black tracking-widest text-sm animate-pulse uppercase">Reconstruindo Densidade...</p>
                <p className="text-gray-400 text-xs mt-1">Preservando traços faciais originais</p>
              </div>
            </div>
          )}

          {error && <p className="text-red-500 font-bold text-sm text-center">{error}</p>}
        </div>

        {/* Hero Result Section */}
        {restoredImage && (
          <div className="w-full max-w-3xl mt-12 space-y-8 animate-slide-up">
            <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(87,190,183,0.3)] aspect-square bg-gray-100 ring-[12px] ring-[#57BEB7]/10">
              <img src={restoredImage} alt="Simulação Homenz Final" className="w-full h-full object-cover" />
              <div className="absolute top-6 left-6 bg-[#57BEB7] text-white text-xs font-black tracking-widest px-4 py-2 rounded-full uppercase shadow-lg">
                Resultado Fotorrealista
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => { setSelectedImages([]); setRestoredImage(null); }}
                className="py-5 text-[#1D4998] font-black uppercase tracking-widest text-xs border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
              >
                Nova Simulação
              </button>
              <a 
                href={restoredImage} 
                download="homenz-transplante-ia.png"
                className="py-5 bg-[#1D4998] text-white text-center font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-[#153a7a] transition-all shadow-lg"
              >
                Salvar Resultado
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HairRestore;
