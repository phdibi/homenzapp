
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
You are a photorealistic image editor. You simulate FUE hair transplant results.

INPUT: Multiple photos of the SAME person showing hair loss.

YOUR TASK: Edit the photo to show this person 12 months after a 3500-graft FUE transplant. The transformation must be DRAMATIC and visible.

=== HAIR TRANSPLANT ZONE MAP ===

A surgeon would draw these zones on the patient's head before surgery. You must fill each zone with hair:

ZONE A — NEW HAIRLINE (the soft front edge):
Position the new hairline about 7-8cm above the eyebrows (roughly 4 finger-widths). The face should follow the rule of thirds: forehead = 1/3, mid-face = 1/3, lower face = 1/3. Currently the forehead is too tall — hair must grow lower to restore this proportion. The hairline border is slightly irregular/wavy (zigzag, NOT straight). At the very front edge: sparse thin individual hairs creating a soft see-through border. Just behind (1-2cm): progressively denser hair.

ZONE B — TEMPLE POINTS (the side corners):
Sharp angular corners of hair on each side where the hairline meets the temple. Hair here grows DOWNWARD and slightly backward at very flat angles against the skin. The temples must transition smoothly into the sideburns — no gaps, no bald patches on the sides of the head.

ZONE C — FRONTAL DENSITY (the main mass behind the hairline):
Dense thick hair behind the new hairline. This is where the visual "fullness" comes from. No scalp visible. Same hair length as patient's existing hair.

ZONE D — MID-SCALP & CROWN:
Fill any thin areas where scalp shows through. Natural whorl pattern at crown. Hair flows front-to-back.

=== PRESERVE (do not alter) ===
- Face, skin, beard, expression — identical to input
- Hair length and hairstyle — same cut, just more density and coverage
- Background, lighting, clothing, photo quality
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
OUTPUT: One FRONTAL photo (face looking at camera, same pose as input).

The patient's hairstyle and hair length must stay EXACTLY as they are now. Only the COVERAGE AREA changes — hair now grows where before there was bald skin.

KEY CHANGES — apply the zone map to this frontal view:
1. ZONE A: New hairline ~7-8cm above eyebrows. The face must follow the rule of thirds — forehead = 1/3 of face height. Currently the forehead is too tall. Soft irregular border with sparse single hairs at the very edge, denser 1-2cm behind.
2. ZONE B: Both bald temple triangles COMPLETELY filled with hair. Sharp temple points framing the face — zero bare skin on the sides.
3. ZONE C: Dense hair behind the new hairline. No scalp visible anywhere.

Face identical to input. Same hair length — only more coverage.
`,

  lateral_left: `
OUTPUT: One LEFT SIDE PROFILE photo.

CAMERA: Shows LEFT cheek, LEFT ear, LEFT jawline. Nose points RIGHT. LEFT EAR visible, RIGHT ear NOT visible.

KEY CHANGES — apply the zone map to this side view:
1. ZONE B (most visible change from this angle): The bald area on the side of the head between the forehead and the ear must be COMPLETELY filled. Hair flows continuously from the top of the head down past the temple to the ear — zero bald patches on the side. Temple hair grows DOWNWARD at flat angles against the skin, transitioning smoothly into the sideburn.
2. ZONE A: Hairline starts LOWER/further forward on the forehead than in the input. Soft irregular edge.
3. ZONE C: Thick full hair everywhere behind the hairline — no scalp peeking through.

Same hair length and style. Face identical to input.
`,

  lateral_right: `
OUTPUT: One RIGHT SIDE PROFILE photo.

CAMERA: Shows RIGHT cheek, RIGHT ear, RIGHT jawline. Nose points LEFT. RIGHT EAR visible, LEFT ear NOT visible.

KEY CHANGES — apply the zone map to this side view:
1. ZONE B (most visible change from this angle): The bald area on the side of the head between the forehead and the ear must be COMPLETELY filled. Hair flows continuously from the top of the head down past the temple to the ear — zero bald patches on the side. Temple hair grows DOWNWARD at flat angles against the skin, transitioning smoothly into the sideburn.
2. ZONE A: Hairline starts LOWER/further forward on the forehead than in the input. Soft irregular edge.
3. ZONE C: Thick full hair everywhere behind the hairline — no scalp peeking through.

Same hair length and style. Face identical to input.
`,

  top: `
OUTPUT: One TOP-DOWN photo (looking down at the top of the head).

KEY CHANGES — apply the zone map to this top view:
1. ZONE A: Hair starts FURTHER FORWARD on the head (lower hairline visible from above). Soft irregular border at the front edge.
2. ZONE C + D: Complete scalp coverage. Zero skin visible anywhere. Dense carpet of hair filling every thin spot.
3. Natural hair direction: flows forward in front, front-to-back on mid-scalp, whorl pattern at crown.

Same hair length — the change is DENSITY and COVERAGE, not length.
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
