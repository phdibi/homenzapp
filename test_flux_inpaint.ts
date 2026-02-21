import * as fs from "fs";

async function testFluxInpaint() {
    const apiKey = process.env.FAL_KEY || "";
    if (!apiKey) { return; }

    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: apiKey });

    const endpoints = [
        'fal-ai/flux/dev/image-to-image',
        'fal-ai/flux-pro/v1.1-ultra-inpainting',
        'fal-ai/flux-general'
    ];

    for (const ep of endpoints) {
        console.log("Testing:", ep);
        try {
            const result = await fal.subscribe(ep, {
                input: {
                    prompt: 'Thick dark hair',
                    image_url: 'https://storage.googleapis.com/falserverless/gallery/inpainting/input.png',
                    mask_url: 'https://storage.googleapis.com/falserverless/gallery/inpainting/mask.png',
                }
            }) as any;
            console.log(`Success ${ep}:`, !!(result.images || result.data?.images));
            return;
        } catch (err: any) {
            console.error(`Failed ${ep}:`, err.message);
        }
    }
}

testFluxInpaint();
