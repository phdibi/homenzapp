
import React, { useState } from 'react';
import { restoreHairAllAngles, restoreHairForAngle } from '../services/geminiService';
import type { AngleSimulationResult, SimulationAngle } from '../types';

const INITIAL_RESULTS: AngleSimulationResult[] = [
  { angle: 'frontal',       label: 'Vista Frontal',         image: null, status: 'pending' },
  { angle: 'lateral_left',  label: 'Lateral Esquerdo',      image: null, status: 'pending' },
  { angle: 'lateral_right', label: 'Lateral Direito',       image: null, status: 'pending' },
  { angle: 'top',           label: 'Vista Superior',        image: null, status: 'pending' },
];

const HairRestore: React.FC = () => {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationResults, setSimulationResults] = useState<AngleSimulationResult[]>(INITIAL_RESULTS);

  const MAX_IMAGES = 6;

  const isStarted = simulationResults.some(r => r.status !== 'pending');
  const hasAnyError = simulationResults.some(r => r.status === 'error');
  const allComplete = simulationResults.every(r => r.status === 'success' || r.status === 'error');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const remainingSlots = MAX_IMAGES - selectedImages.length;
      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      filesToProcess.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedImages(prev => [...prev, reader.result as string].slice(0, MAX_IMAGES));
          setSimulationResults(INITIAL_RESULTS);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setSimulationResults(INITIAL_RESULTS);
  };

  const processRestauration = async () => {
    if (selectedImages.length === 0) return;

    setIsProcessing(true);
    setSimulationResults(prev => prev.map(r => ({ ...r, status: 'loading' as const, image: null, errorMessage: undefined })));

    const handleResult = (angle: SimulationAngle, result: { image?: string; error?: string }) => {
      setSimulationResults(prev => prev.map(r => {
        if (r.angle !== angle) return r;
        if (result.image) {
          return { ...r, status: 'success' as const, image: result.image };
        }
        return { ...r, status: 'error' as const, errorMessage: result.error };
      }));
    };

    try {
      await restoreHairAllAngles(selectedImages, handleResult);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const retryAngle = async (angle: SimulationAngle) => {
    setSimulationResults(prev => prev.map(r =>
      r.angle === angle ? { ...r, status: 'loading' as const, image: null, errorMessage: undefined } : r
    ));

    try {
      const image = await restoreHairForAngle(selectedImages, angle);
      setSimulationResults(prev => prev.map(r =>
        r.angle === angle ? { ...r, status: 'success' as const, image } : r
      ));
    } catch (err: any) {
      setSimulationResults(prev => prev.map(r =>
        r.angle === angle ? { ...r, status: 'error' as const, errorMessage: err?.message } : r
      ));
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-4xl font-black text-[#1D4998] leading-tight">
          SIMULAÇÃO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 font-medium leading-relaxed">
          Nossa IA utiliza os múltiplos ângulos enviados para reconstruir seu visual com fidelidade total à sua face. Envie até 6 fotos e receba 4 simulações em ângulos diferentes.
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
                  className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
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

          {selectedImages.length > 0 && !isStarted && !isProcessing && (
            <button
              onClick={processRestauration}
              className="w-full py-5 bg-[#57BEB7] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-3 animate-slide-up"
            >
              INICIAR SIMULAÇÃO FOTORREALISTA
            </button>
          )}
        </div>

        {/* Results Gallery - 4 Angles */}
        {isStarted && (
          <div className="w-full max-w-5xl mt-12 space-y-8 animate-slide-up">
            <h2 className="text-center text-2xl font-black text-[#1D4998] uppercase tracking-wider">
              Resultados da Simulação
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {simulationResults.map((result) => (
                <div key={result.angle} className="flex flex-col space-y-3">
                  {/* Card */}
                  <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-square bg-gray-100 ring-4 ring-[#57BEB7]/10">
                    {result.status === 'loading' && (
                      <div className="flex flex-col items-center justify-center h-full space-y-3">
                        <div className="w-12 h-12 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
                        <p className="text-[#1D4998] font-black text-xs uppercase tracking-widest animate-pulse">
                          Gerando {result.label}...
                        </p>
                        <p className="text-gray-400 text-[10px]">Preservando traços faciais</p>
                      </div>
                    )}

                    {result.status === 'success' && result.image && (
                      <>
                        <img src={result.image} alt={result.label} className="w-full h-full object-cover animate-fade-in" />
                        <div className="absolute top-3 left-3 bg-[#57BEB7] text-white text-[10px] font-black tracking-widest px-3 py-1.5 rounded-full uppercase shadow-lg">
                          {result.label}
                        </div>
                      </>
                    )}

                    {result.status === 'error' && (
                      <div className="flex flex-col items-center justify-center h-full space-y-3 p-4">
                        <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-red-500 font-bold text-xs text-center">Erro: {result.label}</p>
                        <button
                          onClick={() => retryAngle(result.angle)}
                          className="px-4 py-2 bg-red-500 text-white text-xs font-black rounded-full hover:bg-red-600 transition-colors uppercase tracking-wider"
                        >
                          Tentar Novamente
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Per-image download */}
                  {result.status === 'success' && result.image && (
                    <a
                      href={result.image}
                      download={`homenz-transplante-${result.angle}.png`}
                      className="py-3 bg-[#1D4998] text-white text-center font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-[#153a7a] transition-all shadow-md"
                    >
                      Salvar {result.label}
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom actions */}
            {allComplete && (
              <div className={`grid ${hasAnyError ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-6`}>
                <button
                  onClick={() => { setSelectedImages([]); setSimulationResults(INITIAL_RESULTS); }}
                  className="py-5 text-[#1D4998] font-black uppercase tracking-widest text-xs border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
                >
                  Nova Simulação
                </button>
                {hasAnyError && (
                  <button
                    onClick={processRestauration}
                    className="py-5 bg-[#57BEB7] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-[#48a9a3] transition-all shadow-lg"
                  >
                    Reprocessar Todos
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HairRestore;
