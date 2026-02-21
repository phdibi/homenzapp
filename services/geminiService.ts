/**
 * Hair Transplant Simulation Service — v5.3 (Hairline Drawing)
 *
 * User draws a RED LINE on the photo indicating the desired hairline position.
 * Model fills hair from that line upward/inward and harmonizes in one shot.
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
// Prompts — hairline drawing approach
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Edit this photo. A hair transplant surgeon has drawn a RED LINE on the person's forehead/scalp. This red line marks the desired NEW HAIRLINE position after a hair transplant.

DO THIS:
1. Look at the RED LINE drawn on the photo — that is where the new hairline must be
2. REMOVE the red line completely from the image
3. Create a dense, natural hairline exactly where the red line was drawn
4. Fill ALL the area between the red line and the existing hair with thick, dense hair
5. The new hair must match the person's existing hair color, texture, and growth direction exactly
6. Blend the new hair seamlessly with existing hair — no visible transition, no patches
7. The result must look like the person naturally has a full head of hair with the hairline at the drawn position
8. Do NOT change face, skin, ears, eyebrows, beard, clothing, background — ONLY add hair

Be AGGRESSIVE with the hairline — make it low, dense, and natural. This is a hair transplant simulation and the patient wants to see a dramatic improvement.

Output one photorealistic photo. No text. No labels. No split view.`,

  top: `Edit this photo. A hair transplant surgeon has drawn RED LINES on the person's scalp viewed from above. These red lines mark the areas where hair must be added after a hair transplant.

DO THIS:
1. Look at the RED LINES drawn on the scalp — they mark where new hair must grow
2. REMOVE all red lines completely from the image
3. Fill the marked areas and everything between them with thick, dense hair
4. The new hair must follow the natural growth direction radiating from the crown whorl
5. Match the person's existing hair color and texture exactly
6. Eliminate any visible scalp in the areas between the red lines and existing hair
7. Blend everything seamlessly — the result must look like a naturally full head of hair from above
8. Do NOT change ears, neck, background — ONLY add hair

Be AGGRESSIVE — fill generously, no scalp should be visible in marked areas.

Output one photorealistic photo. No text. No labels. No split view.`,
};

// ---------------------------------------------------------------------------
// Core: call Gemini with image + prompt
// ---------------------------------------------------------------------------

const callGeminiImage = async (
  imageDataUrl: string,
  prompt: string,
  label: string,
  temperature = 0.8
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

/** Simulate transplant: fill hair from drawn hairline + harmonize, single call */
export const simulateAngle = async (
  compositeDataUrl: string,
  angle: SimulationAngle
): Promise<string> => {
  // High quality (0.95) to preserve red line visibility
  const compressed = await compressImage(compositeDataUrl, 1536, 0.95);
  return await callGeminiImage(compressed, PROMPTS[angle], `simulate-${angle}`, 0.8);
};

/** Run simulation for all provided angles sequentially */
export const runSimulation = async (
  composites: Record<SimulationAngle, string | null>,
  onResult: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'top'];

  for (const angle of angles) {
    const composite = composites[angle];
    if (!composite) continue;
    try {
      const image = await simulateAngle(composite, angle);
      onResult(angle, { image });
    } catch (err: any) {
      console.error(`[${angle}] Erro:`, err);
      onResult(angle, { error: err?.message || 'Erro desconhecido' });
    }
  }
};
