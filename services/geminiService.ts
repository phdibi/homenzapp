
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

1. SHRINK THE FOREHEAD — ADD SHORT HAIR ON THE BALD FOREHEAD SKIN:
The patient's forehead is tall because hair has receded. On the upper part of the forehead where there is currently only bare skin, add short hair growth (same length as the patient's existing hair) so the forehead appears 30-40% shorter. The new hairline has a natural wavy irregular border. IMPORTANT: the new hair must be the same length as the existing hair — do NOT make hair longer or change the hairstyle.

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

The patient's hairstyle and hair length must stay EXACTLY as they are now. Only the COVERAGE AREA changes — hair now grows where before there was bald skin.

KEY CHANGES:
1. FOREHEAD SHORTER: Short hair (same length as existing) now grows on the upper 30-40% of the currently bare forehead. The forehead appears much smaller.
2. TEMPLES FILLED: Both bald temple triangles covered with hair — zero bare skin.
3. DENSITY: No scalp visible through thin areas.

Face identical to input. Same hair length — only more coverage.
`,

  lateral_left: `
OUTPUT: One LEFT SIDE PROFILE photo.

CAMERA: Shows LEFT cheek, LEFT ear, LEFT jawline. Nose points RIGHT. LEFT EAR visible, RIGHT ear NOT visible.

KEY CHANGES:
1. TEMPLE AREA: Look at the side of the head between the forehead and the ear — there is a bald/shaved-looking area where hair is missing or very thin. Fill this ENTIRE area with thick hair so the hair flows continuously from the top of the head down past the temple to the ear. No bald patches on the side of the head.
2. HAIRLINE: The point where hair starts on the forehead must be LOWER/further forward than in the input.
3. DENSITY: Thick, full hair everywhere — no scalp peeking through.

Same hair length and style. Face identical to input.
`,

  lateral_right: `
OUTPUT: One RIGHT SIDE PROFILE photo.

CAMERA: Shows RIGHT cheek, RIGHT ear, RIGHT jawline. Nose points LEFT. RIGHT EAR visible, LEFT ear NOT visible.

KEY CHANGES:
1. TEMPLE AREA: Look at the side of the head between the forehead and the ear — there is a bald/shaved-looking area where hair is missing or very thin. Fill this ENTIRE area with thick hair so the hair flows continuously from the top of the head down past the temple to the ear. No bald patches on the side of the head.
2. HAIRLINE: The point where hair starts on the forehead must be LOWER/further forward than in the input.
3. DENSITY: Thick, full hair everywhere — no scalp peeking through.

Same hair length and style. Face identical to input.
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
