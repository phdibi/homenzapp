import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

async function testNativeInpainting() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    if (!apiKey) {
        console.error("No API key");
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const response = await ai.models.editImage({
            model: 'imagen-3.0-capability-001',
            prompt: 'Fill this entire area with thick black hair',
            referenceImages: [],
            config: {
                numberOfImages: 1,
            },
        });
        console.log("Success:", !!response);
    } catch (err: any) {
        console.error("Failed:", err.message);
    }
}

testNativeInpainting();
