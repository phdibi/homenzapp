import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

// Reutiliza a instância da API (evita criar uma nova para cada chamada)
let _aiInstance: InstanceType<typeof GoogleGenAI> | null = null;
const getAI = (): InstanceType<typeof GoogleGenAI> => {
  if (!_aiInstance) {
    _aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return _aiInstance;
};

/**
 * Comprime imagem para reduzir payload enviado à API.
 * Reduz para max 1024px no maior lado e qualidade JPEG 0.8.
 */
const compressImage = (base64DataUrl: string, maxSize = 1024, quality = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(base64DataUrl); // fallback: usa original
    img.src = base64DataUrl;
  });
};

/**
 * Seleciona e comprime 1 imagem para enviar à API.
 * Envia apenas 1 foto — sem ambiguidade sobre qual imagem editar.
 */
const selectImageForAngle = async (
  base64Images: string[],
  _angle: SimulationAngle
): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  const compressed = await compressImage(base64Images[0]);
  return { inlineData: { data: compressed.split(',')[1], mimeType: 'image/jpeg' } };
};

/**
 * Prompts otimizados para resultados fotorrealistas de alta densidade.
 * Instruções explícitas sobre linha frontal, têmporas e densidade.
 */
const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Edit this photo to create a realistic, high-density hair transplant result.

1. Hairline & Forehead: Lower the hairline significantly (approx. 2-3cm) to reduce forehead height. Create a youthful, defined hairline (straight or slightly curved). If there are surgical markings on the forehead, use the lowest line as the new hairline and fill above it; remove the markings.
2. Temples: Completely fill the receding temple corners (temporal triangles). Eliminate any 'M' shape.
3. Density: Add thick, dense hair to all thinning areas. No scalp should be visible in the treated zones. match the density of the thickest existing hair.
4. Natural Look: Match the existing hair texture, color, and flow perfectly. Keep the face, skin, and background unchanged.`,

  lateral_left: `Edit this photo to create a realistic, high-density hair transplant result from the left side.

1. Temple & Sideburn: Completely fill the temporal recession. Connect the new hairline to the sideburn with a sharp, dense angle (temporal point).
2. Hairline: Extend the hairline forward to reduce forehead prominence.
3. Density: Ensure high hair density in the filled areas. No scalp visible.
4. Consistency: Match existing hair characteristics. Keep facial features and background unchanged.`,

  lateral_right: `Edit this photo to create a realistic, high-density hair transplant result from the right side.

1. Temple & Sideburn: Completely fill the temporal recession. Connect the new hairline to the sideburn with a sharp, dense angle (temporal point).
2. Hairline: Extend the hairline forward to reduce forehead prominence.
3. Density: Ensure high hair density in the filled areas. No scalp visible.
4. Consistency: Match existing hair characteristics. Keep facial features and background unchanged.`,

  top: `Edit this photo to create a realistic, high-density hair transplant result from the top view.

1. Coverage: Fill the entire top area (crown, vertex, mid-scalp) with dense hair.
2. Hairline: Show a lower, continuous, and thick hairline at the front.
3. Density: Maximize density to ensure no scalp is visible.
4. Natural: Match the natural growth direction and texture. Remove any surgical markings if present.`,
};

export const restoreHairForAngle = async (
  base64Images: string[],
  angle: SimulationAngle
): Promise<string> => {
  const ai = getAI();
  const imagePart = await selectImageForAngle(base64Images, angle);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        imagePart,
        { text: PROMPTS[angle] }
      ]
    },
    config: {
      responseModalities: ['image'],
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error(`Falha ao gerar simulação para ângulo: ${angle}`);
};

export const restoreHairAllAngles = async (
  base64Images: string[],
  onResult: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'lateral_left', 'lateral_right', 'top'];

  const promises = angles.map(async (angle) => {
    try {
      const image = await restoreHairForAngle(base64Images, angle);
      onResult(angle, { image });
    } catch (err: any) {
      onResult(angle, { error: err?.message || 'Erro desconhecido' });
    }
  });

  await Promise.allSettled(promises);
};
