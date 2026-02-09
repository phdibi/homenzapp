
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
 * Prompts curtos e diretos — 1 por ângulo.
 * Sem jargão médico, sem negative prompts, linguagem 100% positiva e visual.
 */
const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Edit this photo to show hair transplant results.

Add thick hair to cover the forehead — the hairline must come down significantly so the forehead is only 1/3 of the face height. Fill both temple corners completely with hair. No bald patches anywhere at the temples or forehead.

Cover all thin/sparse areas with dense hair. No scalp visible through the hair.

Keep the same face, expression, skin, ears, beard, background, hair color, and hair length. Only add new hair where skin is currently bare or thin.`,

  lateral_left: `Edit this photo to show hair transplant results from the left side.

Fill the temple area completely — the gap between the top of the head and the ear must be covered with dense hair flowing down to the sideburn. No bare skin visible at the temple. Lower the hairline so it starts further forward on the forehead.

Keep the same face, expression, skin, ears, background, hair color, and hair length.`,

  lateral_right: `Edit this photo to show hair transplant results from the right side.

Fill the temple area completely — the gap between the top of the head and the ear must be covered with dense hair flowing down to the sideburn. No bare skin visible at the temple. Lower the hairline so it starts further forward on the forehead.

Keep the same face, expression, skin, ears, background, hair color, and hair length.`,

  top: `Edit this photo to show hair transplant results from above.

Add dense hair covering every spot where scalp skin is visible. The hairline extends further forward. No bald spots anywhere. Natural growth direction.

Keep the same hair color and length. Only add density and coverage.`,
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
