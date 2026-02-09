
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

=== WHAT YOU MUST CHANGE (HAIR ONLY) ===

1. LOWER THE HAIRLINE DRAMATICALLY:
- Move the hairline FORWARD (toward the eyebrows) by 2-3 cm. The forehead MUST appear visibly SHORTER in the output.
- The new hairline shape: a gentle convex wave with micro-zigzag irregularities (never a straight line).
- Add "sentinel hairs" — a few single hairs scattered 2-3mm in front of the main hairline for a gradual skin-to-hair transition.
- VALIDATION: Measure the forehead in the input (from eyebrows to hairline). In the output, this distance MUST be noticeably smaller. If the forehead looks the same size, YOU HAVE FAILED.

2. FILL ALL TEMPLE RECESSION ("ENTRADAS") COMPLETELY:
- The bald triangular areas at both temples must be 100% covered with hair. ZERO bare skin remaining.
- Temple hair grows at very acute angles, pointing downward toward the face.
- Temple edges are feathered (lighter density than center) for a natural look.
- Rebuild sharp temple points that frame the face.
- VALIDATION: If any bare skin is visible in the temple triangles, YOU HAVE FAILED.

3. COVER ALL VISIBLE SCALP:
- Every area where scalp/skin shows through thin hair in the input MUST be covered with dense hair in the output.
- Hair must have natural volume and body — not flat against the scalp.
- No scalp skin should be visible through the hair from any angle.
- VALIDATION: If scalp skin is still visible through the hair in the output, YOU HAVE FAILED.

4. HAIR TEXTURE RULES:
- SAME color, texture, and thickness as the patient's existing hair.
- Frontal zone: hair angles forward at 15-20°.
- Temples: hair angles downward toward the face.
- Crown: natural whorl/spiral pattern.
- Hair has volume and natural movement — not plastered flat.

=== WHAT YOU MUST NOT CHANGE ===

- Face: Do NOT alter skin, features, expression, beard, eyebrows, ears, nose, eyes — NOTHING.
- Environment: Same lighting, background, clothing, jewelry, shadows, color temperature.
- Photo quality: Match the exact photographic quality of the input. No AI artifacts, no painted/smooth look.
- Donor area (back/sides of head): stays unchanged.

=== SELF-CHECK BEFORE OUTPUTTING ===

Compare your output mentally against the input:
1. Is the forehead visibly shorter? If NO → redo with lower hairline.
2. Are temple triangles fully filled? If NO → add more temple hair.
3. Is scalp skin hidden everywhere? If NO → increase density.
4. Does the face look identical? If NO → you changed too much, preserve the face.
5. Does it look like a real photo? If NO → reduce artificial look.

The transformation must be DRAMATIC — like going from Norwood 3-4 to Norwood 1. If your output looks similar to the input, the simulation is worthless.
`;

const ANGLE_PROMPTS: Record<SimulationAngle, string> = {
  frontal: `
=== GENERATE: FRONTAL VIEW (face looking at camera, same pose as input) ===

STEP-BY-STEP EDITING INSTRUCTIONS:

STEP 1 — LOWER THE HAIRLINE:
- Locate the current hairline in the input. Note how far it is from the eyebrows.
- In your output, ADD HAIR to the forehead area so the hairline starts 2-3 cm LOWER (closer to the eyebrows). Paint new hair onto the upper forehead skin.
- The forehead must look VISIBLY SHORTER than in the input photo. This is the #1 priority.

STEP 2 — FILL BOTH TEMPLE TRIANGLES:
- Locate the two bald triangular areas ("entradas") at the left and right temples.
- PAINT HAIR over these entire triangles. No bare skin should remain. Both temples must have hair covering them completely.
- The new temple hair should be finer/lighter at the edges (feathered) and angle downward.

STEP 3 — INCREASE DENSITY:
- All areas where scalp shows through thin hair: add more hair until scalp is hidden.
- Hair should have natural volume and body.

STEP 4 — VERIFY FACE IS UNCHANGED:
- The face, beard, skin, eyes, nose, ears, expression must be IDENTICAL to the input.

