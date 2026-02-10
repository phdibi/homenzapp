/**
 * Hair Transplant Simulation Service — v4 (Nano Banana Pro, prompt-only)
 *
 * Uses Gemini 3 Pro Image (Nano Banana Pro) via @google/genai SDK.
 * No mask/drawing — the model receives a single photo + specialized prompt per angle.
 *
 * Public API:
 *   - simulateForAngle(photos, angle) → dataUrl
 *   - simulateAllAngles(photos, onResult) → void
 */

import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle, AngleImageMap } from "../types";

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

/** Strip data URL prefix → { mimeType, data } */
const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return { mimeType: "image/jpeg", data: dataUrl };
  return { mimeType: match[1], data: match[2] };
};

// ---------------------------------------------------------------------------
// Per-angle prompts — aggressive, action-first, with spatial specifics
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `Simulate a hair transplant result on this person's frontal photo.

Add thick, dense hair to FILL these specific areas:
1. HAIRLINE: Bring the hairline DOWN significantly — the forehead should shrink by at least 30%. Create a natural, slightly irregular new hairline with baby hairs at the edges
2. TEMPLES: Both left and right temple corners (the "M-shape" recession) must be COMPLETELY filled with dense hair. Zero bare skin in the temple triangles
3. CROWN: If any thinning is visible on top, fill it with dense coverage so zero scalp shows through

Hair must match the person's existing hair color, texture, and style EXACTLY. Same length — just dramatically more density and coverage.

Keep face, skin, beard, ears, eyebrows, clothing IDENTICAL. The result must look like a real photograph of this same person 12 months after a successful FUE transplant. Photorealistic, no artifacts.`,

  lateral_left: `Simulate a hair transplant result on this person's LEFT SIDE profile photo.

This is a side view. Focus on these SPECIFIC areas:
1. TEMPORAL RECESSION: The triangular bare area between the front hairline and the ear — FILL IT COMPLETELY with thick hair. This temple triangle must have ZERO visible bare skin. The hairline should start much further FORWARD (toward the face) than it currently does
2. HAIRLINE EDGE: The hairline visible from this side angle must be pushed forward and downward, creating a much lower, denser front edge
3. TEMPLE POINT: The pointed area in front of and above the ear — extend the hair coverage here so it connects seamlessly to the sideburns

The existing hair behind and above remains the same. Match color, texture, direction, and length exactly. Keep ear, face, jaw, beard, neck, clothing IDENTICAL.

Output a photorealistic photo showing a dramatic improvement in the temple and lateral hairline area. This person should look like they had a successful 3000+ graft FUE transplant 12 months ago.`,

  lateral_right: `Simulate a hair transplant result on this person's RIGHT SIDE profile photo.

This is a side view. Focus on these SPECIFIC areas:
1. TEMPORAL RECESSION: The triangular bare area between the front hairline and the ear — FILL IT COMPLETELY with thick hair. This temple triangle must have ZERO visible bare skin. The hairline should start much further FORWARD (toward the face) than it currently does
2. HAIRLINE EDGE: The hairline visible from this side angle must be pushed forward and downward, creating a much lower, denser front edge
3. TEMPLE POINT: The pointed area in front of and above the ear — extend the hair coverage here so it connects seamlessly to the sideburns

The existing hair behind and above remains the same. Match color, texture, direction, and length exactly. Keep ear, face, jaw, beard, neck, clothing IDENTICAL.

Output a photorealistic photo showing a dramatic improvement in the temple and lateral hairline area. This person should look like they had a successful 3000+ graft FUE transplant 12 months ago.`,

  top: `Simulate a hair transplant result on this person's TOP-DOWN scalp photo.

Add dense hair coverage to FILL all areas where scalp skin is currently visible:
1. CROWN: The circular thinning area at the top — cover it completely with thick hair
2. MID-SCALP: Any visible scalp through thinning hair in the middle zone — fill with dense follicles
3. FRONTAL ZONE: The area near the front of the head viewed from above — ensure thick coverage extending forward

Every spot where pink/white scalp is currently visible should be covered with dense, natural-looking hair. Match the existing hair color, texture, and direction. The result should show ZERO visible scalp through the hair when viewed from above.

Photorealistic result showing the same person after a successful hair transplant with full coverage.`,
};

// ---------------------------------------------------------------------------
// Core: call Nano Banana Pro with single image + prompt
// ---------------------------------------------------------------------------

const callNanoBananaPro = async (
  photo: string,
  angle: SimulationAngle
): Promise<string> => {
  console.log(`[NanaBananaPro] Processing ${angle}...`);
  const start = Date.now();

  const parsed = parseDataUrl(photo);
  const prompt = PROMPTS[angle];

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
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[NanaBananaPro] ${angle} done in ${elapsed}s`);

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
      console.warn(`[NanaBananaPro] Text instead of image:`, (part as any).text);
    }
  }

  throw new Error("Modelo nao retornou imagem — tente novamente");
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const simulateForAngle = async (
  angleImages: AngleImageMap,
  angle: SimulationAngle
): Promise<string> => {
  const photo = angleImages[angle];
  if (!photo) throw new Error(`Sem foto para o angulo: ${angle}`);

  const compressed = await compressImage(photo);
  return await callNanoBananaPro(compressed, angle);
};

export const simulateAllAngles = async (
  angleImages: AngleImageMap,
  onResult: (
    angle: SimulationAngle,
    result: { image?: string; error?: string }
  ) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ["frontal", "lateral_left", "lateral_right", "top"];
  const activeAngles = angles.filter((a) => angleImages[a] !== null);

  // Sequential to avoid rate limiting
  for (const angle of activeAngles) {
    try {
      const image = await simulateForAngle(angleImages, angle);
      onResult(angle, { image });
    } catch (err: any) {
      console.error(`[${angle}] Erro:`, err);
      onResult(angle, { error: err?.message || "Erro desconhecido" });
    }
  }
};
