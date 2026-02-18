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

const SYSTEM_PREAMBLE = `You are a board-certified hair transplant surgeon reviewing a patient photo. Your task is to generate a REALISTIC preview of what this patient would look like 12 months after a successful FUE hair transplant.

CRITICAL RULES:
- Be CONSERVATIVE and PROPORTIONAL. Only add hair where there is clearly visible scalp or skin due to hair loss. Do NOT add hair to areas that already have adequate coverage.
- The amount of hair added must be PROPORTIONAL to the degree of hair loss visible. Mild recession gets mild improvement. Severe recession gets more improvement. Never over-generate.
- The result must look like a REAL medical outcome, not a dramatic makeover. A realistic FUE transplant typically provides moderate improvement, not a full head of thick hair from severe baldness.
- PRESERVE the person's identity: face, skin tone, expression, ears, eyebrows, beard, clothing, background, and all non-hair features must remain IDENTICAL.
- Match the existing hair's color, texture, curl pattern, direction of growth, and approximate length EXACTLY.
- Create natural, slightly irregular hairlines with fine baby hairs at the edges — never a sharp, artificial line.
- DO NOT alter the overall image composition, lighting, or color grading.
`;

// ---------------------------------------------------------------------------
// Per-angle prompts — conservative, proportional, with spatial specifics
// ---------------------------------------------------------------------------

const PROMPTS: Record<SimulationAngle, string> = {
  frontal: `${SYSTEM_PREAMBLE}
This is a FRONTAL photo of the patient. Simulate the hair transplant result for this angle.

Analyze the current degree of hair loss and apply improvements PROPORTIONALLY:
1. HAIRLINE: If the hairline has receded, bring it forward by a MODERATE, REALISTIC amount. The new hairline should look natural with soft, irregular edges and baby hairs — not a dramatic or artificial-looking change. Lower it proportionally to the degree of recession observed.
2. TEMPLES: If there are receded temple corners (M-shape), fill them proportionally. Add hair density gradually from the existing hairline edges inward — the transition should be seamless and natural.
3. CROWN/TOP: If thinning is visible on top, add moderate density to reduce visible scalp, but maintain a natural look. Not every patch needs to be filled to maximum density.

The improvement should be BELIEVABLE — a person who knew this patient before surgery should think "they look better" not "that's obviously fake."

Output a single photorealistic photograph. No text, no labels, no side-by-side.`,

  lateral_left: `${SYSTEM_PREAMBLE}
This is a LEFT SIDE profile photo of the patient. Simulate the hair transplant result for this angle.

IMPORTANT: The result on this side should be SYMMETRICAL and CONSISTENT with what a natural transplant would produce. Both sides of the head receive the same treatment in a real FUE procedure, so the improvement here should be moderate and proportional.

Analyze the visible recession and apply improvements PROPORTIONALLY:
1. TEMPORAL AREA: If there is a receded triangular area between the front hairline and the ear, add hair to partially or fully cover it PROPORTIONALLY to the degree of recession visible. Do not force maximum density if only mild recession exists.
2. HAIRLINE EDGE: If the front hairline has receded when viewed from this side, bring it forward by a moderate, natural amount. The edge should be soft and gradual, not a hard line.
3. TEMPLE POINT: If the area in front of and above the ear shows recession, extend hair coverage moderately to blend with the sideburns naturally.

Keep all existing hair behind and above unchanged. Keep ear, face, jaw, beard, neck, clothing IDENTICAL.

Output a single photorealistic photograph showing a realistic, moderate improvement. No text, no labels.`,

  lateral_right: `${SYSTEM_PREAMBLE}
This is a RIGHT SIDE profile photo of the patient. Simulate the hair transplant result for this angle.

CRITICAL — LESS IS MORE: For this side view, make MINIMAL, SUBTLE changes. Err on the side of doing TOO LITTLE rather than too much. The goal is a slight, natural-looking improvement — NOT a dramatic transformation.

Analyze the visible recession carefully before adding ANY hair:
1. TEMPORAL AREA: Only add a SMALL amount of hair to soften the recession, if visible. Do NOT completely fill the temple triangle. Leave some natural recession — a real transplant rarely achieves 100% coverage in this area. Add just enough to soften the edge.
2. HAIRLINE EDGE: Do NOT push the hairline forward aggressively. At most, bring it forward by a VERY SMALL amount (a few millimeters visually). The improvement should be barely noticeable at first glance.
3. TEMPLE POINT: Only add minimal hair to slightly blend the area near the ear. Do not create a dramatically different silhouette.

STRICT RULES FOR THIS VIEW:
- Do NOT create a dramatically different appearance from the original photo
- Do NOT add thick, dense hair where there was none — add sparse, gradual coverage at most
- Do NOT push the hairline more than slightly forward
- The person should still look like they have the SAME hairstyle, just with slightly better coverage at the edges
- If in doubt, add LESS hair, not more

Keep all existing hair, ear, face, jaw, beard, neck, clothing IDENTICAL.

Output a single photorealistic photograph showing a SUBTLE improvement. No text, no labels.`,

  top: `${SYSTEM_PREAMBLE}
This is a TOP-DOWN photo of the patient's scalp. Simulate the hair transplant result for this angle.

Analyze the areas of visible scalp and apply improvements PROPORTIONALLY:
1. CROWN: If there is a circular thinning area at the crown, add moderate hair density to reduce visible scalp. The coverage should be proportional to the size and severity of the thinning.
2. MID-SCALP: If scalp is visible through thinning hair in the middle zone, add gradual density improvement. Maintain the natural hair growth pattern and direction.
3. FRONTAL ZONE: If the frontal area shows thinning from above, add moderate density to improve coverage.

The improvement should reduce visible scalp proportionally but maintain a natural look. Hair direction should follow the patient's existing growth pattern (typically radiating outward from a whorl point).

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
