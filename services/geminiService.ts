/**
 * Hair Transplant Simulation Service — v5 (Two-Step Pipeline)
 *
 * Step 1: Fill hair in drawn/marked areas (green overlay on photo)
 * Step 2: Harmonize — blend new hair seamlessly with existing hair
 *
 * Uses Gemini 3 Pro Image (Nano Banana Pro) via @google/genai SDK.
 */

import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

// ---------------------------------------------------------------------------
// Gemini configuration
// ---------------------------------------------------------------------------

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";

if (!GEMINI_API_KEY) {
  console.warn("[SimulationService] No GEMINI_API_KEY found — API calls will fail");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_ID = "gemini-3-pro-image-preview";

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------

const compressImage = (
  base64DataUrl: string,
  maxSize = 1536,
  quality = 0.85
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(base64DataUrl);
    img.src = base64DataUrl;
  });
};

const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return { mimeType: "image/jpeg", data: dataUrl };
  return { mimeType: match[1], data: match[2] };
};

// ---------------------------------------------------------------------------
// Step 1 prompts — Hair Fill (green markings → hair)
// ---------------------------------------------------------------------------

const STEP1_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Edit this photo. The photo has BRIGHT GREEN painted areas on it. Those green areas are painted by a doctor to mark exactly where hair must grow.

DO THIS:
1. Look at the image — find every green-colored region
2. REMOVE the green paint completely
3. REPLACE the green areas with dense, realistic hair — as if hair naturally grew there
4. The hair you add must match the person's existing hair color, texture, and direction
5. Do NOT change anything outside the green areas — face, skin, ears, existing hair, background stay identical
6. Do NOT add hair anywhere that is NOT painted green

The green paint is the ONLY guide. Hair goes ONLY where green is. Everywhere else stays untouched.

Output one photorealistic photo. No text. No labels. No split view.`,

  top: `Edit this photo. The photo has BRIGHT GREEN painted areas on the scalp. Those green areas are painted by a doctor to mark exactly where hair must grow.

DO THIS:
1. Look at the image — find every green-colored region on the scalp
2. REMOVE the green paint completely
3. REPLACE the green areas with dense, realistic hair growing in natural directions from the crown whorl
4. The hair you add must match the person's existing hair color and texture
5. Do NOT change anything outside the green areas — existing hair, ears, neck, background stay identical
6. Do NOT add hair anywhere that is NOT painted green

The green paint is the ONLY guide. Hair goes ONLY where green is. Everywhere else stays untouched.

Output one photorealistic photo. No text. No labels. No split view.`,
};

// ---------------------------------------------------------------------------
// Step 2 prompts — Harmonize (blend new hair with existing)
// ---------------------------------------------------------------------------

const STEP2_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Improve this photo of a person's head. The person recently had a hair transplant and some areas of new hair may look slightly unnatural, patchy, or not fully blended with the existing hair.

DO THIS:
1. Make ALL the hair look completely natural and uniform — as if it always grew there
2. Blend any transitions between new and old hair so there are no visible seams or density differences
3. Ensure the hairline looks natural with soft edges and baby hairs
4. Adjust hair density so it looks even and healthy across all areas
5. Keep the same hair color, general length, and growth direction
6. Do NOT change the face, skin, ears, eyebrows, beard, clothing, or background — ONLY improve the hair

Output one photorealistic photo. No text. No labels. No split view.`,

  top: `Improve this top-down photo of a person's scalp. The person recently had a hair transplant and some areas of new hair may look slightly unnatural, patchy, or not fully blended with the existing hair.

DO THIS:
1. Make ALL the hair look completely natural and uniform — as if it always grew there
2. Blend any transitions between new and old hair so there are no visible seams or density differences
3. Eliminate any visible scalp showing through in transplanted areas
4. Ensure natural growth direction radiating from the crown whorl
5. Keep the same hair color and general texture
6. Do NOT change anything except the hair — ears, neck, background stay identical

Output one photorealistic photo. No text. No labels. No split view.`,
};

// ---------------------------------------------------------------------------
// Core: call Gemini with image + prompt
// ---------------------------------------------------------------------------

const callGeminiImage = async (
  imageDataUrl: string,
  prompt: string,
  label: string,
  temperature = 0.4
): Promise<string> => {
  console.log(`[Gemini] Processing ${label} (temp=${temperature})...`);
  const start = Date.now();

  const parsed = parseDataUrl(imageDataUrl);

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.data,
        },
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature,
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Gemini] ${label} done in ${elapsed}s`);

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("Resposta vazia do modelo");
  }

  for (const part of parts) {
    if ((part as any).inlineData) {
      const inlineData = (part as any).inlineData;
      return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
    }
  }

  for (const part of parts) {
    if ((part as any).text) {
      console.warn(`[Gemini] Text instead of image (${label}):`, (part as any).text);
    }
  }

  throw new Error("Modelo nao retornou imagem — tente novamente");
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Step 1: Fill hair in drawn/marked areas */
export const step1FillHair = async (
  compositeDataUrl: string,
  angle: SimulationAngle
): Promise<string> => {
  // High quality (0.95) to preserve green markings visibility
  const compressed = await compressImage(compositeDataUrl, 1536, 0.95);
  // High temperature (0.8) for aggressive edits — forces model to respect green markings
  return await callGeminiImage(compressed, STEP1_PROMPTS[angle], `step1-${angle}`, 0.8);
};

/** Step 2: Harmonize — blend new hair seamlessly with existing */
export const step2Harmonize = async (
  filledImageDataUrl: string,
  angle: SimulationAngle
): Promise<string> => {
  const compressed = await compressImage(filledImageDataUrl);
  return await callGeminiImage(compressed, STEP2_PROMPTS[angle], `step2-harmonize-${angle}`, 0.4);
};

/** Run both steps sequentially for all provided angles */
export const runFullPipeline = async (
  composites: Record<SimulationAngle, string | null>,
  onStep1Result: (angle: SimulationAngle, result: { image?: string; error?: string }) => void,
  onStep2Result: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'top'];
  const step1Results: Partial<Record<SimulationAngle, string>> = {};

  // Step 1: fill hair for each angle
  for (const angle of angles) {
    const composite = composites[angle];
    if (!composite) continue;
    try {
      const image = await step1FillHair(composite, angle);
      step1Results[angle] = image;
      onStep1Result(angle, { image });
    } catch (err: any) {
      onStep1Result(angle, { error: err?.message || 'Erro no preenchimento' });
    }
  }

  // Step 2: harmonize successful step 1 results
  for (const angle of angles) {
    const filled = step1Results[angle];
    if (!filled) continue;
    try {
      const image = await step2Harmonize(filled, angle);
      onStep2Result(angle, { image });
    } catch (err: any) {
      onStep2Result(angle, { error: err?.message || 'Erro na harmonizacao' });
    }
  }
};
