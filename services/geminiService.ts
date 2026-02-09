import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle, AngleImageMap } from "../types";

// Import reference images (Vite serves as URLs)
import refFrontUrl from '../assets/reference/fue-front-before-after.jpg';
import refLeftUrl from '../assets/reference/fue-left-before-after.jpg';
import refTopUrl from '../assets/reference/fue-top-before-after.jpg';

// ---------------------------------------------------------------------------
// API Instance (singleton)
// ---------------------------------------------------------------------------
let _aiInstance: InstanceType<typeof GoogleGenAI> | null = null;
const getAI = (): InstanceType<typeof GoogleGenAI> => {
  if (!_aiInstance) {
    _aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return _aiInstance;
};

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Comprime imagem para max 1536px, JPEG quality 0.85 */
const compressImage = (base64DataUrl: string, maxSize = 1536, quality = 0.85): Promise<string> => {
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
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64DataUrl);
    img.src = base64DataUrl;
  });
};

type InlineDataPart = { inlineData: { data: string; mimeType: string } };

/** Prepara imagem do paciente como part inline */
const preparePatientPart = async (base64DataUrl: string): Promise<InlineDataPart> => {
  const compressed = await compressImage(base64DataUrl);
  return { inlineData: { data: compressed.split(',')[1], mimeType: 'image/jpeg' } };
};

// ---------------------------------------------------------------------------
// Reference image loading & cache
// ---------------------------------------------------------------------------

const REF_IMAGE_MAP: Record<SimulationAngle, string> = {
  frontal: refFrontUrl,
  lateral_left: refLeftUrl,
  lateral_right: refLeftUrl, // mesma ref left, prompt pede mirror
  top: refTopUrl,
};