OUTPUT: One photorealistic frontal photo. The forehead must be visibly shorter and temples fully covered.
`,

  lateral_left: `
=== GENERATE: LEFT SIDE PROFILE ===

CAMERA ORIENTATION (do not flip sides):
- Shows the person's LEFT cheek, LEFT ear, LEFT jawline.
- Nose points to the RIGHT side of the frame.
- The LEFT EAR is visible. The RIGHT ear is NOT visible.

STEP-BY-STEP EDITING INSTRUCTIONS:

STEP 1 — FILL THE LEFT TEMPLE GAP:
- In the input, there is a visible bald/thin area at the left temple — a concave gap or triangular bare skin between the frontal hairline and the hair above the ear.
- PAINT HAIR over this entire gap. The silhouette from forehead to ear must become a smooth, continuous curve of hair with NO bald dip.
- Temple hair angles downward toward the face and connects to the sideburn.

STEP 2 — ADVANCE THE HAIRLINE FORWARD:
- The hairline visible from this side angle must start LOWER on the forehead than in the input.
- Add hair to the upper forehead/temple region to bring the hairline forward.

STEP 3 — ENSURE DENSITY:
- No scalp visible through the hair anywhere on the visible side.
- Hair has natural thickness and volume.

OUTPUT: One photorealistic LEFT profile photo. Temple gap completely filled, hairline visibly lower.
`,

  lateral_right: `
=== GENERATE: RIGHT SIDE PROFILE ===

CAMERA ORIENTATION (do not flip sides):
- Shows the person's RIGHT cheek, RIGHT ear, RIGHT jawline.
- Nose points to the LEFT side of the frame.
- The RIGHT EAR is visible. The LEFT ear is NOT visible.

STEP-BY-STEP EDITING INSTRUCTIONS:

STEP 1 — FILL THE RIGHT TEMPLE GAP:
- In the input, there is a visible bald/thin area at the right temple — a concave gap or triangular bare skin between the frontal hairline and the hair above the ear.
- PAINT HAIR over this entire gap. The silhouette from forehead to ear must become a smooth, continuous curve of hair with NO bald dip.
- Temple hair angles downward toward the face and connects to the sideburn.

STEP 2 — ADVANCE THE HAIRLINE FORWARD:
- The hairline visible from this side angle must start LOWER on the forehead than in the input.
- Add hair to the upper forehead/temple region to bring the hairline forward.

STEP 3 — ENSURE DENSITY:
- No scalp visible through the hair anywhere on the visible side.
- Hair has natural thickness and volume.

OUTPUT: One photorealistic RIGHT profile photo. Temple gap completely filled, hairline visibly lower.
`,

  top: `
=== GENERATE: TOP-DOWN VIEW (looking down at the top of the head) ===

STEP-BY-STEP EDITING INSTRUCTIONS:

STEP 1 — COVER ALL VISIBLE SCALP:
- In the input, scalp skin is visible through thin hair on top. Identify EVERY area where pink/white scalp skin shows through.
- PAINT DENSE HAIR over ALL of these areas. Not longer hair — MORE hair. Increase the NUMBER of hair strands, not just length.
- After your edit, looking down at the head, you should see ONLY HAIR, ZERO SCALP SKIN.

STEP 2 — EXTEND HAIRLINE FORWARD:
- The front edge of the hair (visible from this top angle) must start FURTHER FORWARD on the head than in the input.
- Add hair to the frontal zone so it begins lower on the forehead.

STEP 3 — NATURAL HAIR DIRECTION:
- Frontal zone: hair flows forward.
- Mid-scalp: hair flows front-to-back.
- Crown: natural whorl/spiral pattern.
- Hair has volume — not flat against the scalp.

CRITICAL: The #1 goal for this angle is SCALP COVERAGE. If ANY scalp skin is visible through the hair in your output, YOU HAVE FAILED. The difference between input and output should be dramatic: input shows scalp through thin hair, output shows only dense hair with zero scalp visible.

OUTPUT: One photorealistic top-down photo. Complete scalp coverage — no skin visible through hair.
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
