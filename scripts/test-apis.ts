/**
 * Script de teste comparativo: Gemini vs OpenAI vs FLUX Kontext
 *
 * Envia a MESMA foto + MESMO prompt para 3 APIs diferentes
 * e salva os resultados para comparação visual.
 *
 * Uso:
 *   npx tsx scripts/test-apis.ts <caminho-da-foto-frontal>
 *
 * Variáveis de ambiente necessárias:
 *   API_KEY        — Google Gemini API key
 *   OPENAI_API_KEY — OpenAI API key
 *   FAL_KEY        — fal.ai API key (criar conta grátis em https://fal.ai)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

// ---------------------------------------------------------------------------
// Prompt (igual para todas as APIs)
// ---------------------------------------------------------------------------

const PROMPT = `Generate a photorealistic photo of this SAME person after a hair transplant. The transformation must be DRAMATIC and clearly visible:

- Paint thick hair on ALL the bare forehead skin. The new hairline must sit VERY LOW — only 2-3 finger widths above the eyebrows. The forehead must look dramatically smaller.
- Both temple corners (the "M" shape recession) must be COMPLETELY filled with thick hair — zero bare skin at the temples.
- Every area where scalp is visible must be covered with dense hair.
- Keep the exact same face, skin, expression, ears, beard, clothing, background, hair color, and hair length.

Output one photorealistic frontal photo.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImageAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function saveBase64Image(base64Data: string, outputPath: string) {
  // Handle both data URL and raw base64
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  fs.writeFileSync(outputPath, Buffer.from(raw, 'base64'));
  console.log(`  ✅ Salvo: ${outputPath}`);
}

async function downloadImage(url: string, outputPath: string) {
  const resp = await fetch(url);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ✅ Salvo: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Test 1: Google Gemini 2.5 Flash Image
// ---------------------------------------------------------------------------

async function testGemini(base64DataUrl: string): Promise<void> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.log('  ⏭️  Pulando Gemini (API_KEY não definida)');
    return;
  }

  console.log('\n🔵 Testando Gemini 2.5 Flash Image...');
  const start = Date.now();

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const imageData = base64DataUrl.split(',')[1];
  const mimeType = base64DataUrl.split(';')[0].split(':')[1];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data: imageData, mimeType } },
        { text: PROMPT },
      ],
    },
    config: {
      responseModalities: ['IMAGE'],
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      saveBase64Image(part.inlineData.data, path.join(RESULTS_DIR, 'gemini-frontal.png'));
      console.log(`  ⏱️  Tempo: ${elapsed}s | 💰 Custo estimado: ~$0.003`);
      return;
    }
  }

  console.log('  ❌ Nenhuma imagem na resposta do Gemini');
}

// ---------------------------------------------------------------------------
// Test 2: OpenAI GPT Image 1 (via images.edit)
// ---------------------------------------------------------------------------

async function testOpenAI(base64DataUrl: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('  ⏭️  Pulando OpenAI (OPENAI_API_KEY não definida)');
    return;
  }

  console.log('\n🟢 Testando OpenAI GPT Image 1 (images.edit)...');
  const start = Date.now();

  const { default: OpenAI, toFile } = await import('openai');
  const client = new OpenAI({ apiKey });

  // Extract raw base64 from data URL and convert to buffer
  const raw = base64DataUrl.split(',')[1];
  const buffer = Buffer.from(raw, 'base64');

  // Convert buffer to a File-like object the SDK accepts
  const imageFile = await toFile(buffer, 'input.png', { type: 'image/png' });

  const response = await client.images.edit({
    model: 'gpt-image-1',
    image: imageFile,
    prompt: PROMPT,
    size: '1024x1024',
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (response.data?.[0]?.b64_json) {
    saveBase64Image(response.data[0].b64_json, path.join(RESULTS_DIR, 'openai-frontal.png'));
    console.log(`  ⏱️  Tempo: ${elapsed}s | 💰 Custo estimado: ~$0.034 (medium)`);
  } else if (response.data?.[0]?.url) {
    await downloadImage(response.data[0].url, path.join(RESULTS_DIR, 'openai-frontal.png'));
    console.log(`  ⏱️  Tempo: ${elapsed}s | 💰 Custo estimado: ~$0.034 (medium)`);
  } else {
    console.log('  ❌ Nenhuma imagem na resposta da OpenAI');
    console.log('  Debug:', JSON.stringify(response.data, null, 2).slice(0, 500));
  }
}

// ---------------------------------------------------------------------------
// Test 3: fal.ai FLUX Kontext [Pro]
// ---------------------------------------------------------------------------

async function testFluxKontext(base64DataUrl: string): Promise<void> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.log('  ⏭️  Pulando FLUX Kontext (FAL_KEY não definida)');
    return;
  }

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: apiKey });

  // Try dev endpoint first, then pro if forbidden
  const endpoints = [
    { id: 'fal-ai/flux-kontext/dev', label: 'dev', cost: '~$0.025' },
    { id: 'fal-ai/flux-pro/kontext', label: 'pro', cost: '~$0.055' },
  ];

  for (const ep of endpoints) {
    console.log(`\n🟣 Testando FLUX Kontext [${ep.label}] via fal.ai...`);
    const start = Date.now();

    try {
      // FLUX Kontext aceita image_url como data URL (base64) ou HTTP URL
      const result = await fal.subscribe(ep.id, {
        input: {
          prompt: PROMPT,
          image_url: base64DataUrl,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs?.map((log: any) => log.message).forEach((m: string) => console.log(`  📝 ${m}`));
          }
        },
      }) as any;

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      // fal.ai may return images at result.images or result.data.images
      const images = result?.images || result?.data?.images;
      if (images?.[0]?.url) {
        await downloadImage(images[0].url, path.join(RESULTS_DIR, `flux-${ep.label}-frontal.png`));
        console.log(`  ⏱️  Tempo: ${elapsed}s | 💰 Custo estimado: ${ep.cost}`);
        return; // Success — stop trying other endpoints
      } else {
        console.log('  ❌ Nenhuma imagem na resposta do FLUX');
        console.log('  Debug:', JSON.stringify(result, null, 2).slice(0, 500));
      }
    } catch (err: any) {
      console.log(`  ⚠️  FLUX [${ep.label}] falhou: ${err.message}`);
      console.log('  Tentando próximo endpoint...');
    }
  }

  console.log('  ❌ Todos os endpoints FLUX falharam');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse args
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Uso: npx tsx scripts/test-apis.ts <caminho-da-foto-frontal>');
    console.error('Exemplo: npx tsx scripts/test-apis.ts ~/fotos/paciente-frontal.jpg');
    process.exit(1);
  }

  const absolutePath = path.resolve(inputPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Arquivo não encontrado: ${absolutePath}`);
    process.exit(1);
  }

  // Ensure results dir exists
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTE COMPARATIVO DE APIs — Simulação Capilar');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📸 Foto input: ${absolutePath}`);
  console.log(`📁 Resultados: ${RESULTS_DIR}/`);

  // Load image
  const base64DataUrl = loadImageAsBase64(absolutePath);
  console.log(`📐 Imagem carregada (${(base64DataUrl.length / 1024 / 1024).toFixed(1)}MB base64)`);

  // Check which APIs are available
  const apis = {
    'Gemini': !!process.env.API_KEY,
    'OpenAI': !!process.env.OPENAI_API_KEY,
    'FLUX':   !!process.env.FAL_KEY,
  };
  console.log('\n🔑 APIs disponíveis:');
  for (const [name, available] of Object.entries(apis)) {
    console.log(`  ${available ? '✅' : '❌'} ${name}`);
  }

  // Run tests
  try { await testGemini(base64DataUrl); } catch (e: any) {
    console.log(`  ❌ Gemini erro: ${e.message}`);
  }
  try { await testOpenAI(base64DataUrl); } catch (e: any) {
    console.log(`  ❌ OpenAI erro: ${e.message}`);
  }
  try { await testFluxKontext(base64DataUrl); } catch (e: any) {
    console.log(`  ❌ FLUX Kontext erro: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TESTE COMPLETO — Compare as imagens em:');
  console.log(`  ${RESULTS_DIR}/`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
