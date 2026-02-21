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
Image 2: The exact same photo, but with RED MARKS defining a strict spatial mask tracking where a hair transplant should happen.

YOUR TASK: Edit Image 1 to add hair, STRICTLY following the spatial boundaries defined by the RED MARKS in Image 2.

CRITICAL RULES:
1. ABSOLUTE SPATIAL COMPLIANCE: The red mask is your EXACT template. You MUST fill the ENTIRE red area with thick hair. Do NOT stop short. The new hairline MUST go as low down the forehead as the lowest edge of the red mask. Overriding the mask because you think it is "too low" is FORBIDDEN.
2. FILL THE ENTIRE AREA: Fill all bald areas located between the existing highest hair and the bottom-most edge of the red mask with dense, thick, natural-looking hair. Leave no bald spots inside the red zone.
3. PERFECT BLENDING: The new hair must perfectly match the patient's existing hair color, texture, lighting, and growth direction. Seamlessly blend into the existing hair.
4. ISOLATED EDITS: Keep the face, forehead texture BELOW the new hairline, eyebrows, skin, background, and clothing 100% identical to Image 1.

The red marks are an ABSOLUTE FILL ZONE. You must drag the hairline down to exactly match the bottom of the red shape. Output ONLY one photorealistic photo based on Image 1 with hair added. No text. No labels. No split view.`,

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

// --- Image Processing Utilities for the Patch Approach ---

interface BBox { x: number; y: number; width: number; height: number; }

const extractBoundingBox = (drawingDataUrl: string, padding = 40): Promise<BBox | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      let hasPixels = false;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) { // Alpha channel > 0 indicates drawing
          hasPixels = true;
          const pixelIndex = i / 4;
          const x = pixelIndex % canvas.width;
          const y = Math.floor(pixelIndex / canvas.width);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      if (!hasPixels) {
        resolve(null);
        return;
      }

      const x = Math.max(0, minX - padding);
      const y = Math.max(0, minY - padding * 2); // extra padding on top for hair height
      const width = Math.min(canvas.width - x, maxX - minX + padding * 2);
      const height = Math.min(canvas.height - y, maxY - minY + padding * 2);

      resolve({ x, y, width, height });
    };
    img.src = drawingDataUrl;
  });
};

const cropImage = (imageDataUrl: string, bbox: BBox): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = bbox.width;
      canvas.height = bbox.height;
      const ctx = canvas.getContext("2d")!;
      // Draw the region of interest
      ctx.drawImage(img, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = imageDataUrl;
  });
};

const overlayPatch = (originalDataUrl: string, patchDataUrl: string, bbox: BBox): Promise<string> => {
  return new Promise((resolve) => {
    const origImg = new Image();
    origImg.onload = () => {
      const patchImg = new Image();
      patchImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = origImg.width;
        canvas.height = origImg.height;
        const ctx = canvas.getContext("2d")!;
        // Draw original full image
        ctx.drawImage(origImg, 0, 0);

        // Before drawing the patch, we need to apply blending/feathering if possible
        // but for now we draw the direct patch over the coordinates
        ctx.drawImage(patchImg, bbox.x, bbox.y, bbox.width, bbox.height);

        resolve(canvas.toDataURL("image/jpeg", 0.90));
      };
      patchImg.src = patchDataUrl;
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
  rawDrawingDataUrl?: string // Optional for backwards compatibility during transition
): Promise<string> => {
  // Try the new Patch Approach if drawing data is provided
  if (rawDrawingDataUrl) {
    console.log(`[Gemini] Attempting Patch Cropping Strategy for ${angle}...`);
    const bbox = await extractBoundingBox(rawDrawingDataUrl);

    if (bbox) {
      console.log(`[Gemini] Extracted bbox:`, bbox);
      const croppedOriginal = await cropImage(originalDataUrl, bbox);
      const croppedAnnotated = await cropImage(compositeDataUrl, bbox);

      const compressedOriginalPatch = await compressImage(croppedOriginal, 1536, 0.90);
      const compressedAnnotatedPatch = await compressImage(croppedAnnotated, 1536, 0.95);

      const patchResult = await callGeminiTwoImages(
        compressedOriginalPatch,
        compressedAnnotatedPatch,
        PROMPTS[angle],
        `simulate-patch-${angle}`,
        0.8
      );

      // Re-overlay the patched region back onto the full high-res original
      return await overlayPatch(originalDataUrl, patchResult, bbox);
    } else {
      console.warn(`[Gemini] No mask detected in drawing for ${angle}, falling back to full image.`);
    }
  }

  // Fallback to old full-image approach
  const compressedOriginal = await compressImage(originalDataUrl, 1536, 0.90);
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
