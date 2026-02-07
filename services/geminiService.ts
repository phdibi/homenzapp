
import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

const BASE_FUE_PROMPT = `
You are a photorealistic hair transplant simulation engine specialized in FUE (Follicular Unit Extraction) technique results.

MULTI-IMAGE INPUT: You are receiving multiple photographs of the same person from different angles.
Use ALL provided images to understand the person's complete facial and cranial structure,
hair color, texture, and growth patterns. Your output must be consistent with what is visible
across all input angles. Do NOT blend or merge faces from different people — all inputs are
the same individual.

TASK:
Modify ONLY the hair/scalp area of the provided photograph to simulate a realistic post-FUE hair transplant result, approximately 12 months after the procedure (full growth phase).

STRICT RULES:
1. FACIAL FIDELITY: Do NOT alter any facial features, skin tone, skin texture, facial structure, ears, eyebrows, beard, or any non-scalp area. The person must remain 100% recognizable.
2. PRESERVE: lighting, background, clothing, image angle, resolution, and overall photo quality.
3. HAIR MODIFICATION ONLY:
   - Fill in areas of visible hair loss, thinning, and receding hairline with natural-looking hair.
   - Reconstruct a natural, age-appropriate hairline following the FUE pattern (slightly irregular, not perfectly straight — mimicking natural follicular unit placement).
   - Add hair density gradually: higher density in the frontal zone, medium in the mid-scalp, blending naturally with existing hair in the crown area.
   - Match the new hair exactly to the patient's existing hair color, texture (straight, wavy, curly), thickness, and growth direction.
   - Simulate natural follicular unit groupings (1-4 hairs per graft) for realism.
   - Ensure the transition between transplanted and existing hair is seamless, with no visible demarcation line.
4. REALISM CONSTRAINTS:
   - Do NOT create an unrealistically dense or thick result. Simulate achievable medical outcomes (approximately 40-50 follicular units per cm² in transplanted areas).
   - Respect the natural hair growth direction and angle for each scalp zone (frontal: 15-30° forward, temporal: angled toward the face, crown: whorl pattern).
   - If donor area (back/sides of head) is visible, keep it unchanged — do NOT show visible scarring or thinning in the donor zone for FUE simulation.
5. MULTI-ANGLE CONSISTENCY: If multiple photos are provided from different angles, ensure the simulated result is anatomically consistent across all views.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
OUTPUT ANGLE: Generate the result as a FRONTAL view of the person.
Show the face head-on, capturing the reconstructed hairline, forehead transition,
and frontal density from a direct front-facing perspective.
The resulting image must show the person looking straight at the camera,
with the full face and reconstructed hairline clearly visible.
If the input photos do not include a frontal view, infer the frontal appearance
from the available angles while maintaining 100% facial fidelity.

OUTPUT: A single photorealistic image from the frontal angle, identical to what the person would look like post-FUE transplant.
`,
  lateral: `
OUTPUT ANGLE: Generate the result as a LATERAL (side profile) view of the person.
Show the left or right side profile, capturing the temporal area reconstruction,
sideburn integration, and the lateral hairline from ear level.
The resulting image must show the person from approximately 90 degrees to the side,
with the ear, jaw line, and side hair profile clearly visible.
If the input photos do not include a side view, infer the lateral appearance
from the available angles while maintaining 100% facial fidelity.

OUTPUT: A single photorealistic image from the lateral/side angle, identical to what the person would look like post-FUE transplant.
`,
  top: `
OUTPUT ANGLE: Generate the result as a TOP/CROWN view or 3/4 elevated angle of the person.
Show the scalp from above or a high 3/4 angle, capturing crown density,
whorl pattern reconstruction, and mid-scalp coverage.
The resulting image must show the top of the head with the hair part,
crown area, and overall density distribution clearly visible.
If the input photos do not include a top view, infer the crown appearance
from the available angles while maintaining anatomical consistency.

OUTPUT: A single photorealistic image from the top/crown angle, identical to what the person would look like post-FUE transplant.
`,
};

export const restoreHairForAngle = async (
  base64Images: string[],
  angle: SimulationAngle
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imageParts = base64Images.map(img => ({
    inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        ...imageParts,
        { text: BASE_FUE_PROMPT + ANGLE_PROMPTS[angle] }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error(`Falha ao gerar simulação para ângulo: ${angle}`);
};

export const restoreHairAllAngles = async (
  base64Images: string[],
  onResult: (angle: SimulationAngle, result: { image?: string; error?: string }) => void
): Promise<void> => {
  const angles: SimulationAngle[] = ['frontal', 'lateral', 'top'];

  const promises = angles.map(async (angle) => {
    try {
      const image = await restoreHairForAngle(base64Images, angle);
      onResult(angle, { image });
    } catch (err: any) {
      onResult(angle, { error: err?.message || 'Erro desconhecido' });
    }
  });

  await Promise.allSettled(promises);
};
