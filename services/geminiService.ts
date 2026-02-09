
import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

// Importa as imagens de referência before/after (Vite resolve como URL)
import refFrontUrl from '../assets/reference/fue-front-before-after.jpg';
import refLeftUrl from '../assets/reference/fue-left-before-after.jpg';
import refTopUrl from '../assets/reference/fue-top-before-after.jpg';

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

/**
 * Carrega uma imagem de URL e converte para base64 data URL.
 * Usado para carregar as imagens de referência antes/depois.
 */
const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Comprimir para max 800px para economizar tokens
      let { width, height } = img;
      const maxSize = 800;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error(`Failed to load reference image: ${url}`));
    img.src = url;
  });
};

// Cache das imagens de referência já convertidas para base64
let _refImageCache: Record<string, string> | null = null;

const getRefImageBase64 = async (angle: SimulationAngle): Promise<string> => {
  if (!_refImageCache) {
    // Carrega todas de uma vez (são só 3 imagens pequenas)
    const [front, left, top] = await Promise.all([
      loadImageAsBase64(refFrontUrl),
      loadImageAsBase64(refLeftUrl),
      loadImageAsBase64(refTopUrl),
    ]);
    _refImageCache = { front, left, top };
  }

  // Mapeia ângulo para imagem de referência
  switch (angle) {
    case 'frontal': return _refImageCache.front;
    case 'lateral_left': return _refImageCache.left;
    case 'lateral_right': return _refImageCache.left; // mesma ref (espelhada mentalmente)
    case 'top': return _refImageCache.top;
  }
};

const BASE_FUE_PROMPT = `
You are a photorealistic image editor specializing in hair transplant simulations.

REFERENCE IMAGE: The first image below is a REAL before/after photo from a clinical FUE hair transplant (left = before, right = after, 3000 grafts, 13 months post-op). Study the TRANSFORMATION carefully — notice how:
- The hairline moved MUCH lower on the forehead
- The temple triangles are completely filled with hair
- The overall density increased dramatically
- The hair length/style stayed the same — only density and coverage changed

YOUR TASK: Apply the SAME TYPE OF TRANSFORMATION to the patient in the remaining photos. The patient's photos show them from a specific angle with hair loss. Produce a single photo showing what they would look like after a similar FUE transplant.

THE TRANSFORMATION MUST BE AS DRAMATIC as the reference before/after. If your output looks similar to the patient's input, you have failed.

=== WHAT TO CHANGE ===
1. HAIRLINE: Draw hair on the upper forehead — make the forehead visibly shorter (30-40% less forehead). Natural wavy hairline border.
2. TEMPLES: Fill the bald V-shaped temple areas completely with hair.
3. DENSITY: Cover all areas where scalp shows through thin hair.

=== WHAT TO KEEP ===
- Face, skin, beard, expression — identical to the patient's photos
- Hair length and style — same cut, just more coverage and density
- Background, lighting, clothing, photo quality
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
OUTPUT: One FRONTAL photo (face looking at camera, same pose as the patient's input).

Look at the REFERENCE before/after — see how the frontal hairline dropped dramatically and temples were filled. Apply the same transformation:
1. Forehead MUCH SHORTER — hair growing on the previously bare upper forehead.
2. Both temple triangles filled — zero bare skin.
3. Full density — no scalp visible.
`,

  lateral_left: `
OUTPUT: One LEFT SIDE PROFILE photo.

CAMERA: Shows LEFT cheek, LEFT ear, LEFT jawline. Nose points RIGHT.

Look at the REFERENCE before/after — see how the lateral temple gap was completely filled and the hairline advanced forward. Apply the same transformation:
1. LEFT TEMPLE gap completely filled — smooth hair silhouette from forehead to ear.
2. Hairline starts LOWER on the forehead from this angle.
3. Full density — no scalp visible.
`,

  lateral_right: `
OUTPUT: One RIGHT SIDE PROFILE photo.

CAMERA: Shows RIGHT cheek, RIGHT ear, RIGHT jawline. Nose points LEFT.

Look at the REFERENCE before/after (it shows the left side — apply the MIRROR transformation to the right side):
1. RIGHT TEMPLE gap completely filled — smooth hair silhouette from forehead to ear.
2. Hairline starts LOWER on the forehead from this angle.
3. Full density — no scalp visible.
`,

  top: `
OUTPUT: One TOP-DOWN photo (looking down at the top of the head).

Look at the REFERENCE before/after — see how the top view went from visible scalp/thin hair to complete dense coverage. Apply the same transformation:
1. COMPLETE scalp coverage — zero skin visible through the hair from above.
2. Hair starts FURTHER FORWARD on the head (lower hairline visible from top).
3. Natural direction: forward in front, back-to-front on mid-scalp, whorl at crown.
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

  // Carrega a imagem de referência before/after para este ângulo
  const refBase64 = await getRefImageBase64(angle);
  const refPart = {
    inlineData: { data: refBase64.split(',')[1], mimeType: 'image/jpeg' }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        // Primeiro: imagem de referência before/after
        refPart,
        // Depois: fotos do paciente
        ...imageParts,
        // Por último: o prompt
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

  // Pré-carrega imagens de referência e comprime fotos do paciente em paralelo
  await Promise.all([
    prepareImageParts(base64Images),
    getRefImageBase64('frontal'), // isso carrega e cacheia todas
  ]);

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
