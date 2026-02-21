/**
 * Hair Transplant Simulation Service — v5 (Two-Step Pipeline)
 *
 * Step 1: Fill hair in drawn/marked areas (green overlay on photo)
 * Step 2: Apply a selected hairstyle to the filled result
 *
 * Uses Gemini 3 Pro Image (Nano Banana Pro) via @google/genai SDK.
 */

import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle, HairstyleOption } from "../types";

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
// Hairstyle options
// ---------------------------------------------------------------------------

export const HAIRSTYLE_OPTIONS: HairstyleOption[] = [
  {
    id: 'side_part',
    label: 'Repartido Lateral',
    description: 'Corte classico com repartido lateral definido',
    promptFragment: 'a classic side part with clean separation, hair combed neatly to one side with volume on top and shorter on the sides',
  },
  {
    id: 'slick_back',
    label: 'Slick Back',
    description: 'Cabelo penteado para tras com brilho',
    promptFragment: 'a sleek slicked-back style with all hair combed backwards, smooth and polished with a slight shine, shorter and tapered on the sides',
  },
  {
    id: 'textured_crop',
    label: 'Textured Crop',
    description: 'Corte curto texturizado moderno',
    promptFragment: 'a modern textured crop with short messy fringe at the front, textured layers on top, faded shorter sides',
  },
  {
    id: 'buzz_cut',
    label: 'Buzz Cut',
    description: 'Corte maquina uniforme curto',
    promptFragment: 'a clean uniform buzz cut, very short (about 3mm) all over, neat and even with visible scalp texture',
  },
  {
    id: 'messy_textured',
    label: 'Texturizado Casual',
    description: 'Estilo casual com textura e movimento',
    promptFragment: 'a casual messy textured style with tousled layers, natural movement and volume on top, relaxed effortless look',
  },
  {
    id: 'pompadour',
    label: 'Pompadour',
    description: 'Volume alto na frente penteado para tras',
    promptFragment: 'a modern pompadour with significant volume and height at the front, swept upward and backward, clean tapered sides',
  },
  {
    id: 'crew_cut',
    label: 'Crew Cut',
    description: 'Corte militar curto classico',
    promptFragment: 'a classic crew cut with slightly longer top graduated shorter toward the crown, very short faded sides, clean and neat military style',
  },
  {
    id: 'natural_flow',
    label: 'Natural Fluido',
    description: 'Cabelo com fluxo natural medio',
    promptFragment: 'a natural flowing medium-length style, hair falling naturally with soft movement, no rigid styling, relaxed and organic look',
  },
];

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
// Step 2 prompts — Hairstyle application
// ---------------------------------------------------------------------------

const STEP2_PREAMBLE = `You are a professional hair stylist creating a styled look.
The person in this photo has a full head of hair. Your task is to restyle their hair into a specific hairstyle while preserving everything else in the image EXACTLY.

STYLING RULES:
- Change ONLY the hair styling — do not add or remove hair volume/density
- The hair color, texture, and quality remain the same — only the arrangement/direction changes
- Face, skin, ears, eyebrows, beard, clothing, background: IDENTICAL
- Lighting and image quality: IDENTICAL
- Result must look like a real photograph of a person with this hairstyle`;

const buildStep2Prompt = (angle: SimulationAngle, hairstyle: HairstyleOption): string => {
  const angleContext = angle === 'frontal'
    ? 'This is a FRONTAL photo.'
    : 'This is a TOP-DOWN photo.';

  return `${STEP2_PREAMBLE}

${angleContext}
Style the person's hair into: ${hairstyle.label} — ${hairstyle.promptFragment}

Output a single photorealistic photograph. No text, no labels.`;
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
  // Compress but with HIGH quality (0.95) to preserve green markings visibility
  // The composite comes as PNG from DrawingCanvas — we resize but keep colors sharp
  const compressed = await compressImage(compositeDataUrl, 1536, 0.95);
  // Higher temperature (0.6) for more aggressive edits on marked areas
  return await callGeminiImage(compressed, STEP1_PROMPTS[angle], `step1-${angle}`, 0.6);
};

/** Step 2: Apply hairstyle to a filled result */
export const step2ApplyHairstyle = async (
  filledImageDataUrl: string,
  angle: SimulationAngle,
  hairstyle: HairstyleOption
): Promise<string> => {
  const compressed = await compressImage(filledImageDataUrl);
  const prompt = buildStep2Prompt(angle, hairstyle);
  return await callGeminiImage(compressed, prompt, `step2-${angle}-${hairstyle.id}`);
};

/** Run both steps sequentially for all provided angles */
export const runFullPipeline = async (
  composites: Record<SimulationAngle, string | null>,
  hairstyle: HairstyleOption,
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

  // Step 2: apply hairstyle to successful step 1 results
  for (const angle of angles) {
    const filled = step1Results[angle];
    if (!filled) continue;
    try {
      const image = await step2ApplyHairstyle(filled, angle, hairstyle);
      onStep2Result(angle, { image });
    } catch (err: any) {
      onStep2Result(angle, { error: err?.message || 'Erro no penteado' });
    }
  }
};
