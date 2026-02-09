
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
You are a photorealistic hair transplant simulation engine. You edit photos to show what a person would look like 12 months after a high-graft-count FUE hair transplant (3000-4000 grafts).

MULTI-IMAGE INPUT: These are multiple photos of the SAME person from different angles. Use all of them to understand their face, hair color, and hair texture.

=== ABSOLUTE CONSTRAINT — HAIR LENGTH AND STYLE ===

This is the MOST IMPORTANT rule. Read it carefully:
- The hair in the output MUST be the EXACT SAME LENGTH and STYLE as the patient's existing hair in the input photos.
- Do NOT make hair longer. Do NOT change the hairstyle. Do NOT add flowing or wavy long hair.
- "More hair" means NEW FOLLICLES GROWING in areas that were previously bald/thin. It does NOT mean longer hair.
- If the patient has short hair in the input, the output must show short hair. If medium hair, then medium hair.
- The transplant adds DENSITY (more hairs per cm²) to bald zones. It does NOT change hair length or style.
- VIOLATION CHECK: If the hair in your output is longer than in the input, YOU HAVE FAILED. Start over.

=== WHAT YOU MUST CHANGE ===

1. LOWER THE HAIRLINE — MAKE THE FOREHEAD SMALLER:
- Look at the input: the forehead (skin between eyebrows and where hair begins) is large because the hairline has receded.
- In your output: NEW SHORT HAIRS must grow from the previously bald forehead skin. The area of visible forehead skin must be REDUCED by 30-40%.
- Think of it as: the upper portion of the forehead that is currently bare skin becomes covered with new hair follicles. The hair starts growing from LOWER on the forehead.
- Proportion guide: if the forehead currently takes up ~40% of the face height, after the transplant it should take up ~25-30%.
- The new hairline border has a gentle convex wave shape with micro-zigzag irregularities (never a straight line). A few "sentinel hairs" scatter 2-3mm in front of the main hairline.
- VALIDATION: Compare forehead size in input vs output. The forehead MUST be visibly smaller. If it looks the same size, YOU HAVE FAILED.

2. FILL ALL TEMPLE RECESSION ("ENTRADAS"):
- The bald triangular areas at both temples must be 100% covered with new hair. ZERO bare skin remaining.
- The new temple hair has the SAME length as the patient's existing hair. It grows at acute angles pointing downward toward the face.
- Temple edges are feathered (lighter density than center).
- VALIDATION: If any bare skin is visible in the temple triangles, YOU HAVE FAILED.

3. COVER ALL VISIBLE SCALP:
- Every area where scalp/skin shows through thin hair MUST be filled with new hair follicles until the scalp is completely hidden.
- This means MORE HAIRS growing from the scalp at the root level — NOT longer hairs draped over.
- VALIDATION: If scalp skin is still visible through the hair, YOU HAVE FAILED.

=== WHAT YOU MUST NOT CHANGE ===

- HAIR LENGTH AND STYLE: Keep the exact same length, cut, and styling as the input. This is critical.
- Face: Do NOT alter skin, features, expression, beard, eyebrows, ears, nose, eyes — NOTHING.
- Environment: Same lighting, background, clothing, jewelry, shadows, color temperature.
- Photo quality: Match the exact photographic quality of the input. No AI artifacts, no painted/smooth look.

=== SELF-CHECK BEFORE OUTPUTTING ===

1. Is the hair the SAME LENGTH as the input? If NO → you changed the hairstyle, REDO.
2. Is the forehead visibly smaller/shorter? If NO → lower the hairline more, REDO.
3. Are temple recession areas fully filled with hair? If NO → add more temple hair.
4. Is scalp skin hidden everywhere? If NO → increase follicle density.
5. Does the face look identical to the input? If NO → preserve the face better.
6. Does it look like a real photograph? If NO → reduce artificial look.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
=== GENERATE: FRONTAL VIEW (face looking at camera, same pose as input) ===

STEP-BY-STEP INSTRUCTIONS:

STEP 1 — PRESERVE HAIR LENGTH AND STYLE (do this FIRST):
- Look at the patient's current hair length and hairstyle in the input.
- Your output MUST show the EXACT SAME hair length and style. If they have short hair, output short hair. If medium, then medium.
- Do NOT add long hair, flowing hair, or change the hairstyle in any way.