const loadImageAsBase64 = async (url: string): Promise<string> => {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const _refCache: Record<string, string> = {};
const getReferencePart = async (angle: SimulationAngle): Promise<InlineDataPart> => {
  const url = REF_IMAGE_MAP[angle];
  if (!_refCache[url]) {
    _refCache[url] = await loadImageAsBase64(url);
  }
  const base64 = _refCache[url];
  return { inlineData: { data: base64.split(',')[1], mimeType: 'image/jpeg' } };
};

// ---------------------------------------------------------------------------
// Prompts — Turn 1: Analyse reference before/after
// ---------------------------------------------------------------------------

const REFERENCE_PROMPT: Record<SimulationAngle, string> = {
  frontal: `This photo shows a real hair transplant result: left side is BEFORE surgery, right side is 12 months AFTER surgery.

Describe exactly what changed: How did the hairline move? How were the bald temple corners filled? How did the density change? What stayed the same about the person's face?

I will show you my patient's photo next and need you to create the same transformation.`,

  lateral_left: `This photo shows a real hair transplant before/after from the left side (left=before, right=after).

Describe what changed: How was the temple gap filled? How did the hairline profile change from forehead to ear? How did density improve?

I will show you my patient's left side photo next.`,

  lateral_right: `This photo shows a real hair transplant before/after from the left side. I need you to understand the transformation and later apply the mirrored version to a right-side photo.

Describe the transformation: temple filling, hairline change, density improvement.

I will show you my patient's right side photo next.`,

  top: `This photo shows a real hair transplant before/after from above (left=before, right=after).

Describe what changed: How did the scalp coverage improve? How far forward does the hairline extend after? How complete is the coverage?

I will show you my patient's top view next.`,
};

// ---------------------------------------------------------------------------
// Prompts — Turn 2: Generate patient transformation (image output)
// ---------------------------------------------------------------------------

const PATIENT_PROMPT: Record<SimulationAngle, string> = {
  frontal: `Now here is my patient's frontal photo. Generate a photorealistic image showing what this SAME person would look like after the same type of hair transplant you just analyzed.

The result must show:
- Hair growing on the previously bare forehead skin, making the forehead visibly shorter
- Both temple corners completely filled with thick hair, no M-shape remaining
- Dense hair coverage everywhere, no scalp visible through the hair
- Same face, skin, expression, ears, beard, clothing, background, hair color, and hair length

Output one photorealistic photo of this person with the transplant result.`,

  lateral_left: `Here is my patient's left side photo. Generate a photorealistic image of this SAME person after the same hair transplant transformation.

The result must show:
- The bare temple area between forehead and ear completely covered with dense hair
- A smooth hairline silhouette from forehead to behind the ear with no gaps
- Full density, no scalp visible from this angle
- Same face, pose, background, hair color and length

Output one photorealistic left-side photo.`,

  lateral_right: `Here is my patient's right side photo. Generate a photorealistic image of this SAME person after the same type of hair transplant, mirrored to the right side.

The result must show:
- The bare temple area between forehead and ear completely covered with dense hair
- A smooth hairline silhouette from forehead to behind the ear with no gaps
- Full density, no scalp visible from this angle
- Same face, pose, background, hair color and length

Output one photorealistic right-side photo.`,

  top: `Here is my patient's top-of-head photo. Generate a photorealistic image of this SAME person's head from above after the same hair transplant transformation.

The result must show:
- Complete scalp coverage, no bare skin visible anywhere from above
- The hairline extending further forward than the current state
- Natural growth direction: forward at front, clockwise whorl at crown
- Same hair color and texture, just dramatically more coverage

Output one photorealistic top-view photo.`,
};

// ---------------------------------------------------------------------------
// Prompts — Fallback: 2-image single call (reference + patient)
// ---------------------------------------------------------------------------

const COMBINED_PROMPT: Record<SimulationAngle, string> = {
  frontal: `Image 1 shows a real hair transplant before/after (left=before, right=after). Image 2 is my patient's frontal photo.

Generate a photorealistic photo of the patient (Image 2) showing what they would look like after the same type of hair transplant shown in Image 1. Hair must grow on the bare forehead skin, both temple corners must be filled with thick hair, dense coverage everywhere, no scalp visible. Same face, same person, same hair color and length. Output one frontal photo.`,

  lateral_left: `Image 1 shows a real hair transplant before/after from the left side (left=before, right=after). Image 2 is my patient's left side photo.

Generate a photorealistic photo of the patient (Image 2) after the same transformation. The bare temple area must be completely filled with hair, smooth hairline from forehead to ear, full density. Same face, pose, background, hair color. Output one left-side photo.`,

  lateral_right: `Image 1 shows a real hair transplant before/after from the left side. Image 2 is my patient's right side photo.

Generate a photorealistic photo of the patient (Image 2) after the same transformation mirrored to the right side. The bare temple area must be completely filled with hair, smooth hairline from forehead to ear, full density. Same face, pose, background, hair color. Output one right-side photo.`,

  top: `Image 1 shows a real hair transplant before/after from above (left=before, right=after). Image 2 is my patient's top-of-head photo.

Generate a photorealistic photo of the patient's head (Image 2) after the same transformation. Complete scalp coverage, no bare skin visible, hairline further forward, natural growth direction. Same hair color and texture. Output one top-view photo.`,
};

// ---------------------------------------------------------------------------
// Prompts — Fallback 2: Generation-only (no reference)
// ---------------------------------------------------------------------------

const GENERATION_PROMPT: Record<SimulationAngle, string> = {
  frontal: `Look at this person's face carefully. Now generate a photorealistic photo of this EXACT same person, but imagine they have a full head of thick, dense hair.

Their hairline must sit low on the forehead (forehead is only 1/3 of face height). Both temple corners are covered with hair. Thick dense hair everywhere, no scalp visible. Same face, skin, expression, beard, clothing, background. Same hair color and texture, just much more hair growing where there was bare skin before.`,

  lateral_left: `Look at this person's left side profile. Generate a photorealistic photo of this EXACT same person, but with a full head of thick, dense hair.

The temple area between forehead and ear must be completely covered with hair flowing to the sideburn. Smooth hairline silhouette from forehead to behind the ear. Same face, pose, background, hair color and texture.`,

  lateral_right: `Look at this person's right side profile. Generate a photorealistic photo of this EXACT same person, but with a full head of thick, dense hair.

The temple area between forehead and ear must be completely covered with hair flowing to the sideburn. Smooth hairline silhouette from forehead to behind the ear. Same face, pose, background, hair color and texture.`,

  top: `Look at this person's head from above. Generate a photorealistic photo of this EXACT same head from above, but with complete hair coverage.

Every spot where scalp skin is visible must be covered with dense hair. The hairline extends further forward. Natural growth direction: forward at front, clockwise whorl at crown. Same hair color and texture, just full coverage.`,
};

// ---------------------------------------------------------------------------
// Image extraction helper
// ---------------------------------------------------------------------------

const extractImage = (response: any): string => {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Nenhuma imagem na resposta da API');
};

// ---------------------------------------------------------------------------
// Strategy 1: Multi-turn chat (reference analysis → patient generation)
// ---------------------------------------------------------------------------

const multiTurnStrategy = async (
  ai: InstanceType<typeof GoogleGenAI>,
  refPart: InlineDataPart,
  patientPart: InlineDataPart,
  angle: SimulationAngle
): Promise<string> => {
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash-image',
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Turn 1: Analyse reference (text response)
  await chat.sendMessage({
    message: [refPart, { text: REFERENCE_PROMPT[angle] }],
    config: { responseModalities: ['TEXT'] },
  });

  // Turn 2: Generate patient transformation (image response)
  const response = await chat.sendMessage({
    message: [patientPart, { text: PATIENT_PROMPT[angle] }],
    config: { responseModalities: ['IMAGE'] },
  });

  return extractImage(response);
};

// ---------------------------------------------------------------------------
// Strategy 2: Single call with 2 images (reference + patient)
// ---------------------------------------------------------------------------

const twoImageStrategy = async (
  ai: InstanceType<typeof GoogleGenAI>,
  refPart: InlineDataPart,
  patientPart: InlineDataPart,
  angle: SimulationAngle
): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [refPart, patientPart, { text: COMBINED_PROMPT[angle] }],
    },
    config: {
      responseModalities: ['IMAGE'],
    },
  });
  return extractImage(response);
};

