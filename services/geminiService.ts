/**
 * Hair Transplant Simulation Service — v5.4 (Two-Image Approach)
 *
 * Sends TWO images per request:
 *   Image 1: original clean photo
 *   Image 2: same photo with red markings drawn by the user
 * The prompt tells the model to compare them and add hair where marked.
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
// Prompts — two-image approach (original + annotated)
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `I am providing TWO images of the same person's face.
Image 1: The original, clean photo.
Image 2: The exact same photo, but with a solid RED MASK painted on the forehead.

YOUR TASK: Edit Image 1 to add hair, strictly guided by the RED MASK from Image 2.

CRITICAL INSTRUCTIONS:
1. PIXEL-PERFECT REPLACEMENT: Treat the RED MASK as a definitive stencil. You MUST replace EVERY SINGLE RED PIXEL with dense, natural-looking hair. 
2. IGNORE ANATOMY: Do not attempt to guess where the "natural" hairline should be. Ignore standard facial proportions. If the red mask is drawn aggressively low on the forehead, the new hair MUST go exactly that low.
3. NO BALD GAPS: The entire area between the existing hair on top and the very bottom edge of the red mask must be completely filled with thick hair. The red shape dictates the exact boundaries.
4. PHOTOREALISM: Despite the strict shape constraints, the generated hair must look like a perfectly blended, natural extension of the patient's existing hair (match color, lighting, texture).
5. ISOLATION: Do not alter the eyes, skin below the red mask, background, or clothing.

Output ONLY one photorealistic photo based on Image 1 with the hair added. No text. No labels. No split view.`,

  top: `I am providing TWO images of the same person's scalp from above.
Image 1: The original, clean photo.
Image 2: The exact same photo, but with RED MARKS defining a strict spatial mask for a hair transplant.

YOUR TASK: Edit Image 1 to add hair, STRICTLY following the spatial boundaries defined by the RED MARKS in Image 2.

CRITICAL RULES:
1. STRICT SPATIAL ACCURACY: Analyze exactly where the red markings are located in Image 2. Add new dense hair ONLY within these explicitly marked zones to cover the visible scalp. Do not add hair outside these areas.
2. DENSITY & BLENDING: Fill the marked area completely so no scalp is visible. Match the existing hair color, texture, and natural crown growth direction (whorl).
3. ISOLATED EDITS: Only modify the areas indicated by the red lines. Keep all other parts of the head, ears, neck, body, and background 100% identical to Image 1.

The red marks are an ABSOLUTE BOUNDARY. Fill the area within the red marks densely. Output ONLY one photorealistic photo based on Image 1 with hair added. No text. No labels. No split view.`,
};

// ---------------------------------------------------------------------------
// Core: call Gemini with TWO images + prompt
// ---------------------------------------------------------------------------

const callGeminiTwoImages = async (
  originalDataUrl: string,
  annotatedDataUrl: string,
  prompt: string,
  label: string,
  temperature = 0.8
): Promise<string> => {
  console.log(`[Gemini] Processing ${label} (temp=${temperature}, 2 images)...`);
  const start = Date.now();

  const original = parseDataUrl(originalDataUrl);
  const annotated = parseDataUrl(annotatedDataUrl);

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType: original.mimeType,
          data: original.data,
        },
      },
      {
        inlineData: {
          mimeType: annotated.mimeType,
          data: annotated.data,
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
// Image Processing Pre-fill Utility
// ---------------------------------------------------------------------------

const applyHairBaseTexture = (originalDataUrl: string, rawDrawingDataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const origImg = new Image();
    origImg.onload = () => {
      const maskImg = new Image();
      maskImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = origImg.width;
        canvas.height = origImg.height;
        const ctx = canvas.getContext("2d")!;

        // Draw original
        ctx.drawImage(origImg, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgData.data;

        // Draw mask to a temporary canvas to get its pixels
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = origImg.width;
        maskCanvas.height = origImg.height;
        const maskCtx = maskCanvas.getContext("2d")!;
        maskCtx.drawImage(maskImg, 0, 0, maskCanvas.width, maskCanvas.height);
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;

        for (let i = 0; i < pixels.length; i += 4) {
          // If mask has any alpha (meaning it was drawn on)
          if (maskData[i + 3] > 0) {
            // Apply a dark brown base with some noise for texture
            const noise = (Math.random() - 0.5) * 35;
            // Base shadow color: ~ #33261f
            pixels[i] = Math.min(255, Math.max(0, 51 + noise));     // R
            pixels[i + 1] = Math.min(255, Math.max(0, 38 + noise)); // G
            pixels[i + 2] = Math.min(255, Math.max(0, 31 + noise)); // B
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      };
      maskImg.src = rawDrawingDataUrl;
    };
    origImg.src = originalDataUrl;
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Simulate transplant: sends original + annotated photo, single call */
export const simulateAngle = async (
  originalDataUrl: string,
  compositeDataUrl: string,
  angle: SimulationAngle,
  rawDrawingDataUrl?: string
): Promise<string> => {

  let finalOriginalUrl = originalDataUrl;

  // Apply the pre-fill hair silhouette bypass specifically to the frontal view to defeat guardrails
  if (angle === 'frontal' && rawDrawingDataUrl) {
    console.log(`[Gemini] Applying pre-fill hair base texture for frontal view...`);
    finalOriginalUrl = await applyHairBaseTexture(originalDataUrl, rawDrawingDataUrl);
  }

  const compressedOriginal = await compressImage(finalOriginalUrl, 1536, 0.90);
  const compressedAnnotated = await compressImage(compositeDataUrl, 1536, 0.95);
  return await callGeminiTwoImages(
    compressedOriginal,
    compressedAnnotated,
    PROMPTS[angle],
    `simulate-full-${angle}`,
    0.8
  );
};

/** Run simulation for all provided angles sequentially */
export const runSimulation = async (
  originals: Record<SimulationAngle, string | null>,
  composites: Record<SimulationAngle, string | null>,
  onResult: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'top'];

  for (const angle of angles) {
    const original = originals[angle];
    const composite = composites[angle];
    if (!original || !composite) continue;
    try {
      const image = await simulateAngle(original, composite, angle);
      onResult(angle, { image });
    } catch (err: any) {
      console.error(`[${angle}] Erro:`, err);
      onResult(angle, { error: err?.message || 'Erro desconhecido' });
    }
  }
};
