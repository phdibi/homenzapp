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

import { fal } from "@fal-ai/client";
import type { SimulationAngle } from "../types";

// For frontend usage, Fal expects all requests to go through a server proxy
// to keep the API key hidden. The server proxy is implemented at /api/fal/proxy
fal.config({
  proxyUrl: "/api/fal/proxy",
});

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
  frontal: `Fill the entire masked area perfectly with very thick, dense photorealistic hair. The new hairline must sit low exactly where the mask dictates. Match the existing hair color (light brown/blonde) and texture perfectly. Blend the edges seamlessly with the surrounding hair.`,
  top: `Fill the entire masked area with extremely thick, dense photorealistic hair. Match the existing light brown/blonde hair color, texture, and natural crown growth pattern perfectly. Absolutely no scalp should be visible through the new hair.`,
};

// ---------------------------------------------------------------------------
// Image Processing Pre-fill Utility
// ---------------------------------------------------------------------------

const createBlackAndWhiteMask = (originalDataUrl: string, rawDrawingDataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const origImg = new Image();
    origImg.onload = () => {
      const maskImg = new Image();
      maskImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = origImg.width;
        canvas.height = origImg.height;
        const ctx = canvas.getContext("2d")!;

        // Fill canvas with solid black (the "keep" area)
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the raw drawing over it
        ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgData.data;

        for (let i = 0; i < pixels.length; i += 4) {
          // Check if it's black (0,0,0) resulting from the fillRect
          // If any of RGB is > 0, it means it's part of the red drawing
          if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
            // Make it solid white (the "inpaint" area)
            pixels[i] = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
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

/** Simulate transplant: sends original + mask to Fal Flux Inpainting */
export const simulateAngle = async (
  originalDataUrl: string,
  compositeDataUrl: string, // Kept to avoid breaking HairRestore.tsx, but unused
  angle: SimulationAngle,
  rawDrawingDataUrl?: string
): Promise<string> => {

  const compressedOriginal = await compressImage(originalDataUrl, 1536, 0.90);

  let maskUrl = compressedOriginal; // Fallback if no drawing
  if (rawDrawingDataUrl) {
    console.log(`[Fal] Creating black-and-white mask for ${angle} view...`);
    maskUrl = await createBlackAndWhiteMask(originalDataUrl, rawDrawingDataUrl);
    maskUrl = await compressImage(maskUrl, 1536, 0.90);
  }

  console.log(`[Fal] Processing simulate-full-${angle} inpainting...`);
  const start = Date.now();

  try {
    const result = await fal.subscribe('fal-ai/flux-general', {
      input: {
        prompt: PROMPTS[angle],
        image_url: compressedOriginal,
        mask_url: maskUrl,
      } as any,
    }) as any;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Fal] simulate-full-${angle} done in ${elapsed}s`);

    const images = result?.images || result?.data?.images;
    if (images?.[0]?.url) {
      return images[0].url;
    }

    throw new Error("Modelo não retornou imagem válida — tente novamente");
  } catch (error: any) {
    console.error(`[Fal] Error:`, error);
    throw new Error(`Falha no inpainting: ${error?.message || "Erro desconhecido"}`);
  }
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
