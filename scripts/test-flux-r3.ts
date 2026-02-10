/**
 * Round 3: Teste focado em preservação de cor/barba + agressividade por ângulo
 *
 * Problemas da R2-A no deploy:
 * - Frontal/Lat.Esq: cabelo escureceu, barba mudou
 * - Lat.Dir: sem alteração
 * - Vista Superior: PIOROU
 *
 * Estratégias:
 * - Enfatizar "do NOT change hair color" e "do NOT change beard"
 *   MAS como frase curta inline (não bloco restritivo)
 * - Especificar a cor exata do cabelo ("light brown/dirty blonde")
 * - Prompts mais agressivos para lateral_right e top
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results', 'r3-angle-tests');

const PROMPTS: Record<string, string> = {

  // FRONTAL — R2-A base + preservar cor explícita + proteger barba
  'r3-frontal': `Add much more hair to this person. The hairline must come down VERY LOW — almost touching the eyebrows, with only a small forehead visible. Fill both temple corners completely with thick hair — the M-shape recession must be completely gone. Thick dense coverage everywhere on top, zero scalp visible. IMPORTANT: keep the EXACT same light brown/dirty blonde hair color — do not darken it. Keep the same beard style and color unchanged. Same face, same skin, same everything else.`,

  // FRONTAL v2 — tentar abordagem ainda mais curta com cor explícita
  'r3-frontal-v2': `Give this man a much lower hairline with dense hair coverage. Fill temple corners completely. Hair must stay the exact same light brown/blonde color it already is. Do not change the beard, face, or anything else — only add more hair on top of the head.`,

  // LATERAL ESQUERDO — mesma ideia + "temple triangle"
  'r3-lateral-left': `Add much more hair to this person's left side. Fill the entire temple triangle area with thick hair — zero bare skin visible between the hairline and ear. The hairline must start much further forward. Hair color must stay the exact same light brown/dirty blonde — do not darken it. Do not change the beard or face at all.`,

  // LATERAL DIREITO — muito mais agressivo (estava sem alteração)
  'r3-lateral-right': `This person needs MUCH more hair on the right side of their head. The temple area is currently bare — FILL IT COMPLETELY with thick dense hair matching their existing light brown hair color. The hairline must extend far forward, dramatically reducing the visible forehead from this angle. Cover ALL bare scalp skin above the ear with hair. Do not change the beard, face, or skin at all.`,

  // VISTA SUPERIOR — precisa preencher, não piorar
  'r3-top': `Add MUCH more hair to cover this person's head from above. Fill ALL thin spots and bald areas with thick, dense hair. The hairline must extend much further forward than it currently does. Every gap where scalp skin shows through must be completely covered. The hair must stay the exact same light brown/dirty blonde color. This is a dramatic improvement — the ENTIRE top of the head should be covered in thick hair with zero scalp visible.`,

  // VISTA SUPERIOR v2 — abordagem diferente: "full coverage"
  'r3-top-v2': `Make this person's hair MUCH thicker and denser when seen from above. Fill every bald patch and thin area. Extend the hairline forward by 3-4cm. Complete full coverage with no scalp visible anywhere. Same light brown hair color. Same person.`,

};

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

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Uso: FAL_KEY=xxx npx tsx scripts/test-flux-r3.ts <foto>');
    process.exit(1);
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) { console.error('FAL_KEY não definida'); process.exit(1); }

  const absolutePath = path.resolve(inputPath);
  if (!fs.existsSync(absolutePath)) { console.error(`Arquivo não encontrado: ${absolutePath}`); process.exit(1); }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  ROUND 3 — Ajuste de cor/barba + ângulos');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📸 Input: ${absolutePath}`);
  console.log(`📝 ${Object.keys(PROMPTS).length} variações`);

  const base64DataUrl = loadImageAsBase64(absolutePath);
  console.log(`📐 Imagem: ${(base64DataUrl.length / 1024 / 1024).toFixed(1)}MB`);

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: apiKey });

  for (const [name, prompt] of Object.entries(PROMPTS)) {
    console.log(`\n🟣 [${name}]`);
    console.log(`   "${prompt.slice(0, 70)}..."`);
    const start = Date.now();

    try {
      const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
        input: { prompt, image_url: base64DataUrl },
      }) as any;

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const images = result?.images || result?.data?.images;

      if (images?.[0]?.url) {
        await downloadImage(images[0].url, path.join(RESULTS_DIR, `${name}.jpg`));
        console.log(`  ⏱️  ${elapsed}s`);
      } else {
        console.log(`  ❌ Sem imagem`);
      }
    } catch (err: any) {
      console.log(`  ❌ Erro: ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  COMPLETO — ${RESULTS_DIR}/`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
