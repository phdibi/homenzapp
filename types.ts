export type SimulationAngle = 'frontal' | 'lateral_left' | 'lateral_right' | 'top';

export type AngleImageMap = Record<SimulationAngle, string | null>;

/** Mask drawn by the user for a specific angle (green overlay data URL) */
export type AngleMaskMap = Record<SimulationAngle, string | null>;

export interface AngleSimulationResult {
  angle: SimulationAngle;
  label: string;
  image: string | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}
