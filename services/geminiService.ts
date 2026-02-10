/**
 * Hair Transplant Simulation Service — v3 (Nano Banana Pro)
 *
 * Uses Google Gemini 3 Pro Image (Nano Banana Pro) via @google/genai SDK.
 * The user draws a green mask on their photo indicating WHERE to add hair.
 * We send the original photo + annotated composite to the model.
 *
 * Public API:
 *   - simulateForAngle(photo, mask, composite, angle) → dataUrl
 *   - simulateAllAngles(photos, masks, composites, onResult) → void
 */

import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle, AngleImageMap, AngleMaskMap } from "../types";

// ---------------------------------------------------------------------------
// Gemini configuration
// ---------------------------------------------------------------------------

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";

if (!GEMINI_API_KEY) {
  console.warn("[SimulationService] No GEMINI_API_KEY found — API calls will fail");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Nano Banana Pro = Gemini 3 Pro Image
const MODEL_ID = "gemini-3-pro-image-preview";

// ---------------------------------------------------------------------------
// Image compression — keep images under API limits
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

/** Strip data URL prefix and return { mimeType, data } */
const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    return { mimeType: "image/jpeg", data: dataUrl };
  }
  return { mimeType: match[1], data: match[2] };
};

// ---------------------------------------------------------------------------
// Prompt — mask-strict prompt. Split into intro + instruction for interleaving
// ---------------------------------------------------------------------------

const buildIntroPrompt = (angle: SimulationAngle): string => {
  const angleContext: Record<SimulationAngle, string> = {
    frontal: "frontal view",
    lateral_left: "left profile",
    lateral_right: "right profile",
    top: "top-down view",
  };

  return `This is the ORIGINAL patient photo (${angleContext[angle]}). Do NOT change anything yet.`;
};

const buildInstructionPrompt = (): string => {
  return `This SECOND image is the SAME photo but with BRIGHT GREEN paint marking the EXACT areas where hair must be added.

TASK: Output an edited version of the FIRST photo where you add natural hair ONLY inside the green-painted regions from this second image.

CRITICAL RULES:
- ONLY add hair where the green paint is. Every pixel of bare skin that has NO green paint must remain COMPLETELY UNCHANGED
- Match the patient's existing hair color, texture, direction, and length exactly
- The green areas define the new hairline boundary — fill them with realistic follicles
- Areas WITHOUT green paint = DO NOT TOUCH. No density changes, no color changes, no improvements outside the mask
- Output must be photorealistic — no blurring, no plastic, no artifacts
- Preserve face, skin, ears, beard, clothing EXACTLY as the original`;
};

// ---------------------------------------------------------------------------
// Core: call Nano Banana Pro
// ---------------------------------------------------------------------------

const callNanoBananaPro = async (
  cleanPhoto: string,
  compositeGuide: string,
  angle: SimulationAngle
): Promise<string> => {
  console.log(`[NanaBananaPro] Processing ${angle}...`);
  const start = Date.now();

  const cleanParsed = parseDataUrl(cleanPhoto);
  const guideParsed = parseDataUrl(compositeGuide);

  // Interleave: text → image1 → text → image2 → final instruction
  // This forces the model to "see" each image in context before acting
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      { text: buildIntroPrompt(angle) },
      {
        inlineData: {
          mimeType: cleanParsed.mimeType,
          data: cleanParsed.data,
        },
      },
      { text: buildInstructionPrompt() },
      {
        inlineData: {
          mimeType: guideParsed.mimeType,
          data: guideParsed.data,
        },
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[NanaBananaPro] ${angle} completed in ${elapsed}s`);

  // Extract image from response
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

  // If we got text but no image, log it
  for (const part of parts) {
    if ((part as any).text) {
      console.warn(`[NanaBananaPro] Model returned text instead of image:`, (part as any).text);
    }
  }

  throw new Error("Modelo nao retornou imagem — tente novamente");
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const simulateForAngle = async (
  angleImages: AngleImageMap,
  angleMasks: AngleMaskMap,
  composites: Record<SimulationAngle, string | null>,
  angle: SimulationAngle
): Promise<string> => {
  const photo = angleImages[angle];
  const composite = composites[angle];

  if (!photo) throw new Error(`Sem foto para o angulo: ${angle}`);
  if (!composite) throw new Error(`Sem mascara desenhada para o angulo: ${angle}`);

  const compressedPhoto = await compressImage(photo);
  const compressedComposite = await compressImage(composite);

  return await callNanoBananaPro(compressedPhoto, compressedComposite, angle);
};

export const simulateAllAngles = async (
  angleImages: AngleImageMap,
  angleMasks: AngleMaskMap,
  composites: Record<SimulationAngle, string | null>,
  onResult: (
    angle: SimulationAngle,
    result: { image?: string; error?: string }
  ) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ["frontal", "lateral_left", "lateral_right", "top"];

  // Only process angles that have BOTH photo AND mask
  const activeAngles = angles.filter(
    (a) => angleImages[a] !== null && composites[a] !== null
  );

  // Sequential to avoid rate limiting
  for (const angle of activeAngles) {
    try {
      const image = await simulateForAngle(angleImages, angleMasks, composites, angle);
      onResult(angle, { image });
    } catch (err: any) {
      console.error(`[${angle}] Erro:`, err);
      onResult(angle, { error: err?.message || "Erro desconhecido" });
    }
  }
};
