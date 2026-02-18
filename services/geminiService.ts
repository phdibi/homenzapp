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
// System preamble — shared across all angle prompts for consistency
// ---------------------------------------------------------------------------

const SYSTEM_PREAMBLE = `You are a hair transplant surgeon generating a realistic FUE transplant simulation.

YOUR GOAL: Add dense, thick hair ONLY to the specific areas affected by hair loss — the frontotemporal hairline and the crown. Be BOLD and AGGRESSIVE in these target zones. But do NOT touch any area that already has adequate hair coverage.

TARGET ZONES (add hair here aggressively):
- FRONTOTEMPORAL HAIRLINE: The receding hairline at the front and the temple corners (M-shape recession). Push the hairline forward significantly and fill the temple triangles with dense hair.
- CROWN: Any thinning or bald spot at the top/back of the head. Fill it with dense coverage.

FORBIDDEN ZONES (do NOT add hair here):
- The sides of the head (above the ears) where hair already exists
- The back of the head where hair already exists
- Any area that already has normal hair density

STRICT RULES:
- ONLY add hair where there is clearly visible scalp due to hair loss
- Match the person's existing hair color, texture, curl pattern, and growth direction EXACTLY
- Create a natural, slightly irregular new hairline with baby hairs — never a sharp artificial line
- PRESERVE the person's face, skin, ears, eyebrows, beard, clothing, background IDENTICALLY
- DO NOT alter the image composition, lighting, or color grading
- The result must look like a real photograph, photorealistic, no artifacts
`;

// ---------------------------------------------------------------------------
// Per-angle prompts — bold on target zones, strict on preservation
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `${SYSTEM_PREAMBLE}
This is a FRONTAL photo. Simulate the transplant result:

1. HAIRLINE: Bring the hairline DOWN aggressively — create a new, lower, denser hairline. Fill the forehead recession boldly. The new hairline should have natural baby hairs at the edges but should clearly be much lower and denser than the current one.
2. TEMPLE CORNERS: The M-shape recession at both temples must be filled with dense hair. These triangle areas should have significant new hair coverage, closing the M-shape substantially.
3. CROWN/TOP: If any thinning is visible on top, add dense coverage to eliminate visible scalp in that zone.

IMPORTANT: Only add hair to areas of visible hair loss. Do NOT add hair to the sides or any area that already has normal coverage. The sides, ears, face, and all other features remain IDENTICAL.

Output a single photorealistic photograph. No text, no labels, no side-by-side.`,

  lateral_left: `${SYSTEM_PREAMBLE}
This is a LEFT SIDE profile photo. Simulate the transplant result:

1. FRONTOTEMPORAL HAIRLINE: The front hairline visible from this angle — push it FORWARD significantly toward the face. Where there is recession between the hairline and the forehead, fill it with dense hair. The hairline should start much further forward than it currently does.
2. TEMPLE TRIANGLE: The triangular bare area between the front hairline and the ear — fill it with dense hair. This is the primary target zone from this angle. Close this gap with thick, natural-looking hair.
3. TEMPLE POINT: Extend hair coverage in front of and above the ear to connect seamlessly with the sideburn area.

IMPORTANT: Only add hair to the frontotemporal recession zone. Do NOT add hair to the sides or back where hair already exists. The ear, face, jaw, beard, neck, clothing remain IDENTICAL. Do NOT add extra volume or density to areas that already have normal hair.

Output a single photorealistic photograph. No text, no labels.`,

  lateral_right: `${SYSTEM_PREAMBLE}
This is a RIGHT SIDE profile photo. Simulate the transplant result:

1. FRONTOTEMPORAL HAIRLINE: The front hairline visible from this angle — push it FORWARD significantly toward the face. Where there is recession between the hairline and the forehead, fill it with dense hair. The hairline should start much further forward than it currently does.
2. TEMPLE TRIANGLE: The triangular bare area between the front hairline and the ear — fill it with dense hair. This is the primary target zone from this angle. Close this gap with thick, natural-looking hair.
3. TEMPLE POINT: Extend hair coverage in front of and above the ear to connect seamlessly with the sideburn area.

IMPORTANT: Only add hair to the frontotemporal recession zone. Do NOT add hair to the sides or back where hair already exists. Do NOT add extra volume, thickness, or density to areas that already have normal hair coverage — only fill the recession. The ear, face, jaw, beard, neck, clothing remain IDENTICAL.

Output a single photorealistic photograph. No text, no labels.`,

  top: `${SYSTEM_PREAMBLE}
This is a TOP-DOWN photo of the scalp. Simulate the transplant result:

1. CROWN: If there is thinning or a bald spot at the crown, fill it AGGRESSIVELY with dense hair. Eliminate visible scalp in this zone. This is the primary target from this angle.
2. MID-SCALP: If scalp is visible through thinning hair in the middle zone, add dense coverage to eliminate the transparency.
3. FRONTAL ZONE: If the frontal area shows thinning from above, add thick coverage extending forward to recreate a dense frontal hairline.

IMPORTANT: Only add hair where scalp is visibly showing through due to hair loss. Maintain the natural growth direction pattern (radiating outward from the whorl). Do NOT add density to areas that already have normal coverage.

Output a single photorealistic photograph. No text, no labels.`,
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
      temperature: 0.4,
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
