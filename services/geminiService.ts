
import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

const BASE_FUE_PROMPT = `
You are a world-class photorealistic hair transplant simulation engine trained on thousands of real FUE (Follicular Unit Extraction) before-and-after clinical photographs.

YOUR PRIMARY MISSION: Take photos of a person with visible hair loss and produce a DRAMATICALLY TRANSFORMED photograph showing what they would realistically look like 12 months after a successful, high-graft-count FUE hair transplant. The transformation must be IMMEDIATELY OBVIOUS when comparing input to output.

CRITICAL RULE: The output image MUST show visibly MORE hair than the input. Areas that are bald, thinning, or show scalp skin in the input MUST be covered with natural-looking hair in the output. If the transformation is not obvious, you have failed the task.

MULTI-IMAGE INPUT: You are receiving multiple photographs of the SAME person from different angles. Use ALL of them to understand their complete facial structure, existing hair color, texture, and growth patterns. Never blend features from different angles — they are the same individual.

=== CLINICAL REFERENCE: WHAT REAL FUE RESULTS LOOK LIKE AT 12 MONTHS ===

Based on real clinical data from hair restoration surgery:

HAIRLINE RECONSTRUCTION (the most critical visual change):
- The hairline is LOWERED from its current receded position to an age-appropriate level (7-10 cm above the eyebrows, measured from the glabella)
- The hairline follows a gentle curved contour connecting: the midfrontal point (center) → through macro-irregularities → to the frontal-temporal angles (FTA) on each side
- The front edge has MICRO-IRREGULARITIES: the border is NOT a smooth line — it has small, natural jagged variations and "sentinel hairs" (isolated single hairs placed 2-3mm beyond the main hairline border) that create a soft, gradual beginning
- TRANSITION ZONE: The first 0.5 cm behind the hairline border uses ONLY single-hair follicular units (1-hair grafts), placed at very low density (20-25 FU/cm²), creating a soft, feathered edge
- Behind the transition zone, density RAPIDLY increases using 2-3-4 hair follicular units in a BRICK-LAYING (staggered) pattern — never in straight rows — reaching 40-50 FU/cm² in the central frontal zone

TEMPORAL RECESSION CORRECTION ("entradas"):
- The receding temple areas (frontal-temporal angles) are COMPLETELY FILLED IN — this is one of the most visible changes in any transplant
- Temple points are reconstructed: sharp, angular sections where the hairline curves back toward the ears
- Temple grafts use ONLY single follicular units, placed at acute angles pointing DOWNWARD and TOWARD THE FACE
- Temple density: 20-30 FU/cm² with feathered edges
- The temple reconstruction FRAMES THE FACE — creating symmetry and a more youthful appearance
- Subtle asymmetry is maintained between left and right temple points (natural hair is never perfectly symmetrical)

MID-SCALP DENSITY:
- The area between the frontal hairline and crown receives medium-high density (30-40 FU/cm²)
- Hair direction: flows from front-to-back with a slight medial (inward) angle
- Previously visible scalp skin is now COVERED — no "see-through" thinning
- Grafts are placed in the brick-laying/staggered pattern to avoid visible rows

CROWN/VERTEX RESTORATION:
- The crown follows the natural WHORL PATTERN — hair spirals outward from a central point
- Grafts are placed starting from the whorl center, working outward in a spiral
- Crown graft angles: 20-25 degrees relative to the scalp surface
- Cross-hatching technique: some hairs grow TOWARD each other to create density illusion with fewer grafts
- Crown requires 14-18 months for full thickness, but at 12 months shows significant coverage
- The bald spot in the crown should be COVERED or dramatically reduced

HAIR CHARACTERISTICS:
- Transplanted hair matches the person's EXISTING hair exactly: same color, same texture (straight/wavy/curly), same thickness
- Hair growth direction varies by zone:
  * Frontal: angled FORWARD at 15-20 degrees, almost flat against scalp
  * Temporal: angled DOWNWARD toward the face at acute angles
  * Parietal (sides): angled downward and slightly backward
  * Crown: spiral/whorl pattern radiating from center point
- Hair appears NATURAL — like the person simply has good hair genetics, not like a wig or artificial addition

DONOR AREA:
- The back and sides of the head (donor zone) remain UNCHANGED
- FUE leaves NO visible linear scar (unlike FUT/strip method)
- Donor density appears uniform with no visible thinning from extraction

=== ABSOLUTE RULES ===

1. FACIAL FIDELITY (NON-NEGOTIABLE): Do NOT alter ANY facial feature — skin tone, skin texture, facial structure, nose, eyes, ears, eyebrows, beard, wrinkles, marks, expression. The person must be 100% recognizable. Only the SCALP/HAIR area changes.

2. PRESERVE EXACTLY: lighting conditions, background, clothing, jewelry, image quality, camera angle, color temperature, shadows. The only difference between input and output should be the hair.

3. PHOTOREALISM (NON-NEGOTIABLE): The output must look like a real photograph taken with a real camera of a real person. No AI artifacts, no painted look, no smooth/plastic skin, no uncanny valley effects. Match the exact photographic quality of the input.

4. TRANSFORMATION MUST BE OBVIOUS: If someone puts the before and after side by side, the hair difference must be immediately visible. More hair, fuller hairline, eliminated entradas, covered crown.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
=== OUTPUT: FRONTAL VIEW ===

Generate a FRONTAL photograph (face looking directly at the camera, same pose/angle as the input frontal photo).

WHAT MUST CHANGE IN THIS VIEW:
1. HAIRLINE: The receding hairline is now LOWER and FULLER. Where the input shows a high forehead with recession, the output shows a natural, age-appropriate hairline with micro-irregular edges and sentinel hairs.
2. TEMPORAL RECESSION ("entradas"): BOTH temple areas that show recession in the input are NOW COMPLETELY COVERED with hair. The frontal-temporal angles are reconstructed with defined temple points framing the face.
3. FRONTAL DENSITY: The area behind the new hairline shows FULL density — no scalp visible through thin hair. The transition from forehead skin to dense hair follows: bare skin → sentinel hairs → sparse single-hair zone (0.5cm) → rapidly increasing density with multi-hair grafts.
4. OVERALL IMPRESSION: From the front, this person now has a full, natural-looking head of hair where the hairline meets the forehead. The visual impact should be dramatic compared to the input.

The frontal view is the MOST IMPORTANT result — it's what people see in conversation. Make the transformation count.

OUTPUT: One single photorealistic frontal photograph. The hair transformation must be immediately obvious compared to the input photos.
`,

  lateral_left: `
=== OUTPUT: LEFT LATERAL VIEW ===

Generate a LEFT SIDE PROFILE photograph (person's left side facing the camera, ear and jawline visible, approximately 80-90 degree angle).

WHAT MUST CHANGE IN THIS VIEW:
1. LEFT TEMPLE: The left temporal recession ("entrada esquerda") is COMPLETELY ELIMINATED. Where the input shows a receding temple with visible scalp, the output shows hair covering the entire temporal area with a defined, sharp temple point.
2. LATERAL HAIRLINE: The contour from the center of the forehead curving back to the left ear shows a smooth, natural line of hair — no gaps, no thin patches, no visible recession.
3. TEMPLE POINT: The angular point where the hairline transitions toward the sideburn area is SHARP and DEFINED, with hair growing at acute downward angles toward the face.
4. SIDEBURN INTEGRATION: Transplanted temple hair blends seamlessly into the natural sideburn area — no harsh transition line.
5. HAIR ABOVE EAR: The parietal area above and behind the ear shows natural density with hair flowing downward and slightly backward.
6. TOP VISIBLE FROM SIDE: If the top of the head is visible from this angle, it should also show increased density.

OUTPUT: One single photorealistic left side profile photograph. Temple recession on the left side must be completely corrected.
`,

  lateral_right: `
=== OUTPUT: RIGHT LATERAL VIEW ===

Generate a RIGHT SIDE PROFILE photograph (person's right side facing the camera, ear and jawline visible, approximately 80-90 degree angle).

WHAT MUST CHANGE IN THIS VIEW:
1. RIGHT TEMPLE: The right temporal recession ("entrada direita") is COMPLETELY ELIMINATED. Where the input shows a receding temple with visible scalp, the output shows hair covering the entire temporal area with a defined, sharp temple point.
2. LATERAL HAIRLINE: The contour from the center of the forehead curving back to the right ear shows a smooth, natural line of hair — no gaps, no thin patches, no visible recession.
3. TEMPLE POINT: The angular point where the hairline transitions toward the sideburn area is SHARP and DEFINED, with hair growing at acute downward angles toward the face.
4. SIDEBURN INTEGRATION: Transplanted temple hair blends seamlessly into the natural sideburn area — no harsh transition line.
5. HAIR ABOVE EAR: The parietal area above and behind the ear shows natural density with hair flowing downward and slightly backward.
6. TOP VISIBLE FROM SIDE: If the top of the head is visible from this angle, it should also show increased density.

OUTPUT: One single photorealistic right side profile photograph. Temple recession on the right side must be completely corrected.
`,

  top: `
=== OUTPUT: TOP/CROWN VIEW ===

Generate a TOP-DOWN or HIGH 3/4 ANGLE photograph (looking down at the top of the person's head).

WHAT MUST CHANGE IN THIS VIEW:
1. CROWN COVERAGE: Any bald spot or thinning area in the crown (vertex) is now COVERED with hair following the natural WHORL PATTERN — hair spiraling outward from a central point.
2. MID-SCALP: The entire area between the frontal zone and crown shows CONSISTENT, EVEN density with no thin patches or visible scalp skin.
3. FRONTAL ZONE FROM ABOVE: If the front of the head is visible, the reconstructed hairline and filled temporal areas should be visible from this elevated angle.
4. HAIR PART: If the person has a natural part line, it should remain visible and natural-looking, with dense hair on both sides.
5. OVERALL DENSITY: From above, the scalp should NOT be visible through the hair in transplanted areas. The coverage should look like a person with naturally good hair density (~35-45 FU/cm² throughout).
6. WHORL DETAIL: The crown whorl must look natural — hair radiating in a spiral from the center, with cross-hatched graft placement creating the illusion of density.

OUTPUT: One single photorealistic top-down or elevated-angle photograph. Previously bald or thinning areas on the crown and mid-scalp must show full hair coverage.
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
