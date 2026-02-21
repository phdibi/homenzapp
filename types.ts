// --- Angles (2 only: frontal + top) ---
export type SimulationAngle = 'frontal' | 'top';

export type AngleImageMap = Record<SimulationAngle, string | null>;

// --- Drawing ---
export interface DrawingState {
  drawingDataUrl: string | null;
  compositeDataUrl: string | null;
}

export type AngleDrawingMap = Record<SimulationAngle, DrawingState>;

// --- Pipeline ---
export type PipelineStep =
  | 'upload'
  | 'draw'
  | 'processing'
  | 'done';

export interface AngleResult {
  angle: SimulationAngle;
  label: string;
  image: string | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}

// --- DrawingCanvas props ---
export interface DrawingCanvasProps {
  photoDataUrl: string;
  onDrawingComplete: (drawingDataUrl: string, compositeDataUrl: string) => void;
  width?: number;
  brushColor?: string;
  initialBrushSize?: number;
}
