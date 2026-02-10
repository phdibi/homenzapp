
import React, { useState } from 'react';
import { simulateAllAngles, simulateForAngle } from '../services/geminiService';
import type { AngleSimulationResult, SimulationAngle, AngleImageMap } from '../types';

const ANGLE_CONFIG: Record<SimulationAngle, { label: string; instruction: string }> = {
  frontal:       { label: 'Vista Frontal',    instruction: 'Olhando para a camera' },
  lateral_left:  { label: 'Lateral Esquerdo', instruction: 'Perfil lado esquerdo' },
  lateral_right: { label: 'Lateral Direito',  instruction: 'Perfil lado direito' },
  top:           { label: 'Vista Superior',   instruction: 'Olhando para baixo' },
};

const ANGLES: SimulationAngle[] = ['frontal', 'lateral_left', 'lateral_right', 'top'];

const INITIAL_RESULTS: AngleSimulationResult[] = ANGLES.map((angle) => ({
  angle,
  label: ANGLE_CONFIG[angle].label,
  image: null,
  status: 'pending' as const,
}));

const HairRestore: React.FC = () => {
  const [angleImages, setAngleImages] = useState<AngleImageMap>({
    frontal: null, lateral_left: null, lateral_right: null, top: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationResults, setSimulationResults] = useState<AngleSimulationResult[]>(INITIAL_RESULTS);

  const hasAnyImage = Object.values(angleImages).some((img) => img !== null);
  const imageCount = Object.values(angleImages).filter((img) => img !== null).length;
  const isStarted = simulationResults.some((r) => r.status !== 'pending');
  const hasAnyError = simulationResults.some((r) => r.status === 'error');
  const anyProcessed = simulationResults.some((r) => r.status === 'success' || r.status === 'error');

  const handleFileChange = (angle: SimulationAngle, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAngleImages((prev) => ({ ...prev, [angle]: reader.result as string }));
      setSimulationResults(INITIAL_RESULTS);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (angle: SimulationAngle) => {
    setAngleImages((prev) => ({ ...prev, [angle]: null }));
    setSimulationResults(INITIAL_RESULTS);
  };

  const processSimulation = async () => {
    if (!hasAnyImage) return;
    setIsProcessing(true);

    setSimulationResults((prev) =>
      prev.map((r) =>
        angleImages[r.angle]
          ? { ...r, status: 'loading' as const, image: null, errorMessage: undefined }
          : { ...r, status: 'pending' as const, image: null, errorMessage: undefined }
      )
    );

    const handleResult = (angle: SimulationAngle, result: { image?: string; error?: string }) => {
      setSimulationResults((prev) =>
        prev.map((r) => {
          if (r.angle !== angle) return r;
          if (result.image) return { ...r, status: 'success' as const, image: result.image };
          return { ...r, status: 'error' as const, errorMessage: result.error };
        })
      );
    };

    try {
      await simulateAllAngles(angleImages, handleResult);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const retryAngle = async (angle: SimulationAngle) => {
    setSimulationResults((prev) =>
      prev.map((r) =>
        r.angle === angle ? { ...r, status: 'loading' as const, image: null, errorMessage: undefined } : r
      )
    );

    try {
      const image = await simulateForAngle(angleImages, angle);
      setSimulationResults((prev) =>
        prev.map((r) => (r.angle === angle ? { ...r, status: 'success' as const, image } : r))
      );
    } catch (err: any) {
      setSimulationResults((prev) =>
        prev.map((r) =>
          r.angle === angle ? { ...r, status: 'error' as const, errorMessage: err?.message } : r
        )
      );
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-4xl font-black text-[#1D4998] leading-tight">
          SIMULACAO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 font-medium leading-relaxed">
          Envie uma foto para cada angulo desejado. Nossa IA gera uma simulacao fotorrealista
          de transplante capilar FUE para cada vista.
        </p>
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-8">
          {/* Upload + Results Grid — 4 angles, each with before/after */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {ANGLES.map((angle) => {
              const config = ANGLE_CONFIG[angle];
              const img = angleImages[angle];
              const result = simulationResults.find((r) => r.angle === angle)!;

              return (
                <div key={angle} className="flex flex-col space-y-2">
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                      {config.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{config.instruction}</span>
                  </div>

                  {img ? (
                    <>
                      {/* Before / After side by side */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* BEFORE — original photo */}
                        <div className="relative rounded-xl overflow-hidden aspect-square shadow-md border-2 border-gray-200 group">
                          <img src={img} alt={config.label} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeImage(angle)}
                            className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="absolute bottom-1 left-1 bg-gray-800/70 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Antes
                          </div>
                        </div>

                        {/* AFTER — simulation result */}
                        <div className="relative rounded-xl overflow-hidden aspect-square bg-gray-50 border-2 border-[#57BEB7]/20">
                          {result.status === 'pending' && !isStarted && (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-gray-300 text-[10px] font-bold uppercase tracking-wider text-center px-2">
                                Aguardando simulacao
                              </p>
                            </div>
                          )}

                          {result.status === 'loading' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2">
                              <div className="w-10 h-10 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
                              <p className="text-[#1D4998] font-black text-[10px] uppercase tracking-widest animate-pulse">
                                Gerando...
                              </p>
                            </div>
                          )}

                          {result.status === 'success' && result.image && (
                            <>
                              <img src={result.image} alt={`Simulacao ${config.label}`} className="w-full h-full object-cover animate-fade-in" />
                              <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                                Depois
                              </div>
                            </>
                          )}

                          {result.status === 'error' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2 p-3">
                              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-red-500 font-bold text-[9px] text-center">Erro</p>
                              {result.errorMessage && (
                                <p className="text-gray-400 text-[8px] text-center truncate max-w-full">{result.errorMessage}</p>
                              )}
                              <button
                                onClick={() => retryAngle(angle)}
                                className="px-3 py-1 bg-red-500 text-white text-[9px] font-bold rounded-full hover:bg-red-600"
                              >
                                Tentar Novamente
                              </button>
                            </div>
                          )}

                          {result.status === 'pending' && isStarted && (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-gray-300 text-[10px] font-bold uppercase">Aguardando</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Download button */}
                      {result.status === 'success' && result.image && (
                        <a
                          href={result.image}
                          download={`homenz-simulacao-${angle}.png`}
                          className="py-2 bg-[#1D4998] text-white text-center font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-[#153a7a] transition-all shadow-md"
                        >
                          Salvar {config.label}
                        </a>
                      )}
                    </>
                  ) : (
                    /* Upload card */
                    <label className="flex flex-col items-center justify-center px-4 py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#57BEB7] hover:bg-[#57BEB7]/5 transition-all aspect-[2/1] group">
                      <div className="bg-white p-3 rounded-xl shadow-sm mb-2 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6 text-[#57BEB7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-black text-[#1D4998] uppercase tracking-wider text-center">
                        Enviar Foto
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleFileChange(angle, e)}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          {hasAnyImage && !isProcessing && (
            <div className={`grid ${anyProcessed && hasAnyError ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {!isStarted && (
                <button
                  onClick={processSimulation}
                  className="w-full py-5 bg-[#57BEB7] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-3 animate-slide-up"
                >
                  INICIAR SIMULACAO ({imageCount} {imageCount === 1 ? 'ANGULO' : 'ANGULOS'})
                </button>
              )}

              {anyProcessed && (
                <>
                  <button
                    onClick={() => {
                      setAngleImages({ frontal: null, lateral_left: null, lateral_right: null, top: null });
                      setSimulationResults(INITIAL_RESULTS);
                    }}
                    className="py-4 text-[#1D4998] font-black uppercase tracking-widest text-xs border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
                  >
                    Nova Simulacao
                  </button>
                  {hasAnyError && (
                    <button
                      onClick={processSimulation}
                      className="py-4 bg-[#57BEB7] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-[#48a9a3] transition-all shadow-lg"
                    >
                      Reprocessar Todos
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HairRestore;
