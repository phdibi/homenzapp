
export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

export type SimulationAngle = 'frontal' | 'lateral' | 'top';

export interface AngleSimulationResult {
  angle: SimulationAngle;
  label: string;
  image: string | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}

export interface RestorationResult {
  results: AngleSimulationResult[];
}
