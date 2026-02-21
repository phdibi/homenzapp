// --- Angles (2 only: frontal + top) ---
export type SimulationAngle = 'frontal' | 'top';

export type AngleImageMap = Record<SimulationAngle, string | null>;

// --- Drawing ---
export interface DrawingState {
  drawingDataUrl: string | null;
  compositeDataUrl: string | null;
}

export type AngleDrawingMap = Record<SimulationAngle, DrawingState>;

// --- Hairstyles ---
export type HairstyleId =
  | 'side_part'
  | 'slick_back'
  | 'textured_crop'
  | 'buzz_cut'
  | 'messy_textured'
  | 'pompadour'
  | 'crew_cut'
  | 'natural_flow';

export interface HairstyleOption {
  id: HairstyleId;
  label: string;
  description: string;
  promptFragment: string;
}

// --- Pipeline ---
export type PipelineStep =
  | 'upload'
  | 'draw'
  | 'step1_processing'
  | 'step1_done'
  | 'select_hairstyle'
  | 'step2_processing'
  | 'step2_done';

export interface AngleStepResult {
  angle: SimulationAngle;
  label: string;
  step1Image: string | null;
  step1Status: 'pending' | 'loading' | 'success' | 'error';
  step1Error?: string;
  step2Image: string | null;
  step2Status: 'pending' | 'loading' | 'success' | 'error';
  step2Error?: string;
}

// --- DrawingCanvas props ---
export interface DrawingCanvasProps {
  photoDataUrl: string;
  onDrawingComplete: (drawingDataUrl: string, compositeDataUrl: string) => void;
  width?: number;
  brushColor?: string;
  initialBrushSize?: number;
}
