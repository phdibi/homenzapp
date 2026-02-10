/**
 * Hair Transplant Simulation Service
 *
 * Uses FLUX Kontext Pro via fal.ai for image editing.
 * Chosen after comparative testing: best balance of hairline transformation
 * + facial identity preservation + hair color preservation.
 *
 * Keeps the same public API (restoreHairForAngle, restoreHairAllAngles)
 * so HairRestore.tsx doesn't need changes.
 */

import { fal } from "@fal-ai/client";
import type { SimulationAngle, AngleImageMap } from "../types";

// ---------------------------------------------------------------------------
// fal.ai configuration
// ---------------------------------------------------------------------------

// Use proxy in production (Vercel serverless function keeps FAL_KEY secret)
// In dev, fall back to direct credentials if proxy isn't available
const isLocalDev = typeof window !== "undefined" && window.location.hostname === "localhost";

if (isLocalDev && process.env.FAL_KEY) {
  // Dev mode: use key directly (acceptable for local development)
  fal.config({ credentials: process.env.FAL_KEY });
  console.log("[SimulationService] Using direct FAL_KEY (dev mode)");
} else {
  // Production: proxy through Vercel serverless function
  fal.config({ proxyUrl: "/api/fal/proxy" });
  console.log("[SimulationService] Using proxy /api/fal/proxy (production mode)");
}

// Model endpoint
const FLUX_MODEL = "fal-ai/flux-pro/kontext";

// ---------------------------------------------------------------------------
// Image compression (reused from original — keeps images under fal.ai limits)
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

// ---------------------------------------------------------------------------
// Prompts per angle — R3 winners (tested 2024-02-10)
// Key improvements over R2: explicit hair color preservation, beard protection,
// more aggressive language for lateral_right and top angles
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Add much more hair to this person. The hairline must come down VERY LOW — almost touching the eyebrows, with only a small forehead visible. Fill both temple corners completely with thick hair — the M-shape recession must be completely gone. Thick dense coverage everywhere on top, zero scalp visible. IMPORTANT: keep the EXACT same light brown/dirty blonde hair color — do not darken it. Keep the same beard style and color unchanged. Same face, same skin, same everything else.`,

  lateral_left: `Add much more hair to this person's left side. Fill the entire temple triangle area with thick hair — zero bare skin visible between the hairline and ear. The hairline must start much further forward. Hair color must stay the exact same light brown/dirty blonde — do not darken it. Do not change the beard or face at all.`,

  lateral_right: `This person needs MUCH more hair on the right side of their head. The temple area is currently bare — FILL IT COMPLETELY with thick dense hair matching their existing light brown hair color. The hairline must extend far forward, dramatically reducing the visible forehead from this angle. Cover ALL bare scalp skin above the ear with hair. Do not change the beard, face, or skin at all.`,

  top: `Add MUCH more hair to cover this person's head from above. Fill ALL thin spots and bald areas with thick, dense hair. The hairline must extend much further forward than it currently does. Every gap where scalp skin shows through must be completely covered. The hair must stay the exact same light brown/dirty blonde color. This is a dramatic improvement — the ENTIRE top of the head should be covered in thick hair with zero scalp visible.`,
};

// ---------------------------------------------------------------------------
// Core: call FLUX Kontext Pro via fal.ai
// ---------------------------------------------------------------------------

const callFluxKontext = async (
  imageDataUrl: string,
  prompt: string
): Promise<string> => {
  console.log(`[FLUX] Calling ${FLUX_MODEL}...`);
  const start = Date.now();

  let result: any;
  try {
    result = await fal.subscribe(FLUX_MODEL, {
      input: {
        prompt,
        image_url: imageDataUrl,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          update.logs
            ?.map((log: any) => log.message)
            .forEach((m: string) => console.log(`[FLUX] ${m}`));
        }
      },
    });
  } catch (err: any) {
    console.error("[FLUX] API call failed:", err);
    const msg = err?.message || err?.body?.detail || String(err);
    throw new Error(`fal.ai erro: ${msg}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // fal.ai returns images at result.images or result.data.images
  const images = result?.images || result?.data?.images;
  if (!images?.[0]?.url) {
    console.error("[FLUX] No image in response:", JSON.stringify(result).slice(0, 500));
    throw new Error("FLUX não retornou imagem");
  }

  console.log(`[FLUX] Done in ${elapsed}s — downloading result...`);

  // Download the image and convert to data URL for display
  const imageUrl = images[0].url;
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Erro ao baixar imagem: ${response.status}`);
  }
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Erro ao converter imagem"));
    reader.readAsDataURL(blob);
  });
};

// ---------------------------------------------------------------------------
// Public API (same interface as before — HairRestore.tsx needs zero changes)
// ---------------------------------------------------------------------------

export const restoreHairForAngle = async (
  angleImages: AngleImageMap,
  angle: SimulationAngle
): Promise<string> => {
  const imageData = angleImages[angle];
  if (!imageData) throw new Error(`Sem imagem para o ângulo: ${angle}`);

  // Compress before sending
  const compressed = await compressImage(imageData);
  const prompt = PROMPTS[angle];

  console.log(`[${angle}] Processando com FLUX Kontext Pro...`);
  return await callFluxKontext(compressed, prompt);
};

export const restoreHairAllAngles = async (
  angleImages: AngleImageMap,
  onResult: (
    angle: SimulationAngle,
    result: { image?: string; error?: string }
  ) => void
): Promise<void> => {
  const angles: SimulationAngle[] = [
    "frontal",
    "lateral_left",
    "lateral_right",
    "top",
  ];

  // Only process angles that have an image
  const activeAngles = angles.filter((a) => angleImages[a] !== null);

  // Sequential to avoid rate limiting
  for (const angle of activeAngles) {
    try {
      const image = await restoreHairForAngle(angleImages, angle);
      onResult(angle, { image });
    } catch (err: any) {
      console.error(`[${angle}] Erro:`, err);
      onResult(angle, { error: err?.message || "Erro desconhecido" });
    }
  }
};
