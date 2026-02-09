
import { GoogleGenAI } from "@google/genai";
import type { SimulationAngle } from "../types";

// Reutiliza a instância da API (evita criar uma nova para cada chamada)
let _aiInstance: InstanceType<typeof GoogleGenAI> | null = null;
const getAI = (): InstanceType<typeof GoogleGenAI> => {
  if (!_aiInstance) {
    _aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return _aiInstance;
};

/**
 * Comprime imagem para reduzir payload enviado à API.
 * Reduz para max 1024px no maior lado e qualidade JPEG 0.8.
 * Isso reduz drasticamente o tamanho dos tokens de input (~70% menor).
 */
const compressImage = (base64DataUrl: string, maxSize = 1024, quality = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(base64DataUrl); // fallback: usa original
    img.src = base64DataUrl;
  });
};

const BASE_FUE_PROMPT = `
You are a world-class photorealistic hair transplant simulation engine trained on thousands of real FUE (Follicular Unit Extraction) before-and-after clinical photographs.

YOUR PRIMARY MISSION: Take photos of a person with visible hair loss and produce a DRAMATICALLY TRANSFORMED photograph showing what they would realistically look like 12 months after a successful, high-graft-count FUE hair transplant. The transformation must be IMMEDIATELY OBVIOUS when comparing input to output.

CRITICAL RULE: The output image MUST show visibly MORE hair than the input. Areas that are bald, thinning, or show scalp skin in the input MUST be covered with natural-looking hair in the output. If the transformation is not obvious, you have failed the task.

MULTI-IMAGE INPUT: You are receiving multiple photographs of the SAME person from different angles. Use ALL of them to understand their complete facial structure, existing hair color, texture, and growth patterns. Never blend features from different angles — they are the same individual.

=== VISUAL PATTERNS FROM REAL FUE BEFORE/AFTER PHOTOGRAPHS ===

I have analyzed hundreds of real clinical before/after FUE photographs. Here are the EXACT visual patterns you must replicate:

PATTERN 1 — FRONTAL HAIRLINE SHAPE (the #1 most important change):
- BEFORE: The patient has a "V-shaped" or "M-shaped" recession. The hairline is HIGH, with deep triangular bald areas at both temples ("entradas"). The center of the hairline may still have some hair but the corners are deeply receded.
- AFTER: The new hairline is DRAMATICALLY LOWER — typically 2-3 cm lower than the receded position. The shape is a gentle CONVEX CURVE (slightly rounded/arched), NOT a straight line and NOT a perfect semicircle. It follows a subtle "soft M" or "wavy" contour — the center dips slightly forward, then the line gently curves back toward each temple.
- The new hairline border is WAVY/UNDULATING at the microscopic level — like a surgeon's zigzag marking. It is NEVER a sharp straight line. Small zigzag irregularities make it look natural.
- "Sentinel hairs": a few isolated single hairs extend 2-3mm BEYOND the main hairline border into the forehead, creating a gradual fade from skin to hair rather than an abrupt edge.
- The overall visual effect: the forehead appears SHORTER and the face appears more PROPORTIONAL and youthful.

PATTERN 2 — TEMPLE/ENTRADA FILLING (the #2 most visible change):
- BEFORE: Deep V-shaped bald triangles at both temples. Skin fully exposed. The hairline retreats far back from the original temple point position.
- AFTER: These triangular bald areas are COMPLETELY FILLED with hair. Zero exposed skin in the temple zone. The temple points are rebuilt as sharp angular corners that frame the face.
- The new temple hair grows at VERY ACUTE ANGLES — almost flat against the skin, pointing downward and toward the face. This creates natural-looking sideburn integration.
- The density at the temple edges is LIGHTER than the center (feathered), creating a soft border rather than a harsh wall of hair.
- CRITICAL: In real before/after photos, the temple filling is one of the MOST DRAMATIC and MOST VISIBLE changes. The person goes from having an exposed, receded temple to having hair fully framing their face on both sides.

PATTERN 3 — FRONTAL ZONE DENSITY:
- BEFORE: The area behind the hairline may show thinning, with scalp skin visible through sparse hair.
- AFTER: The frontal zone (from hairline to mid-scalp) is DENSE. No scalp skin is visible through the hair when viewed from the front. The hair has VOLUME — it stands up slightly from the scalp, creating body and thickness.
- Density gradient: HIGHEST at the center-front (40-50 FU/cm²), gradually decreasing toward the temples (20-30 FU/cm²). The center of the head always has more density than the sides.

PATTERN 4 — TOP/CROWN VIEW:
- BEFORE: When viewed from above, the scalp is clearly visible through thin or absent hair. There may be a bald spot at the crown.
- AFTER: When viewed from above, the scalp is NO LONGER VISIBLE. Dense hair covers the entire top of the head. The hair flows forward from the crown whorl in the back, creating a natural direction pattern. The previously marked surgical area (the zigzag/wavy line drawn by the surgeon) is now covered by dense, natural-looking hair growth.

PATTERN 5 — LATERAL/PROFILE VIEW:
- BEFORE: From the side, the temporal recession is clearly visible — there's a concave gap between the front hairline and the hair above the ear. The profile shows an unnaturally high hairline at the temple.
- AFTER: From the side, the entire contour from forehead to ear is a smooth, continuous line of hair. The temple gap is COMPLETELY FILLED. Hair flows downward at the temple at acute angles, seamlessly connecting to the sideburn. The hair above and behind the ear has natural thickness and direction.

PATTERN 6 — HAIR TEXTURE AND BEHAVIOR:
- The transplanted hair has the SAME color, SAME texture (straight/wavy/curly), SAME thickness as the patient's existing hair
- Hair growth direction by zone:
  * Frontal zone: angled FORWARD at 15-20°, almost flat against the scalp
  * Temples: angled DOWNWARD and TOWARD THE FACE at very acute angles
  * Mid-scalp: flows from front-to-back
  * Crown: spiral/whorl pattern
- The hair has natural VOLUME — it's not plastered flat to the head. It has body, slight lift at the roots, and natural movement

PATTERN 7 — WHAT NOT TO DO (common mistakes):
- Do NOT create a perfectly straight, ruler-drawn hairline — real transplants have organic, wavy borders
- Do NOT make the hairline too low (below 6cm from eyebrows) — it would look unnatural for the person's age
- Do NOT make all the hair the same length/direction — natural hair has variation
- Do NOT add too much density at the temples — temples are always lighter than the center
- Do NOT forget the sentinel hairs — the front edge must fade gradually, not start abruptly
- Do NOT change the hair color or texture — it must match the existing hair exactly
- Do NOT alter the donor area (back/sides of head) — it stays unchanged

=== ABSOLUTE RULES ===

1. FACIAL FIDELITY (NON-NEGOTIABLE): Do NOT alter ANY facial feature — skin tone, skin texture, facial structure, nose, eyes, ears, eyebrows, beard, wrinkles, marks, expression. The person must be 100% recognizable. Only the SCALP/HAIR area changes.

2. PRESERVE EXACTLY: lighting conditions, background, clothing, jewelry, image quality, camera angle, color temperature, shadows. The only difference between input and output should be the hair.

3. PHOTOREALISM (NON-NEGOTIABLE): The output must look like a real photograph taken with a real camera of a real person. No AI artifacts, no painted look, no smooth/plastic skin, no uncanny valley effects. Match the exact photographic quality of the input.

4. TRANSFORMATION MUST BE OBVIOUS: If someone puts the before and after side by side, the hair difference must be immediately visible — just like in real clinical before/after photos where the patient goes from visibly balding to having a full head of hair.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
=== OUTPUT: FRONTAL VIEW ===

Generate a FRONTAL photograph (face looking directly at the camera, same pose as the input).

Apply PATTERN 1 (hairline shape) + PATTERN 2 (temple filling) + PATTERN 3 (density):

HAIRLINE CHANGE — this is the main event:
- Look at the input photo. Identify WHERE the current hairline is and WHERE the recession ("entradas") starts on each side.
- In the output, LOWER the hairline by 2-3 cm. The new hairline follows a gentle CONVEX WAVE shape — not straight, not semicircular. A soft undulating contour with micro-zigzag irregularities at the border.
- Sentinel hairs: place a few isolated single hairs 2-3mm in front of the main hairline border for a gradual fade from skin to hair.

TEMPLE FILLING — the most dramatic visible change:
- The triangular bald areas at both temples ("entradas") must be COMPLETELY FILLED with hair. Zero bare skin remaining in the temple zone.
- The temple points are rebuilt: sharp angular corners of hair that frame the face bilaterally.
- Temple hair is finer and lighter in density than the center — creating a feathered, natural edge.

DENSITY:
- Behind the new hairline: DENSE hair with visible volume and body. No scalp visible through the hair.
- Center is denser than sides. Hair has natural lift/volume, not flat against the head.

VISUAL REFERENCE: Think of those dramatic before/after photos where the patient goes from a clearly receding M-shaped hairline with deep temple recession to a full, natural-looking hairline with both entradas completely covered and the forehead appearing visibly shorter.

OUTPUT: One single photorealistic frontal photograph. The transformation must be as dramatic as real clinical before/after photos.
`,

  lateral_left: `
=== OUTPUT: LEFT SIDE PROFILE ===

CAMERA ORIENTATION (critical — do not get this wrong):
- The camera sees the person's LEFT cheek, LEFT ear, LEFT jawline
- The person's NOSE points to the RIGHT side of the image frame
- The LEFT EAR is visible in the image
- This is NOT the right side. The RIGHT ear must NOT be visible.

Apply PATTERN 5 (lateral view) + PATTERN 2 (temple filling):

TEMPLE TRANSFORMATION — the key change visible from this angle:
- BEFORE (in the input photos): from the side, there's a visible concave GAP or bald triangle at the left temple between the front hairline and the hair above the ear. The left "entrada" is exposed.
- AFTER (in the output): this entire gap is FILLED with hair. The contour from forehead to ear is a smooth, continuous, natural line of hair. The temple area shows dense hair growing downward at acute angles toward the face, seamlessly connecting to the left sideburn.
- The left temple point is a sharp angular corner where the hairline curves toward the ear.
- Hair above and behind the left ear flows downward and slightly backward with natural thickness.

VISUAL REFERENCE: Think of profile before/after photos where the patient goes from having a clearly visible bald temple triangle from the side to having that entire area filled — the lateral silhouette of the head changes from having a "dent" of baldness at the temple to a smooth, continuous hair contour.

OUTPUT: One single photorealistic LEFT side profile photograph showing the LEFT ear. Temple recession completely corrected.
`,

  lateral_right: `
=== OUTPUT: RIGHT SIDE PROFILE ===

CAMERA ORIENTATION (critical — do not get this wrong):
- The camera sees the person's RIGHT cheek, RIGHT ear, RIGHT jawline
- The person's NOSE points to the LEFT side of the image frame
- The RIGHT EAR is visible in the image
- This is NOT the left side. The LEFT ear must NOT be visible.

Apply PATTERN 5 (lateral view) + PATTERN 2 (temple filling):

TEMPLE TRANSFORMATION — the key change visible from this angle:
- BEFORE (in the input photos): from the side, there's a visible concave GAP or bald triangle at the right temple between the front hairline and the hair above the ear. The right "entrada" is exposed.
- AFTER (in the output): this entire gap is FILLED with hair. The contour from forehead to ear is a smooth, continuous, natural line of hair. The temple area shows dense hair growing downward at acute angles toward the face, seamlessly connecting to the right sideburn.
- The right temple point is a sharp angular corner where the hairline curves toward the ear.
- Hair above and behind the right ear flows downward and slightly backward with natural thickness.

VISUAL REFERENCE: Think of profile before/after photos where the patient goes from having a clearly visible bald temple triangle from the side to having that entire area filled — the lateral silhouette of the head changes from having a "dent" of baldness at the temple to a smooth, continuous hair contour.

OUTPUT: One single photorealistic RIGHT side profile photograph showing the RIGHT ear. Temple recession completely corrected.
`,

  top: `
=== OUTPUT: TOP/CROWN VIEW ===

Generate a TOP-DOWN or HIGH 3/4 ANGLE photograph (looking down at the top of the person's head).

Apply PATTERN 4 (top/crown view):

COVERAGE TRANSFORMATION:
- BEFORE (in the input): viewed from above, the scalp skin is visible through thin hair, especially in the frontal zone and crown. The hairline recession is visible as a high forehead line.
- AFTER (in the output): viewed from above, the scalp is NO LONGER VISIBLE anywhere on top. Dense, natural hair covers the entire surface. The previously bald or thinning areas are filled with hair that flows in the natural direction pattern.

SPECIFIC DETAILS:
- The new lower hairline is visible from this elevated angle — the hair starts further forward on the head than in the input.
- The frontal zone shows dense hair flowing forward
- The mid-scalp shows even coverage with no thin patches
- The crown/vertex follows the natural WHORL PATTERN — hair spiraling outward from a central point
- If there was a bald spot at the crown, it's now covered with hair
- Hair has natural volume and body — not flat against the scalp

VISUAL REFERENCE: Think of those top-down before/after photos where the "before" shows a marked surgical area with scalp visible, and the "after" shows the same area completely covered with dense, natural-looking hair that conceals the scalp entirely.

OUTPUT: One single photorealistic top-down or elevated-angle photograph. All previously bald/thinning areas must show full coverage.
`,
};

/**
 * Prepara as imagens comprimidas e convertidas em parts para a API.
 * Cache para evitar recomprimir as mesmas imagens em chamadas paralelas.
 */
let _cachedImageParts: { key: string; parts: Array<{ inlineData: { data: string; mimeType: string } }> } | null = null;

const prepareImageParts = async (base64Images: string[]): Promise<Array<{ inlineData: { data: string; mimeType: string } }>> => {
  const cacheKey = base64Images.map(img => img.slice(-50)).join('|');

  if (_cachedImageParts && _cachedImageParts.key === cacheKey) {
    return _cachedImageParts.parts;
  }

  const compressed = await Promise.all(base64Images.map(img => compressImage(img)));
  const parts = compressed.map(img => ({
    inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
  }));

  _cachedImageParts = { key: cacheKey, parts };
  return parts;
};

export const restoreHairForAngle = async (
  base64Images: string[],
  angle: SimulationAngle
): Promise<string> => {
  const ai = getAI();
  const imageParts = await prepareImageParts(base64Images);

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

  // Pré-comprime as imagens uma única vez antes de disparar as 4 chamadas paralelas
  await prepareImageParts(base64Images);

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