STEP 2 — SHRINK THE FOREHEAD (the #1 visible change):
- In the input, the forehead is large because the hairline has receded high.
- In your output, new hair follicles must grow from the UPPER FOREHEAD SKIN — the area that is currently bare.
- The visible forehead area must SHRINK by 30-40%. If the forehead was taking ~40% of face height, it should now take ~25-30%.
- The new hairs on the upper forehead are the SAME length as the existing hair. They are simply new follicles growing where before there was only skin.
- New hairline shape: gentle convex wave with irregular micro-zigzag border. A few sentinel hairs 2-3mm in front.

STEP 3 — FILL BOTH TEMPLE TRIANGLES:
- The two bald triangular areas ("entradas") at both temples: cover them 100% with new hair follicles.
- No bare skin remaining in the temple zone. Temple hair angles downward, feathered at edges.

STEP 4 — INCREASE DENSITY WHERE SCALP SHOWS:
- Anywhere scalp is visible through thin hair: add more follicles until scalp is hidden.

STEP 5 — VERIFY:
- Hair length unchanged? Face identical? Forehead visibly smaller? Temples filled?

OUTPUT: One photorealistic frontal photo. Forehead visibly smaller, same hair length/style.
`,

  lateral_left: `
=== GENERATE: LEFT SIDE PROFILE ===

CAMERA ORIENTATION (do not flip sides):
- Shows the person's LEFT cheek, LEFT ear, LEFT jawline.
- Nose points to the RIGHT side of the frame.
- The LEFT EAR is visible. The RIGHT ear is NOT visible.

STEP-BY-STEP INSTRUCTIONS:

STEP 1 — PRESERVE HAIR LENGTH AND STYLE:
- The hair must remain the EXACT same length and style as the input. Do NOT make it longer or change the hairstyle.

STEP 2 — FILL THE LEFT TEMPLE GAP:
- In the input, there is a bald/thin area at the left temple — a concave gap between the frontal hairline and the hair above the ear.
- New hair follicles must grow in this entire gap area. The silhouette from forehead to ear must become a smooth, continuous curve of hair with NO bald dip.
- The new temple hair is the SAME LENGTH as the existing hair. It angles downward toward the face and connects to the sideburn.

STEP 3 — LOWER THE HAIRLINE FROM THIS ANGLE:
- From the side view, the point where hair starts on the forehead must be LOWER/FURTHER FORWARD than in the input.
- New follicles grow from the previously bare forehead skin, reducing the visible forehead from this profile angle.
- The forehead visible from this side must appear smaller than in the input.

STEP 4 — ENSURE DENSITY:
- No scalp visible through the hair. Natural thickness and volume.

OUTPUT: One photorealistic LEFT profile. Temple filled, forehead smaller, SAME hair length.
`,

  lateral_right: `
=== GENERATE: RIGHT SIDE PROFILE ===

CAMERA ORIENTATION (do not flip sides):
- Shows the person's RIGHT cheek, RIGHT ear, RIGHT jawline.
- Nose points to the LEFT side of the frame.
- The RIGHT EAR is visible. The LEFT ear is NOT visible.

STEP-BY-STEP INSTRUCTIONS:

STEP 1 — PRESERVE HAIR LENGTH AND STYLE:
- The hair must remain the EXACT same length and style as the input. Do NOT make it longer or change the hairstyle.

STEP 2 — FILL THE RIGHT TEMPLE GAP:
- In the input, there is a bald/thin area at the right temple — a concave gap between the frontal hairline and the hair above the ear.
- New hair follicles must grow in this entire gap area. The silhouette from forehead to ear must become a smooth, continuous curve of hair with NO bald dip.
- The new temple hair is the SAME LENGTH as the existing hair. It angles downward toward the face and connects to the sideburn.

STEP 3 — LOWER THE HAIRLINE FROM THIS ANGLE:
- From the side view, the point where hair starts on the forehead must be LOWER/FURTHER FORWARD than in the input.
- New follicles grow from the previously bare forehead skin, reducing the visible forehead from this profile angle.
- The forehead visible from this side must appear smaller than in the input.

STEP 4 — ENSURE DENSITY:
- No scalp visible through the hair. Natural thickness and volume.

OUTPUT: One photorealistic RIGHT profile. Temple filled, forehead smaller, SAME hair length.
`,

  top: `
=== GENERATE: TOP-DOWN VIEW (looking down at the top of the head) ===

STEP-BY-STEP INSTRUCTIONS:

STEP 1 — PRESERVE HAIR LENGTH AND STYLE:
- The hair must remain the EXACT same length as the input. Do NOT make hair longer.
- The change is DENSITY (more follicles per cm²), NOT length.

STEP 2 — ADD NEW FOLLICLES TO COVER ALL SCALP:
- Look at the input from above: identify every spot where pink/white scalp skin is visible through the hair.
- In each of those spots, add NEW HAIR FOLLICLES growing from the scalp at the root level.
- This means more individual hair STRANDS of the same length — NOT longer strands draped over bald spots.
- The result: looking down, you see a DENSE carpet of hair with ZERO scalp skin visible anywhere.
- Think of it as: the number of hairs per square centimeter DOUBLES or TRIPLES in thin areas.

STEP 3 — EXTEND HAIRLINE FORWARD:
- From this top angle, the front edge of the hair must start FURTHER FORWARD on the head than in the input.
- New follicles grow on the previously bare upper forehead skin.

STEP 4 — NATURAL HAIR DIRECTION:
- Frontal zone: hair flows forward. Mid-scalp: front-to-back. Crown: natural whorl/spiral.
- Hair has volume — not flat.

CRITICAL: The #1 goal is TOTAL SCALP COVERAGE through INCREASED FOLLICLE DENSITY (not longer hair). Input shows scalp through thin hair → output shows only dense hair, zero scalp visible.

OUTPUT: One photorealistic top-down photo. Complete scalp coverage, same hair length as input.
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
