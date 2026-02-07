
import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

const BASE_FUE_PROMPT = `
You are a world-class photorealistic hair transplant simulation engine. Your job is to take photos of a person with hair loss and generate a DRAMATICALLY TRANSFORMED image showing what they would look like 12 months after a successful FUE (Follicular Unit Extraction) hair transplant.

CRITICAL: The person in the output MUST look like they have SIGNIFICANTLY MORE HAIR than in the input photos. If the input shows a bald or thinning scalp, the output MUST show a full head of hair in that area. This is the entire purpose of the simulation.

MULTI-IMAGE INPUT: You are receiving multiple photographs of the SAME person from different angles. Use ALL of them to understand their complete facial structure, existing hair color, texture, and growth patterns. All inputs are the same individual — never blend faces.

WHAT A REAL FUE RESULT LOOKS LIKE AT 12 MONTHS:
- The previously bald or thinning areas are now COVERED with natural-looking hair
- The hairline has been LOWERED and RECONSTRUCTED — receding temples (temporal recession / "entradas") are completely FILLED IN
- Temple points are restored with sharp, angular sections creating a youthful frame for the face
- The frontal zone has HIGH DENSITY (45-50 FU/cm²) with a soft, feathered transition at the very front edge using single-hair grafts
- Behind the front edge, multi-hair follicular units (2-4 hairs per graft) create VISIBLE VOLUME and DENSITY
- The mid-scalp shows MEDIUM-HIGH density, completely covering any previously visible scalp skin
- The crown/vertex area shows restored whorl pattern with interlocked grafts covering the bald spot
- There is NO visible scalp skin showing through in areas that were transplanted
- The transition between transplanted and existing hair is SEAMLESS — no demarcation line
- The hair grows in the correct direction for each zone: frontal hairs angled 15-30° forward, temporal hairs angled toward the face at sharp angles, crown hairs in a natural whorl spiral

STRICT RULES:
1. FACIAL FIDELITY: Do NOT alter facial features, skin tone, skin texture, facial structure, ears, eyebrows, beard, or any non-scalp area. The person must remain 100% recognizable.
2. PRESERVE: lighting, background, clothing, resolution, and overall photo quality exactly as in the input.
3. HAIR TRANSFORMATION (this is the MAIN task — make it OBVIOUS):
   - FILL IN all areas of hair loss: receding hairline, thinning crown, sparse mid-scalp
   - ELIMINATE all "entradas" (temporal recession) — the temple areas must be FULLY COVERED with hair, creating defined temple points
   - The new hairline should be age-appropriate but clearly LOWER and FULLER than the current receding one
   - Match hair color, texture (straight/wavy/curly), and thickness to the person's existing hair EXACTLY
   - Hair density must look NATURAL but FULL — like a person who naturally has good hair, not like a wig
   - The donor area (back/sides) remains UNCHANGED — no visible scarring for FUE
4. REALISM: The result must look like a real photograph of a real person — not AI-generated, not painted, not a filter. Photorealistic quality is mandatory.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
OUTPUT ANGLE: Generate a FRONTAL view (face looking directly at the camera).

FRONTAL VIEW REQUIREMENTS:
- The reconstructed hairline must be CLEARLY VISIBLE and dramatically different from the input
- Temple recession ("entradas") on BOTH sides must be completely FILLED IN with hair
- The temple points must be restored — these are the angular sections where the hairline curves back toward the ears, creating facial framing
- The front edge of the hairline should use a "low-density feathering" technique: a soft, irregular transition zone with single hairs at the very front, NOT a harsh straight line
- Behind the feathered front edge, density increases rapidly with multi-hair grafts creating visible volume
- The forehead-to-hair transition must look natural — slightly irregular and age-appropriate
- The overall impression must be: "this person has a FULL head of hair in the front" — if the input showed a receding hairline, the output must show it CORRECTED

OUTPUT: A single photorealistic frontal photograph showing the person with their hair transplant result. The difference from the input should be immediately obvious.
`,

  lateral_left: `
OUTPUT ANGLE: Generate a LEFT SIDE PROFILE view (person facing to the right, showing their left side to the camera, approximately 90 degrees).

LEFT LATERAL VIEW REQUIREMENTS:
- Show the LEFT side of the face with the ear, jawline, and left side hair profile clearly visible
- The LEFT temporal area must show COMPLETE coverage — no recession, no "entrada" visible
- The left temple point must be sharp and well-defined, with hair growing at the correct acute angle toward the face
- The sideburn integration must be seamless — transplanted hair blends naturally into the sideburn area
- The lateral hairline from forehead to ear must show a smooth, natural contour with NO gaps or thin patches
- Hair above and behind the ear should show natural density and growth direction
- If the input shows temporal recession on this side, it must be COMPLETELY CORRECTED in the output

OUTPUT: A single photorealistic left side profile photograph showing the person with their hair transplant result. Temple recession must be completely eliminated.
`,

  lateral_right: `
OUTPUT ANGLE: Generate a RIGHT SIDE PROFILE view (person facing to the left, showing their right side to the camera, approximately 90 degrees).

RIGHT LATERAL VIEW REQUIREMENTS:
- Show the RIGHT side of the face with the ear, jawline, and right side hair profile clearly visible
- The RIGHT temporal area must show COMPLETE coverage — no recession, no "entrada" visible
- The right temple point must be sharp and well-defined, with hair growing at the correct acute angle toward the face
- The sideburn integration must be seamless — transplanted hair blends naturally into the sideburn area
- The lateral hairline from forehead to ear must show a smooth, natural contour with NO gaps or thin patches
- Hair above and behind the ear should show natural density and growth direction
- If the input shows temporal recession on this side, it must be COMPLETELY CORRECTED in the output

OUTPUT: A single photorealistic right side profile photograph showing the person with their hair transplant result. Temple recession must be completely eliminated.
`,

  top: `
OUTPUT ANGLE: Generate a TOP/CROWN view (looking down at the top of the person's head from above, or a high 3/4 elevated angle).

TOP/CROWN VIEW REQUIREMENTS:
- Show the scalp from above, capturing the ENTIRE top of the head
- The crown (vertex) area must show a restored natural WHORL PATTERN — hair spiraling outward from a central point
- Any previously bald crown area must now show FULL COVERAGE with interlocked grafts
- The mid-scalp between the frontal zone and crown must show consistent, even density with no thin patches
- The hair part line (if visible) should look natural and well-defined
- Overall density distribution from this angle: no visible scalp skin showing through in previously bald areas
- The density should look like a person with naturally good coverage — approximately 40-45 FU/cm² in the crown area
- Hair direction from this view: radiating outward from the whorl center in the crown, flowing forward in the frontal area

OUTPUT: A single photorealistic top-down or high-angle photograph showing the person with their hair transplant result. Previously bald areas must show full hair coverage.
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
  const angles: SimulationAngle[] = ['frontal', 'lateral_left', 'lateral_right', 'top'];

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
