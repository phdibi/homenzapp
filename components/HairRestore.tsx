
import React, { useState } from 'react';
import { restoreHairAllAngles, restoreHairForAngle } from '../services/geminiService';
import type { AngleSimulationResult, SimulationAngle, AngleImageMap } from '../types';

const ANGLE_CONFIG: Record<SimulationAngle, { label: string; instruction: string }> = {
  frontal:       { label: 'Vista Frontal',    instruction: 'Olhando para a câmera' },
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
    frontal: null,
    lateral_left: null,
    lateral_right: null,
    top: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationResults, setSimulationResults] = useState<AngleSimulationResult[]>(INITIAL_RESULTS);

  const hasAnyImage = Object.values(angleImages).some((img) => img !== null);
  const imageCount = Object.values(angleImages).filter((img) => img !== null).length;
  const isStarted = simulationResults.some((r) => r.status !== 'pending');
  const hasAnyError = simulationResults.some((r) => r.status === 'error');
  const allComplete = simulationResults.every((r) => r.status === 'success' || r.status === 'error' || r.status === 'pending');
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

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (angle: SimulationAngle) => {
    setAngleImages((prev) => ({ ...prev, [angle]: null }));
    setSimulationResults(INITIAL_RESULTS);
  };

  const processRestauration = async () => {
    if (!hasAnyImage) return;

    setIsProcessing(true);
    // Set only angles WITH images to loading; leave others as pending
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
      await restoreHairAllAngles(angleImages, handleResult);
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
      const image = await restoreHairForAngle(angleImages, angle);
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
          SIMULAÇÃO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 font-medium leading-relaxed">
          Envie uma foto para cada ângulo desejado. Nossa IA analisa casos reais de transplante e gera
          uma simulação fotorrealista para cada vista.
        </p>
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-8">
          {/* Upload Grid — 4 angle slots */}
          <div className="grid grid-cols-2 gap-4">
            {ANGLES.map((angle) => {
              const config = ANGLE_CONFIG[angle];
              const img = angleImages[angle];

              return (
                <div key={angle} className="flex flex-col space-y-2">
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                      {config.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{config.instruction}</span>
                  </div>

                  {/* Card */}
                  {img ? (
                    <div className="relative rounded-2xl overflow-hidden aspect-square shadow-md border-4 border-[#57BEB7]/20 group">
                      <img src={img} alt={config.label} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(angle)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {/* Angle badge */}
                      <div className="absolute bottom-2 left-2 bg-[#57BEB7] text-white text-[9px] font-black tracking-widest px-2 py-1 rounded-full uppercase shadow">
                        ✓ Carregada
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center px-4 py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#57BEB7] hover:bg-[#57BEB7]/5 transition-all aspect-square group">
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

          {/* Start button */}
          {hasAnyImage && !isStarted && !isProcessing && (
            <button
              onClick={processRestauration}
              className="w-full py-5 bg-[#57BEB7] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-3 animate-slide-up"
            >
              INICIAR SIMULAÇÃO ({imageCount} {imageCount === 1 ? 'ÂNGULO' : 'ÂNGULOS'})
            </button>
          )}
        </div>

        {/* Results Gallery */}
        {isStarted && (
          <div className="w-full max-w-5xl mt-12 space-y-8 animate-slide-up">
            <h2 className="text-center text-2xl font-black text-[#1D4998] uppercase tracking-wider">
              Resultados da Simulação
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {simulationResults
                .filter((result) => angleImages[result.angle] !== null)
                .map((result) => (
                  <div key={result.angle} className="flex flex-col space-y-3">
                    {/* Result Card */}
                    <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-square bg-gray-100 ring-4 ring-[#57BEB7]/10">
                      {result.status === 'loading' && (
                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                          <div className="w-12 h-12 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
                          <p className="text-[#1D4998] font-black text-xs uppercase tracking-widest animate-pulse">
                            Gerando {result.label}...
                          </p>
                          <p className="text-gray-400 text-[10px]">Analisando referência e gerando simulação</p>
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
                          {result.errorMessage && (
                            <p className="text-gray-400 text-[10px] text-center max-w-[200px] truncate">{result.errorMessage}</p>
                          )}
                          <button
                            onClick={() => retryAngle(result.angle)}
                            className="px-4 py-2 bg-red-500 text-white text-xs font-black rounded-full hover:bg-red-600 transition-colors uppercase tracking-wider"
                          >
                            Tentar Novamente
                          </button>
                        </div>
                      )}

                      {result.status === 'pending' && (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-gray-300 text-xs font-bold uppercase tracking-widest">Aguardando</p>
                        </div>
                      )}
                    </div>

                    {/* Download button */}
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
            {anyProcessed && !isProcessing && (
              <div className={`grid ${hasAnyError ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-6`}>
                <button
                  onClick={() => {
                    setAngleImages({ frontal: null, lateral_left: null, lateral_right: null, top: null });
                    setSimulationResults(INITIAL_RESULTS);
                  }}
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
