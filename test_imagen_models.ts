import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

async function testNativeInpainting() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    if (!apiKey) {
        console.error("No API key");
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const models = [
        'imagen-3.0-capability-001',
        'imagen-3.0-generate-001',
        'gemini-3-pro-image-preview',
        'imagen-3.0-fast-generate-001'
    ];

    for (const model of models) {
        console.log(`Testing editImage with ${model}...`);
        try {
            const response = await ai.models.editImage({
                model: model,
                prompt: 'Fill this entire area with thick black hair',
                referenceImages: [],
                config: {
                    numberOfImages: 1,
                },
            });
            console.log(`Success with ${model}:`, !!response);
        } catch (err: any) {
            console.error(`Failed ${model}:`, err.message);
        }
    }
}

testNativeInpainting();
