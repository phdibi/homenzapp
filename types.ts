export type SimulationAngle = 'frontal' | 'lateral_left' | 'lateral_right' | 'top';

export type AngleImageMap = Record<SimulationAngle, string | null>;

export interface AngleSimulationResult {
  angle: SimulationAngle;
  label: string;
  image: string | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}
