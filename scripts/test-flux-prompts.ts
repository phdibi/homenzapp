/**
 * Teste de variações de prompt no FLUX Kontext Pro
 *
 * Envia a MESMA foto com PROMPTS DIFERENTES para comparar
 * qual preserva melhor a identidade facial enquanto faz a transformação capilar.
 *
 * Uso:
 *   FAL_KEY=xxx npx tsx scripts/test-flux-prompts.ts scripts/paciente-frontal.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results', 'prompt-tests-r2');

// ---------------------------------------------------------------------------
// Prompt variations — each focuses on different strategy
// ---------------------------------------------------------------------------

const PROMPTS: Record<string, string> = {

  // R2-A: Hybrid V2+V5 — minimal style com hairline agressiva + preservar cor
  'r2a-hybrid-aggressive': `Add much more hair to this person. The hairline must come down VERY LOW — almost touching the eyebrows, with only a small forehead visible. Fill both temple corners completely. Thick dense coverage everywhere on top. Keep the same light brown hair color, same face, same everything else.`,

  // R2-B: Action-first com cor explícita — baseado em V6 mas sem "dark"
  'r2b-action-samecolor': `Paint thick hair on this man's forehead skin and temple areas. Bring the hairline very far down, leave only 4cm of forehead visible. Fill both temple recessions completely with hair. The new hair must match his existing light brown/blonde hair color exactly. Same face, same person, only hair added.`,

  // R2-C: Proportion-based — falar em proporções do rosto
  'r2c-proportions': `Add hair to this person so the forehead shrinks from 40% to 20% of the face height. The hairline must sit very low. Both temple corners filled completely. Dense thick coverage. Keep his natural light brown hair color. Same face, same person, same photo — only the hair coverage changes.`,

  // R2-D: Two-step mental model — "imagine then edit"
  'r2d-imagine-edit': `Imagine this man never lost any hair. His hairline is naturally low and straight, sitting just 3 finger-widths above the eyebrows. Both temples have full hair coverage with no recession. The top of his head is completely covered with dense hair. Now show me that version — same man, same light brown hair color, same face, same beard, same clothes, same background.`,

  // R2-E: Ultra-minimal + agressivo — o mais curto possível com máxima mudança
  'r2e-ultra-minimal': `Give this man a very full head of hair with a very low straight hairline, no temple recession, dense coverage. Same hair color, same face.`,

  // R2-F: Spatial directions — linguagem espacial explícita
  'r2f-spatial': `Add hair to cover the top 40% of this man's forehead. Starting from his current hairline, extend hair downward toward the eyebrows by about 3-4 centimeters. Fill in the bare triangular areas at both temples with matching hair. Add density to thin areas on top. Hair color must stay the same light brown. Face and everything else stays identical.`,

};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImageAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function downloadImage(url: string, outputPath: string) {
  const resp = await fetch(url);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ✅ Salvo: ${path.basename(outputPath)}`);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function testPrompt(
  fal: any,
  base64DataUrl: string,
  promptName: string,
  promptText: string,
): Promise<void> {
  console.log(`\n🟣 [${promptName}]`);
  console.log(`   Prompt: "${promptText.slice(0, 80)}..."`);

  const start = Date.now();

  const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
    input: {
      prompt: promptText,
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
  const images = result?.images || result?.data?.images;

  if (images?.[0]?.url) {
    await downloadImage(images[0].url, path.join(RESULTS_DIR, `${promptName}.jpg`));
    console.log(`  ⏱️  ${elapsed}s | ~$0.055`);
  } else {
    console.log(`  ❌ Sem imagem. Debug: ${JSON.stringify(result, null, 2).slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Uso: FAL_KEY=xxx npx tsx scripts/test-flux-prompts.ts <foto>');
    process.exit(1);
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.error('FAL_KEY não definida');
    process.exit(1);
  }

  const absolutePath = path.resolve(inputPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Arquivo não encontrado: ${absolutePath}`);
    process.exit(1);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTE DE PROMPTS — FLUX Kontext Pro');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📸 Input: ${absolutePath}`);
  console.log(`📁 Resultados: ${RESULTS_DIR}/`);
  console.log(`📝 ${Object.keys(PROMPTS).length} variações de prompt`);

  const base64DataUrl = loadImageAsBase64(absolutePath);
  console.log(`📐 Imagem: ${(base64DataUrl.length / 1024 / 1024).toFixed(1)}MB base64`);

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: apiKey });

  // Run tests sequentially to avoid rate limiting
  for (const [name, prompt] of Object.entries(PROMPTS)) {
    try {
      await testPrompt(fal, base64DataUrl, name, prompt);
    } catch (err: any) {
      console.log(`  ❌ [${name}] Erro: ${err.message}`);
    }
  }

  const totalCost = Object.keys(PROMPTS).length * 0.055;
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  TESTE COMPLETO — ${Object.keys(PROMPTS).length} imagens geradas`);
  console.log(`  💰 Custo total estimado: ~$${totalCost.toFixed(2)}`);
  console.log(`  📁 ${RESULTS_DIR}/`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
