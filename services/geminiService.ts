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
  frontal: `Now here is my patient's frontal photo. Generate a photorealistic image showing what this SAME person would look like after the same type of dramatic hair transplant you just analyzed.

CRITICAL changes required — the transformation must be VERY visible:
- Paint thick hair on ALL the bare forehead skin above the eyebrows. The new hairline must sit VERY LOW — only 2-3 finger widths above the eyebrows. The forehead must look dramatically smaller than in the input photo.
- Both temple corners (the "M" shape) must be COMPLETELY filled with thick hair — zero bare skin at the temples.
- Every area where scalp is visible must be covered with dense hair matching the thickest parts of existing hair.
- Keep the exact same face, skin, expression, ears, beard, clothing, background, hair color, and hair length.

This is a medical simulation — the result must show a DRAMATIC difference from the input. Output one photorealistic frontal photo.`,

  lateral_left: `Here is my patient's left side photo. Generate a photorealistic image of this SAME person after the same dramatic hair transplant transformation.

CRITICAL changes from this angle:
- The entire temple area (the bare skin triangle between the top of the head and the ear) must be COMPLETELY covered with thick hair. Zero bare skin visible in the temple region.
- The hairline must start much further FORWARD on the forehead — the forehead profile must look dramatically shorter.
- The silhouette line of hair from forehead to behind the ear must be one smooth, continuous, dense curve with no gaps or thin spots.
- Keep the exact same face, pose, background, hair color and hair length.

Output one photorealistic left-side photo showing a dramatic transformation.`,

  lateral_right: `Here is my patient's right side photo. Generate a photorealistic image of this SAME person after the same dramatic hair transplant, mirrored to the right side.

CRITICAL changes from this angle:
- The entire temple area (the bare skin triangle between the top of the head and the ear) must be COMPLETELY covered with thick hair. Zero bare skin visible in the temple region.
- The hairline must start much further FORWARD on the forehead — the forehead profile must look dramatically shorter.
- The silhouette line of hair from forehead to behind the ear must be one smooth, continuous, dense curve with no gaps or thin spots.
- Keep the exact same face, pose, background, hair color and hair length.

Output one photorealistic right-side photo showing a dramatic transformation.`,

  top: `Here is my patient's top-of-head photo. Generate a photorealistic image of this SAME person's head from above after the same dramatic hair transplant transformation.

CRITICAL changes from above:
- The hairline must extend MUCH further forward — at least 3-4cm more forward than in the input photo. The bare forehead area visible from above must be dramatically reduced.
- Every single spot where scalp skin is visible must be covered with thick, dense hair. Zero bald patches.
- The frontal hairline from above must be a smooth, rounded curve with no M-shape recession.
- Natural growth direction: hair pointing forward at the front, clockwise whorl pattern at the crown.
- Keep the exact same hair color and texture.

Output one photorealistic top-view photo showing a dramatic transformation.`,
};

// ---------------------------------------------------------------------------
// Prompts — Fallback: 2-image single call (reference + patient)
// ---------------------------------------------------------------------------

const COMBINED_PROMPT: Record<SimulationAngle, string> = {
  frontal: `Image 1 shows a real hair transplant before/after (left=before, right=after). Image 2 is my patient.

Generate a photorealistic photo of the patient (Image 2) after the SAME dramatic transformation shown in Image 1. The hairline must move VERY far down — only 2-3 finger widths above the eyebrows. Both temple corners completely filled. Dense hair everywhere, zero scalp visible. Same face, same person, same hair color and length. Output one frontal photo.`,

  lateral_left: `Image 1 shows a real hair transplant before/after from the left side. Image 2 is my patient's left side.

Generate a photorealistic photo of the patient after the SAME dramatic transformation. The entire temple triangle must be filled with thick hair. The hairline must start much further forward. Smooth continuous hair silhouette from forehead to ear. Same face, pose, background. Output one left-side photo.`,

  lateral_right: `Image 1 shows a real hair transplant before/after. Image 2 is my patient's right side.

Generate a photorealistic photo of the patient after the SAME dramatic transformation mirrored to right side. The entire temple triangle must be filled with thick hair. The hairline must start much further forward. Smooth continuous hair silhouette from forehead to ear. Same face, pose, background. Output one right-side photo.`,

  top: `Image 1 shows a real hair transplant before/after from above. Image 2 is my patient's head from above.

Generate a photorealistic photo of the patient's head after the SAME dramatic transformation. The hairline must extend at least 3-4cm further forward. Complete scalp coverage, zero bare skin. Natural growth direction. Same hair color. Output one top-view photo.`,
};

// ---------------------------------------------------------------------------
// Prompts — Fallback 2: Generation-only (no reference)
// ---------------------------------------------------------------------------

const GENERATION_PROMPT: Record<SimulationAngle, string> = {
  frontal: `Look at this person's face. Now generate a photorealistic photo of this EXACT same person, but imagine they just had a hair transplant and now have a full head of thick, dense hair.

The transformation must be DRAMATIC and obvious:
- The hairline sits VERY LOW — only 2-3 finger widths above the eyebrows. The forehead is visibly much smaller.
- Both temple corners are fully covered with hair — the "M" recession is completely gone.
- Thick dense hair everywhere, zero scalp visible.
- Same face, skin, expression, beard, clothing, background. Same hair color and texture, same short hair length — just dramatically more coverage where there was bare skin.`,

  lateral_left: `Look at this person's left profile. Generate a photorealistic photo of this EXACT same person, but with a full head of thick, dense hair after a hair transplant.

The transformation must be DRAMATIC:
- The entire temple area (bare skin between top of head and ear) is fully covered with thick hair.
- The hairline starts much further FORWARD — the forehead profile is visibly shorter.
- Smooth continuous hair silhouette from forehead to behind the ear, zero gaps.
- Same face, pose, background, hair color and texture.`,

  lateral_right: `Look at this person's right profile. Generate a photorealistic photo of this EXACT same person, but with a full head of thick, dense hair after a hair transplant.

The transformation must be DRAMATIC:
- The entire temple area (bare skin between top of head and ear) is fully covered with thick hair.
- The hairline starts much further FORWARD — the forehead profile is visibly shorter.
- Smooth continuous hair silhouette from forehead to behind the ear, zero gaps.
- Same face, pose, background, hair color and texture.`,

  top: `Look at this person's head from above. Generate a photorealistic photo of this EXACT same head from above, but after a hair transplant with complete, thick hair coverage.

The transformation must be DRAMATIC:
- The hairline extends at least 3-4cm further forward than the current state. The bare forehead area visible from above is dramatically reduced.
- Every spot where scalp skin is currently visible must be covered with thick, dense hair.
- Smooth rounded frontal hairline from above — zero M-shape recession.
- Natural growth direction: forward at front, clockwise whorl at crown. Same hair color and texture.`,
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
