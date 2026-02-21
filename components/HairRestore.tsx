import React, { useState } from 'react';
import DrawingCanvas from './DrawingCanvas';
import { step1FillHair, step2ApplyHairstyle, HAIRSTYLE_OPTIONS } from '../services/geminiService';
import type {
  SimulationAngle,
  AngleImageMap,
  AngleDrawingMap,
  AngleStepResult,
  PipelineStep,
  HairstyleOption,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANGLES: SimulationAngle[] = ['frontal', 'top'];

const ANGLE_CONFIG: Record<SimulationAngle, { label: string; instruction: string }> = {
  frontal: { label: 'Vista Frontal', instruction: 'Olhando para a camera' },
  top: { label: 'Vista Superior', instruction: 'Olhando para baixo' },
};

const STEP_LABELS: { key: PipelineStep[]; label: string }[] = [
  { key: ['upload'], label: 'Fotos' },
  { key: ['draw'], label: 'Marcar' },
  { key: ['step1_processing', 'step1_done'], label: 'Preencher' },
  { key: ['select_hairstyle', 'step2_processing'], label: 'Penteado' },
  { key: ['step2_done'], label: 'Resultado' },
];

const EMPTY_IMAGES: AngleImageMap = { frontal: null, top: null };
const EMPTY_DRAWINGS: AngleDrawingMap = {
  frontal: { drawingDataUrl: null, compositeDataUrl: null },
  top: { drawingDataUrl: null, compositeDataUrl: null },
};

const makeInitialResults = (): AngleStepResult[] =>
  ANGLES.map((angle) => ({
    angle,
    label: ANGLE_CONFIG[angle].label,
    step1Image: null,
    step1Status: 'pending',
    step2Image: null,
    step2Status: 'pending',
  }));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HairRestore: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<PipelineStep>('upload');
  const [angleImages, setAngleImages] = useState<AngleImageMap>(EMPTY_IMAGES);
  const [drawings, setDrawings] = useState<AngleDrawingMap>(EMPTY_DRAWINGS);
  const [activeDrawingAngle, setActiveDrawingAngle] = useState<SimulationAngle>('frontal');
  const [selectedHairstyle, setSelectedHairstyle] = useState<HairstyleOption | null>(null);
  const [results, setResults] = useState<AngleStepResult[]>(makeInitialResults());
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadedCount = ANGLES.filter((a) => angleImages[a] !== null).length;
  const drawnCount = ANGLES.filter((a) => drawings[a].compositeDataUrl !== null).length;

  // --- File handling ---

  const handleFileChange = (angle: SimulationAngle, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAngleImages((prev) => ({ ...prev, [angle]: reader.result as string }));
      setDrawings((prev) => ({
        ...prev,
        [angle]: { drawingDataUrl: null, compositeDataUrl: null },
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (angle: SimulationAngle) => {
    setAngleImages((prev) => ({ ...prev, [angle]: null }));
    setDrawings((prev) => ({
      ...prev,
      [angle]: { drawingDataUrl: null, compositeDataUrl: null },
    }));
  };

  // --- Drawing ---

  const handleDrawingComplete = (
    angle: SimulationAngle,
    drawingDataUrl: string,
    compositeDataUrl: string
  ) => {
    setDrawings((prev) => ({
      ...prev,
      [angle]: { drawingDataUrl, compositeDataUrl },
    }));
  };

  // --- Step 1: Fill hair ---

  const runStep1 = async () => {
    setCurrentStep('step1_processing');
    setIsProcessing(true);
    setResults(makeInitialResults().map((r) => ({
      ...r,
      step1Status: drawings[r.angle].compositeDataUrl ? 'loading' as const : 'pending' as const,
    })));

    for (const angle of ANGLES) {
      const composite = drawings[angle].compositeDataUrl;
      if (!composite) continue;
      try {
        const image = await step1FillHair(composite, angle);
        setResults((prev) =>
          prev.map((r) =>
            r.angle === angle ? { ...r, step1Image: image, step1Status: 'success' as const } : r
          )
        );
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r) =>
            r.angle === angle
              ? { ...r, step1Status: 'error' as const, step1Error: err?.message }
              : r
          )
        );
      }
    }

    setIsProcessing(false);
    setCurrentStep('step1_done');
  };

  // --- Step 2: Apply hairstyle ---

  const runStep2 = async () => {
    if (!selectedHairstyle) return;
    setCurrentStep('step2_processing');
    setIsProcessing(true);

    setResults((prev) =>
      prev.map((r) => ({
        ...r,
        step2Status: r.step1Status === 'success' ? 'loading' as const : 'pending' as const,
        step2Image: null,
        step2Error: undefined,
      }))
    );

    for (const angle of ANGLES) {
      const step1 = results.find((r) => r.angle === angle);
      if (!step1?.step1Image) continue;
      try {
        const image = await step2ApplyHairstyle(step1.step1Image, angle, selectedHairstyle);
        setResults((prev) =>
          prev.map((r) =>
            r.angle === angle ? { ...r, step2Image: image, step2Status: 'success' as const } : r
          )
        );
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r) =>
            r.angle === angle
              ? { ...r, step2Status: 'error' as const, step2Error: err?.message }
              : r
          )
        );
      }
    }

    setIsProcessing(false);
    setCurrentStep('step2_done');
  };

  // --- Reset ---

  const resetAll = () => {
    setCurrentStep('upload');
    setAngleImages(EMPTY_IMAGES);
    setDrawings(EMPTY_DRAWINGS);
    setSelectedHairstyle(null);
    setResults(makeInitialResults());
    setActiveDrawingAngle('frontal');
    setIsProcessing(false);
  };

  // --- Helpers ---

  const getStepIndex = () => STEP_LABELS.findIndex((s) => s.key.includes(currentStep));

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h1 className="text-3xl font-black text-[#1D4998] leading-tight">
          SIMULACAO DE <span className="text-[#57BEB7]">TRANSPLANTE</span>
        </h1>
        <p className="text-gray-500 text-sm font-medium leading-relaxed">
          Envie fotos, marque as areas de calvicie, e veja o resultado com o penteado desejado.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-1 max-w-md mx-auto">
        {STEP_LABELS.map((step, i) => {
          const active = getStepIndex();
          const done = i < active;
          const isCurrent = i === active;
          return (
            <React.Fragment key={step.label}>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                    done
                      ? 'bg-[#57BEB7] text-white'
                      : isCurrent
                      ? 'bg-[#1D4998] text-white shadow-md'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {done ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-[8px] font-bold uppercase tracking-wider ${
                    isCurrent ? 'text-[#1D4998]' : done ? 'text-[#57BEB7]' : 'text-gray-300'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 rounded-full mt-[-12px] ${
                    i < active ? 'bg-[#57BEB7]' : 'bg-gray-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-6">

          {/* ================================================================
              STEP: UPLOAD
          ================================================================ */}
          {currentStep === 'upload' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ANGLES.map((angle) => {
                  const config = ANGLE_CONFIG[angle];
                  const img = angleImages[angle];

                  return (
                    <div key={angle} className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                          {config.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{config.instruction}</span>
                      </div>

                      {img ? (
                        <div className="relative rounded-xl overflow-hidden aspect-square shadow-md border-2 border-[#57BEB7]/30 group">
                          <img src={img} alt={config.label} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeImage(angle)}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="absolute bottom-2 left-2 bg-[#57BEB7]/80 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Enviado
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center px-4 py-10 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#57BEB7] hover:bg-[#57BEB7]/5 transition-all aspect-square group">
                          <div className="bg-white p-3 rounded-xl shadow-sm mb-3 group-hover:scale-110 transition-transform">
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

              {uploadedCount > 0 && (
                <button
                  onClick={() => setCurrentStep('draw')}
                  className="w-full py-4 bg-[#57BEB7] text-white rounded-2xl font-black text-sm shadow-xl shadow-[#57BEB7]/20 hover:bg-[#48a9a3] transition-all flex items-center justify-center gap-2 animate-slide-up uppercase tracking-wider"
                >
                  Proximo: Marcar Areas ({uploadedCount} {uploadedCount === 1 ? 'foto' : 'fotos'})
                </button>
              )}
            </div>
          )}

          {/* ================================================================
              STEP: DRAW
          ================================================================ */}
          {currentStep === 'draw' && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-[#1D4998]">
                  Marque com o dedo ou mouse as areas onde deseja cabelo
                </p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                  Pinte de verde as regioes de calvicie que devem ser preenchidas
                </p>
              </div>

              {/* Angle tabs */}
              <div className="flex gap-2 justify-center">
                {ANGLES.map((angle) => {
                  if (!angleImages[angle]) return null;
                  const isActive = activeDrawingAngle === angle;
                  const hasDraw = drawings[angle].compositeDataUrl !== null;
                  return (
                    <button
                      key={angle}
                      onClick={() => setActiveDrawingAngle(angle)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        isActive
                          ? 'bg-[#1D4998] text-white shadow-md'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {ANGLE_CONFIG[angle].label}
                      {hasDraw && (
                        <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-[#57BEB7]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active drawing canvas */}
              {angleImages[activeDrawingAngle] && (
                <DrawingCanvas
                  key={activeDrawingAngle}
                  photoDataUrl={angleImages[activeDrawingAngle]!}
                  onDrawingComplete={(drawUrl, compUrl) =>
                    handleDrawingComplete(activeDrawingAngle, drawUrl, compUrl)
                  }
                  width={500}
                />
              )}

              {/* Preview of drawn composites */}
              {drawnCount > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {ANGLES.map((angle) => {
                    const comp = drawings[angle].compositeDataUrl;
                    if (!comp) return null;
                    return (
                      <div key={angle} className="relative rounded-xl overflow-hidden border border-[#57BEB7]/20 shadow-sm">
                        <img src={comp} alt={`Marcacao ${ANGLE_CONFIG[angle].label}`} className="w-full aspect-square object-cover" />
                        <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                          {ANGLE_CONFIG[angle].label} — Marcado
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('upload')}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-gray-50 transition-all"
                >
                  Voltar
                </button>
                {drawnCount > 0 && (
                  <button
                    onClick={runStep1}
                    className="flex-1 py-3 bg-[#57BEB7] text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-lg hover:bg-[#48a9a3] transition-all"
                  >
                    Iniciar Preenchimento ({drawnCount} {drawnCount === 1 ? 'angulo' : 'angulos'})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              STEP: STEP 1 PROCESSING / RESULTS
          ================================================================ */}
          {(currentStep === 'step1_processing' || currentStep === 'step1_done') && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <p className="text-sm font-bold text-[#1D4998]">
                  {currentStep === 'step1_processing' ? 'Preenchendo cabelo nas areas marcadas...' : 'Preenchimento concluido!'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {results.map((r) => {
                  const original = angleImages[r.angle];
                  if (!original) return null;

                  return (
                    <div key={r.angle} className="space-y-2">
                      <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                        {r.label}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Before */}
                        <div className="relative rounded-xl overflow-hidden aspect-square border-2 border-gray-200 shadow-sm">
                          <img src={original} alt="Antes" className="w-full h-full object-cover" />
                          <div className="absolute bottom-1 left-1 bg-gray-800/70 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Antes
                          </div>
                        </div>

                        {/* Step 1 result */}
                        <div className="relative rounded-xl overflow-hidden aspect-square border-2 border-[#57BEB7]/20 bg-gray-50">
                          {r.step1Status === 'loading' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2">
                              <div className="w-10 h-10 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
                              <p className="text-[#1D4998] font-black text-[10px] uppercase tracking-widest animate-pulse">
                                Preenchendo...
                              </p>
                            </div>
                          )}
                          {r.step1Status === 'success' && r.step1Image && (
                            <>
                              <img src={r.step1Image} alt="Preenchido" className="w-full h-full object-cover animate-fade-in" />
                              <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                                Preenchido
                              </div>
                            </>
                          )}
                          {r.step1Status === 'error' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2 p-3">
                              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-red-500 font-bold text-[9px] text-center">Erro</p>
                              {r.step1Error && (
                                <p className="text-gray-400 text-[8px] text-center">{r.step1Error}</p>
                              )}
                            </div>
                          )}
                          {r.step1Status === 'pending' && (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-gray-300 text-[10px] font-bold uppercase">Aguardando</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions after step 1 */}
              {currentStep === 'step1_done' && (
                <div className="space-y-3">
                  {results.some((r) => r.step1Status === 'success') && (
                    <button
                      onClick={() => setCurrentStep('select_hairstyle')}
                      className="w-full py-4 bg-[#57BEB7] text-white rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg hover:bg-[#48a9a3] transition-all"
                    >
                      Proximo: Escolher Penteado
                    </button>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentStep('draw')}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-gray-50 transition-all"
                    >
                      Refazer Marcacao
                    </button>
                    <button
                      onClick={resetAll}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-gray-50 transition-all"
                    >
                      Nova Simulacao
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              STEP: SELECT HAIRSTYLE
          ================================================================ */}
          {currentStep === 'select_hairstyle' && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-[#1D4998]">Escolha o penteado desejado</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                  O modelo aplicara o estilo sobre o resultado do preenchimento
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {HAIRSTYLE_OPTIONS.map((hs) => {
                  const selected = selectedHairstyle?.id === hs.id;
                  return (
                    <button
                      key={hs.id}
                      onClick={() => setSelectedHairstyle(hs)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? 'border-[#57BEB7] bg-[#57BEB7]/10 shadow-md'
                          : 'border-gray-200 hover:border-[#57BEB7]/40 hover:bg-gray-50'
                      }`}
                    >
                      <p className={`text-xs font-black uppercase tracking-wider ${selected ? 'text-[#1D4998]' : 'text-gray-700'}`}>
                        {hs.label}
                      </p>
                      <p className="text-[9px] text-gray-400 mt-1 leading-snug">{hs.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Step 1 results preview */}
              <div className="grid grid-cols-2 gap-3">
                {results.map((r) => {
                  if (!r.step1Image) return null;
                  return (
                    <div key={r.angle} className="relative rounded-xl overflow-hidden border border-[#57BEB7]/20 shadow-sm">
                      <img src={r.step1Image} alt={r.label} className="w-full aspect-square object-cover" />
                      <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                        {r.label} — Preenchido
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('step1_done')}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-gray-50 transition-all"
                >
                  Voltar
                </button>
                {selectedHairstyle && (
                  <button
                    onClick={runStep2}
                    className="flex-1 py-3 bg-[#57BEB7] text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-lg hover:bg-[#48a9a3] transition-all"
                  >
                    Aplicar: {selectedHairstyle.label}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              STEP: STEP 2 PROCESSING / FINAL RESULT
          ================================================================ */}
          {(currentStep === 'step2_processing' || currentStep === 'step2_done') && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <p className="text-sm font-bold text-[#1D4998]">
                  {currentStep === 'step2_processing'
                    ? `Aplicando penteado: ${selectedHairstyle?.label}...`
                    : 'Simulacao concluida!'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {results.map((r) => {
                  const original = angleImages[r.angle];
                  if (!original) return null;

                  return (
                    <div key={r.angle} className="space-y-2">
                      <span className="text-xs font-black text-[#1D4998] uppercase tracking-wider">
                        {r.label}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Before (original) */}
                        <div className="relative rounded-xl overflow-hidden aspect-square border-2 border-gray-200 shadow-sm">
                          <img src={original} alt="Antes" className="w-full h-full object-cover" />
                          <div className="absolute bottom-1 left-1 bg-gray-800/70 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Antes
                          </div>
                        </div>

                        {/* Step 2 result (or loading) */}
                        <div className="relative rounded-xl overflow-hidden aspect-square border-2 border-[#57BEB7]/20 bg-gray-50">
                          {r.step2Status === 'loading' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2">
                              <div className="w-10 h-10 border-4 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
                              <p className="text-[#1D4998] font-black text-[10px] uppercase tracking-widest animate-pulse">
                                Estilizando...
                              </p>
                            </div>
                          )}
                          {r.step2Status === 'success' && r.step2Image && (
                            <>
                              <img src={r.step2Image} alt="Final" className="w-full h-full object-cover animate-fade-in" />
                              <div className="absolute bottom-1 left-1 bg-[#57BEB7]/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                                Resultado
                              </div>
                            </>
                          )}
                          {r.step2Status === 'error' && (
                            <div className="flex flex-col items-center justify-center h-full space-y-2 p-3">
                              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-red-500 font-bold text-[9px] text-center">Erro</p>
                              {r.step2Error && (
                                <p className="text-gray-400 text-[8px] text-center">{r.step2Error}</p>
                              )}
                            </div>
                          )}
                          {r.step2Status === 'pending' && (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-gray-300 text-[10px] font-bold uppercase">Aguardando</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Download */}
                      {r.step2Status === 'success' && r.step2Image && (
                        <a
                          href={r.step2Image}
                          download={`homenz-simulacao-${r.angle}-final.png`}
                          className="block py-2 bg-[#1D4998] text-white text-center font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-[#153a7a] transition-all shadow-md"
                        >
                          Salvar {r.label}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              {currentStep === 'step2_done' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setCurrentStep('select_hairstyle')}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-gray-50 transition-all"
                  >
                    Trocar Penteado
                  </button>
                  <button
                    onClick={resetAll}
                    className="flex-1 py-3 bg-[#1D4998] text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-md hover:bg-[#153a7a] transition-all"
                  >
                    Nova Simulacao
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default HairRestore;
