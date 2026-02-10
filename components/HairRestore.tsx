
import React, { useState } from 'react';
import DrawingCanvas from './DrawingCanvas';
import { simulateAllAngles, simulateForAngle } from '../services/geminiService';
import type { AngleSimulationResult, SimulationAngle, AngleImageMap, AngleMaskMap } from '../types';

type AppStep = 'upload' | 'draw' | 'results';

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
  // Step state
  const [step, setStep] = useState<AppStep>('upload');

  // Upload state
  const [angleImages, setAngleImages] = useState<AngleImageMap>({
    frontal: null, lateral_left: null, lateral_right: null, top: null,
  });

  // Drawing state — which angle is being drawn, and saved masks/composites
  const [drawingAngle, setDrawingAngle] = useState<SimulationAngle | null>(null);
  const [angleMasks, setAngleMasks] = useState<AngleMaskMap>({
    frontal: null, lateral_left: null, lateral_right: null, top: null,
  });
  const [composites, setComposites] = useState<Record<SimulationAngle, string | null>>({
    frontal: null, lateral_left: null, lateral_right: null, top: null,
  });

  // Results state
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationResults, setSimulationResults] = useState<AngleSimulationResult[]>(INITIAL_RESULTS);

  // Derived
  const uploadedAngles = ANGLES.filter((a) => angleImages[a] !== null);
  const maskedAngles = ANGLES.filter((a) => composites[a] !== null);
  const readyToGenerate = maskedAngles.length > 0;
  const anyProcessed = simulationResults.some((r) => r.status === 'success' || r.status === 'error');
  const hasAnyError = simulationResults.some((r) => r.status === 'error');

  // --- Upload handlers ---
  const handleFileChange = (angle: SimulationAngle, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAngleImages((prev) => ({ ...prev, [angle]: reader.result as string }));
      // Clear mask for this angle if photo changes
      setAngleMasks((prev) => ({ ...prev, [angle]: null }));
      setComposites((prev) => ({ ...prev, [angle]: null }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (angle: SimulationAngle) => {
    setAngleImages((prev) => ({ ...prev, [angle]: null }));
    setAngleMasks((prev) => ({ ...prev, [angle]: null }));
    setComposites((prev) => ({ ...prev, [angle]: null }));
  };

  // --- Drawing handlers ---
  const openDrawing = (angle: SimulationAngle) => {
    setDrawingAngle(angle);
    setStep('draw');
  };

  const handleSaveMask = (maskDataUrl: string, compositeDataUrl: string) => {
    if (!drawingAngle) return;
    setAngleMasks((prev) => ({ ...prev, [drawingAngle]: maskDataUrl }));
    setComposites((prev) => ({ ...prev, [drawingAngle]: compositeDataUrl }));
    setDrawingAngle(null);
    setStep('upload');
  };

  const handleCancelDrawing = () => {
    setDrawingAngle(null);
    setStep('upload');
  };

  // --- Generation handlers ---
  const startGeneration = async () => {
    setStep('results');
    setIsProcessing(true);

    setSimulationResults((prev) =>
      prev.map((r) =>
        composites[r.angle]
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
      await simulateAllAngles(angleImages, angleMasks, composites, handleResult);
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
      const image = await simulateForAngle(angleImages, angleMasks, composites, angle);
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

  const resetAll = () => {
    setStep('upload');
    setAngleImages({ frontal: null, lateral_left: null, lateral_right: null, top: null });
    setAngleMasks({ frontal: null, lateral_left: null, lateral_right: null, top: null });
    setComposites({ frontal: null, lateral_left: null, lateral_right: null, top: null });
    setSimulationResults(INITIAL_RESULTS);
    setIsProcessing(false);
  };

  // =========================================================================
  // RENDER: Drawing mode
  // =========================================================================
  if (step === 'draw' && drawingAngle && angleImages[drawingAngle]) {
    return (
      <div className="space-y-6 animate-fade-in pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-black text-[#1D4998]">
            MARCAR AREA — <span className="text-[#57BEB7]">{ANGLE_CONFIG[drawingAngle].label.toUpperCase()}</span>
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Pinte as areas onde deseja adicionar cabelo
          </p>
        </div>

        <DrawingCanvas
          imageSrc={angleImages[drawingAngle]!}
          onSaveMask={handleSaveMask}
          onCancel={handleCancelDrawing}
        />
      </div>
    );
  }

  // =========================================================================
  // RENDER: Results
  // =========================================================================
  if (step === 'results') {
    return (
      <div className="space-y-10 animate-fade-in pb-20">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-4xl font-black text-[#1D4998] leading-tight">
            RESULTADOS DA <span className="text-[#57BEB7]">SIMULACAO</span>
          </h1>
          <p className="text-gray-500 font-medium">
            {isProcessing ? 'Gerando simulacoes com Nano Banana Pro...' : 'Simulacoes completas'}
          </p>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-5xl space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {simulationResults
                .filter((result) => composites[result.angle] !== null)
                .map((result) => (
                  <div key={result.angle} className="flex flex-col space-y-3">
                    {/* Before / After label */}
                    <div className="text-center">
                      <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                        {result.label}
                      </span>
                    </div>

                    {/* Original + Result side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Original */}
                      <div className="relative rounded-xl overflow-hidden aspect-square bg-gray-100 ring-2 ring-gray-200">
                        {angleImages[result.angle] && (
                          <img src={angleImages[result.angle]!} alt="Original" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute bottom-1 left-1 bg-gray-800/70 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                          Antes
                        </div>
                      </div>

                      {/* Result */}
                      <div className="relative rounded-xl overflow-hidden aspect-square bg-gray-100 ring-2 ring-[#57BEB7]/30">
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
                            <img src={result.image} alt={result.label} className="w-full h-full object-cover animate-fade-in" />
                            <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                              Depois
                            </div>
                          </>
                        )}

                        {result.status === 'error' && (
                          <div className="flex flex-col items-center justify-center h-full space-y-2 p-3">
                            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-red-500 font-bold text-[10px] text-center">Erro</p>
                            {result.errorMessage && (
                              <p className="text-gray-400 text-[9px] text-center truncate max-w-full">{result.errorMessage}</p>
                            )}
                            <button
                              onClick={() => retryAngle(result.angle)}
                              className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full hover:bg-red-600"
                            >
                              Tentar Novamente
                            </button>
                          </div>
                        )}

                        {result.status === 'pending' && (
                          <div className="flex items-center justify-center h-full">
                            <p className="text-gray-300 text-[10px] font-bold uppercase">Aguardando</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Download */}
                    {result.status === 'success' && result.image && (
                      <a
                        href={result.image}
                        download={`homenz-simulacao-${result.angle}.png`}
                        className="py-2 bg-[#1D4998] text-white text-center font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-[#153a7a] transition-all shadow-md"
                      >
                        Salvar {result.label}
                      </a>
                    )}
                  </div>
                ))}
            </div>

            {/* Bottom actions */}
            {anyProcessed && !isProcessing && (
              <div className="flex gap-4 mt-6">
                <button
                  onClick={resetAll}
                  className="flex-1 py-4 text-[#1D4998] font-black uppercase tracking-widest text-xs border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
                >
                  Nova Simulacao
                </button>
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 py-4 text-[#57BEB7] font-black uppercase tracking-widest text-xs border-2 border-[#57BEB7]/20 rounded-2xl hover:bg-[#57BEB7]/5 transition-all"
                >
                  Editar Mascaras
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: Upload + Draw (main step)
  // =========================================================================
  return (
    <div className="space-y-10 animate-fade-in pb-20">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-4xl font-black text-[#1D4998] leading-tight">
          SIMULACAO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 font-medium leading-relaxed">
          Envie fotos do paciente e <strong>desenhe</strong> as areas onde deseja adicionar cabelo.
          Nossa IA gera uma simulacao personalizada para cada angulo.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex justify-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#57BEB7] text-white rounded-full flex items-center justify-center text-xs font-black">1</div>
          <span className="text-xs font-bold text-[#1D4998] uppercase tracking-wider">Enviar Fotos</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${uploadedAngles.length > 0 ? 'bg-[#57BEB7] text-white' : 'bg-gray-200 text-gray-400'}`}>2</div>
          <span className={`text-xs font-bold uppercase tracking-wider ${uploadedAngles.length > 0 ? 'text-[#1D4998]' : 'text-gray-300'}`}>Marcar Areas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${readyToGenerate ? 'bg-[#57BEB7] text-white' : 'bg-gray-200 text-gray-400'}`}>3</div>
          <span className={`text-xs font-bold uppercase tracking-wider ${readyToGenerate ? 'text-[#1D4998]' : 'text-gray-300'}`}>Gerar</span>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-8">
          {/* Upload + Draw Grid — 4 angle slots */}
          <div className="grid grid-cols-2 gap-4">
            {ANGLES.map((angle) => {
              const config = ANGLE_CONFIG[angle];
              const img = angleImages[angle];
              const hasMask = composites[angle] !== null;

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
                      {/* Show composite preview if mask exists, otherwise original */}
                      <img
                        src={hasMask ? composites[angle]! : img}
                        alt={config.label}
                        className="w-full h-full object-cover"
                      />

                      {/* Remove button */}
                      <button
                        onClick={() => removeImage(angle)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>

                      {/* Status badge */}
                      <div className={`absolute bottom-2 left-2 text-white text-[9px] font-black tracking-widest px-2 py-1 rounded-full uppercase shadow ${hasMask ? 'bg-[#57BEB7]' : 'bg-[#1D4998]'}`}>
                        {hasMask ? 'Area Marcada' : 'Foto Enviada'}
                      </div>

                      {/* Draw / Redraw button overlay */}
                      <button
                        onClick={() => openDrawing(angle)}
                        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all"
                      >
                        <span className="bg-[#57BEB7] text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-100 scale-90">
                          {hasMask ? 'Redesenhar' : 'Marcar Area'}
                        </span>
                      </button>
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

          {/* Info about masks */}
          {uploadedAngles.length > 0 && maskedAngles.length === 0 && (
            <div className="text-center py-4 bg-[#57BEB7]/5 rounded-2xl border border-[#57BEB7]/10">
              <p className="text-sm text-[#1D4998] font-medium">
                Clique em cada foto para <strong>marcar as areas</strong> onde deseja adicionar cabelo
              </p>
            </div>
          )}

          {/* Generate button */}
          {readyToGenerate && (
            <button
              onClick={startGeneration}
              className="w-full py-5 bg-[#57BEB7] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-3 animate-slide-up"
            >
              GERAR SIMULACAO ({maskedAngles.length} {maskedAngles.length === 1 ? 'ANGULO' : 'ANGULOS'})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HairRestore;
