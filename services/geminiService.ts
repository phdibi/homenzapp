
import { GoogleGenAI } from "@google/genai";

/**
 * Simulate high-fidelity hair transplant (FUE style) 
 * using the specialized prompt for professional medical results.
 */
export const restoreHairVisual = async (base64Images: string[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imageParts = base64Images.map(img => ({
    inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        ...imageParts,
        { 
          text: `
            You are a photorealistic hair transplant simulation engine specialized in FUE (Follicular Unit Extraction) technique results.

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

            OUTPUT: A photorealistic image identical to the input in every way EXCEPT the hair/scalp area, which should show a natural, medically plausible post-FUE transplant result.
          ` 
        }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Falha ao gerar restauração visual de alta fidelidade.");
};