// ---------------------------------------------------------------------------
// Strategy 3: Generation-only (no reference, imagination prompt)
// ---------------------------------------------------------------------------

const generationOnlyStrategy = async (
  ai: InstanceType<typeof GoogleGenAI>,
  patientPart: InlineDataPart,
  angle: SimulationAngle
): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [patientPart, { text: GENERATION_PROMPT[angle] }],
    },
    config: {
      responseModalities: ['IMAGE'],
    },
  });
  return extractImage(response);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const restoreHairForAngle = async (
  angleImages: AngleImageMap,
  angle: SimulationAngle
): Promise<string> => {
  const imageData = angleImages[angle];
  if (!imageData) throw new Error(`Sem imagem para o ângulo: ${angle}`);

  const ai = getAI();
  const patientPart = await preparePatientPart(imageData);
  const refPart = await getReferencePart(angle);

  // Strategy 1: Multi-turn chat
  try {
    console.log(`[${angle}] Tentando estratégia multi-turn...`);
    return await multiTurnStrategy(ai, refPart, patientPart, angle);
  } catch (err: any) {
    console.warn(`[${angle}] Multi-turn falhou:`, err?.message);
  }

  // Strategy 2: Single call with 2 images
  try {
    console.log(`[${angle}] Tentando estratégia two-image...`);
    return await twoImageStrategy(ai, refPart, patientPart, angle);
  } catch (err: any) {
    console.warn(`[${angle}] Two-image falhou:`, err?.message);
  }

  // Strategy 3: Generation-only (no reference)
  console.log(`[${angle}] Tentando estratégia generation-only...`);
  return await generationOnlyStrategy(ai, patientPart, angle);
};

export const restoreHairAllAngles = async (
  angleImages: AngleImageMap,
  onResult: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'lateral_left', 'lateral_right', 'top'];

  // Only process angles that have an image
  const activeAngles = angles.filter((a) => angleImages[a] !== null);

  // Sequential to avoid rate limiting (multi-turn = 2 API calls per angle)
  for (const angle of activeAngles) {
    try {
      const image = await restoreHairForAngle(angleImages, angle);
      onResult(angle, { image });
    } catch (err: any) {
      onResult(angle, { error: err?.message || 'Erro desconhecido' });
    }
  }
};
