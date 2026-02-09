
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

const BASE_FUE_PROMPT = `
You are a photorealistic image editor specializing in hair transplant simulations.

INPUT: Multiple photos of the SAME person from different angles showing hair loss (receding hairline, temple recession, thinning).

YOUR TASK: Edit the photo to show this person with a FULL HEAD OF HAIR — as if they received a 3500-graft FUE transplant 12 months ago. The result must be a DRAMATIC transformation.

=== THE 3 CHANGES YOU MUST MAKE ===

1. FILL THE FOREHEAD WITH HAIR — MAKE THE FOREHEAD MUCH SMALLER:
The patient's forehead looks tall/large because hair has receded. You must draw/paint hair growing on the upper forehead skin so the forehead becomes visibly SHORTER. The hairline must start much lower — roughly 30-40% less forehead visible. The new hairline has a natural wavy shape (not straight). Keep the same hair length and style — just add coverage on the bald forehead area.

2. FILL THE TEMPLE TRIANGLES ("ENTRADAS"):
The bald V-shaped areas at both temples must be completely covered with hair. Zero bare skin remaining at the temples. The hair at the temples angles downward toward the face.

3. FILL ALL THIN/SPARSE AREAS:
Wherever scalp skin is visible through thin hair, add enough hair density so the scalp is completely hidden. More hair strands growing from the roots — same length as existing hair.

=== PRESERVE THESE (do not alter) ===
- Face, skin, beard, expression, eyes, nose, ears — identical to input
- Hair length and hairstyle — same cut, just more density and coverage
- Background, lighting, clothing, photo quality
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
OUTPUT: One FRONTAL photo (face looking at camera, same pose as input).

KEY CHANGES for this angle:
1. The forehead must be MUCH SHORTER — draw hair growing on the upper 30-40% of the currently bare forehead skin. This is the most important change. The hairline starts much lower, with a natural wavy border.
2. Both temple triangles ("entradas") completely filled with hair — zero bare skin at the temples.
3. All thin areas filled — no scalp visible through the hair.

The face must remain identical. The hair length and style must remain the same — only add density and lower the hairline.
`,

  lateral_left: `
OUTPUT: One LEFT SIDE PROFILE photo.

CAMERA: Shows LEFT cheek, LEFT ear, LEFT jawline. Nose points RIGHT. LEFT EAR visible, RIGHT ear NOT visible.

KEY CHANGES for this angle:
1. The bald/thin area at the LEFT TEMPLE (the concave gap between hairline and ear) must be completely filled with hair. The head silhouette from forehead to ear becomes a smooth continuous curve of hair — no bald dip.
2. The hairline starts LOWER on the forehead — less forehead visible from this side than in the input.
3. Hair has full density everywhere — no scalp visible.

Keep the same hair length and style. Face identical to input.
`,

  lateral_right: `
OUTPUT: One RIGHT SIDE PROFILE photo.

CAMERA: Shows RIGHT cheek, RIGHT ear, RIGHT jawline. Nose points LEFT. RIGHT EAR visible, LEFT ear NOT visible.

KEY CHANGES for this angle:
1. The bald/thin area at the RIGHT TEMPLE (the concave gap between hairline and ear) must be completely filled with hair. The head silhouette from forehead to ear becomes a smooth continuous curve of hair — no bald dip.
2. The hairline starts LOWER on the forehead — less forehead visible from this side than in the input.
3. Hair has full density everywhere — no scalp visible.

Keep the same hair length and style. Face identical to input.
`,

  top: `
OUTPUT: One TOP-DOWN photo (looking down at the top of the head).

KEY CHANGES for this angle:
1. Every spot where scalp skin shows through thin hair must be filled with dense hair. Looking down at the head, you should see ONLY hair — zero scalp skin visible anywhere. Add more hair strands at the roots (same length, more density).
2. The front edge of the hair starts FURTHER FORWARD on the head — hair covers more of the forehead area.
3. Natural hair direction: flows forward in front, front-to-back on mid-scalp, whorl pattern at crown.

Keep the same hair length. The change is DENSITY, not length.
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
