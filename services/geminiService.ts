
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
 * Isso reduz drasticamente o tamanho dos tokens de input (~70% menor).
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

const SYSTEM_INSTRUCTION = `You are a clinical hair restoration imaging specialist. You produce photorealistic FUE hair transplant simulation images for surgical planning. You ONLY output the edited photo — no text, no explanation.`;

const BASE_FUE_PROMPT = `
Professional medical hair transplant simulation on the provided portrait.

This patient will receive 3500 follicular unit grafts. Simulate the result 12 months post-op:

1. Redefine and lower the anterior hairline to a natural youthful position following facial symmetry — the forehead must occupy only the upper third of the face (rule of thirds). The new hairline has a soft irregular micro-zigzag border with sparse single-follicle units at the very edge, transitioning to dense multi-follicular units 1cm behind.

2. Reconstruct the temporal recessions bilaterally — fill both temple triangles completely with follicular units angled downward and slightly backward, creating sharp temporal points that flow seamlessly into the sideburns.

3. Increase follicular density across all thinning areas — plant dense follicular units wherever scalp skin is visible through existing hair. No bare scalp visible anywhere.

4. Ensure seamless integration between existing hair and simulated grafts — match the original hair color, texture, curl pattern, and length exactly. The transplanted follicles produce hair at the same length as the patient's current hair.

Constraints: preserve the person's facial identity, expression, skin, beard, ears, background, lighting, and clothing exactly. No altered face shape, no plastic appearance, no blurring, no changed hair color, no lengthened hair, no surgical artifacts, no scarring.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
Output one frontal photo — face looking directly at camera, same pose as input.

Priority changes visible from this angle:
1. The forehead is currently too tall. Lower the anterior hairline so the forehead occupies only the upper third of the face. New hairline has a soft micro-irregular border — sparse single follicles at the edge, dense growth just behind.
2. Both temporal recession triangles completely filled — sharp angular temporal points frame the upper face with zero bare skin at the temples.
3. Dense follicular coverage behind the hairline — no scalp visible through the hair.

Same hair length and style. Face identical to input.
`,

  lateral_left: `
Output one left lateral profile photo — showing left cheek, left ear, left jawline. Nose points right.

Priority changes visible from this angle:
1. The temporal recession on the left side is the most visible defect from this angle. Fill the entire bald area between the forehead and the ear with dense follicular units angled downward — hair flows continuously from the crown past the temple to the sideburn with zero gaps or bare patches.
2. The anterior hairline must start further forward (lower) on the forehead than in the input — a soft irregular transition from skin to dense hair.
3. Full density everywhere — no scalp visible through the hair from this side view.

Same hair length and style. Face identical to input.
`,

  lateral_right: `
Output one right lateral profile photo — showing right cheek, right ear, right jawline. Nose points left.

Priority changes visible from this angle:
1. The temporal recession on the right side is the most visible defect from this angle. Fill the entire bald area between the forehead and the ear with dense follicular units angled downward — hair flows continuously from the crown past the temple to the sideburn with zero gaps or bare patches.
2. The anterior hairline must start further forward (lower) on the forehead than in the input — a soft irregular transition from skin to dense hair.
3. Full density everywhere — no scalp visible through the hair from this side view.

Same hair length and style. Face identical to input.
`,

  top: `
Output one top-down photo — looking down at the crown and top of the head.

Priority changes visible from this angle:
1. The anterior hairline extends further forward — hair covers more of the forehead area when viewed from above. Soft irregular front edge.
2. Complete scalp coverage — dense follicular units fill every thin spot. Zero skin visible through the hair anywhere on the scalp.
3. Natural growth direction: forward flow at the frontal zone, front-to-back on mid-scalp, clockwise whorl pattern at the crown vertex.

Same hair length — the change is density and coverage, not length.
`,
};

/**
 * Prepara as imagens comprimidas e convertidas em parts para a API.
 * Cache para evitar recomprimir as mesmas imagens em chamadas paralelas.
 */
let _cachedImageParts: { key: string; parts: Array<{ inlineData: { data: string; mimeType: string } }> } | null = null;

const prepareImageParts = async (base64Images: string[]): Promise<Array<{ inlineData: { data: string; mimeType: string } }>> => {
  const cacheKey = base64Images.map(img => img.slice(-50)).join('|');

  if (_cachedImageParts && _cachedImageParts.key === cacheKey) {
    return _cachedImageParts.parts;
  }

  const compressed = await Promise.all(base64Images.map(img => compressImage(img)));
  const parts = compressed.map(img => ({
    inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
  }));

  _cachedImageParts = { key: cacheKey, parts };
  return parts;
};

export const restoreHairForAngle = async (
  base64Images: string[],
  angle: SimulationAngle
): Promise<string> => {
  const ai = getAI();
  const imageParts = await prepareImageParts(base64Images);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        ...imageParts,
        { text: BASE_FUE_PROMPT + ANGLE_PROMPTS[angle] }
      ]
    },
    config: {
      temperature: 0.3,
      responseModalities: ['image'],
      systemInstruction: SYSTEM_INSTRUCTION,
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

  // Pré-comprime as imagens uma única vez antes de disparar as 4 chamadas paralelas
  await prepareImageParts(base64Images);

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
