/**
 * `npm run smoke:design`: real OpenAI calls for the Design Studio, only when a key is configured.
 * Interprets a description, refines it and exports every format. Never prints the key.
 */
import 'dotenv/config';
import { exportDesign, EXPORT_FORMATS, type ExportFormat } from '../shared/blueprint/export';
import { loadConfig } from '../server/config';
import { OpenAIError } from '../server/openai';
import { createDesignAi } from '../server/openai/design';

async function main() {
  const config = loadConfig();
  if (!config.openai.apiKey) {
    console.log('not verified: credentials/access unavailable');
    return;
  }
  const ai = createDesignAi(config.openai);
  let t = Date.now();
  const first = await ai.interpret({ text: 'A wall-mounted key holder for a hallway, with a small shelf for mail and four hooks.' });
  console.log(`PASS interpret (${ai.model}, ${Date.now() - t} ms, repaired=${first.repaired}): "${first.blueprint.name}", ${first.blueprint.components.length} parts, ${JSON.stringify(first.blueprint.dimensions)}`);
  if (first.warnings.length) console.log(`  warnings: ${first.warnings.join(' | ')}`);

  t = Date.now();
  const second = await ai.refine(first.blueprint, 'Make it 50 mm wider and add a fifth hook.');
  console.log(`PASS refine (${Date.now() - t} ms, repaired=${second.repaired}): ${second.blueprint.components.length} parts, ${JSON.stringify(second.blueprint.dimensions)}`);

  for (const format of Object.keys(EXPORT_FORMATS) as ExportFormat[]) {
    const f = exportDesign(second.blueprint, format);
    console.log(`PASS export ${f.filename} (${f.data.length} bytes)`);
  }
}

main().catch((err) => {
  const code = err instanceof OpenAIError ? err.code : 'unexpected';
  console.log(`FAIL [${code}] ${err instanceof OpenAIError ? err.message : (err as Error).message}`);
  process.exitCode = 1;
});
