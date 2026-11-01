/**
 * `npm run smoke:live`, real calls against OpenAI, only when a key is configured.
 * Prints PASS/FAIL per integration with error codes. Never prints the key.
 * Image generation runs only with --image (slow, billed).
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config';
import { OpenAIError, createOpenAIAdapter } from '../server/openai';
import { DEFAULT_PET } from '../shared/creations';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function check(name: string, fn: () => Promise<string>): Promise<boolean> {
  const t = Date.now();
  try {
    const info = await fn();
    console.log(`PASS ${name} (${Date.now() - t} ms) ${info}`);
    return true;
  } catch (err) {
    const code = err instanceof OpenAIError ? err.code : 'unexpected';
    const msg = err instanceof OpenAIError ? err.message : 'unexpected error';
    console.log(`FAIL ${name} [${code}] ${msg}`);
    return false;
  }
}

async function main() {
  const config = loadConfig();
  if (!config.openai.apiKey) {
    console.log('not verified: credentials/access unavailable');
    return;
  }
  const ai = createOpenAIAdapter(config.openai);
  const results: boolean[] = [];
  const pet = await readFile(path.join(root, 'public', 'example-pet.png'));
  const circuit = await readFile(path.join(root, 'public', 'example-circuit.png'));

  results.push(
    await check(`vision pet (${ai.models.vision})`, async () => {
      const c = await ai.analyzeCreation(pet, 'image/png', 'pet');
      return `inScope=${c.inScope} pet=${JSON.stringify(c.pet)}`;
    }),
  );
  results.push(
    await check(`vision circuit (${ai.models.vision})`, async () => {
      const c = await ai.analyzeCreation(circuit, 'image/png', 'circuit');
      return `inScope=${c.inScope} parts=${c.circuit?.components.map((x) => `${x.type}:${x.value}`).join(',')}`;
    }),
  );
  results.push(
    await check(`decisions pet (${ai.models.decisions})`, async () => {
      const d = await ai.decidePet({
        name: 'Pixel', hunger: 72, happiness: 55, energy: 60, currentAction: 'idle',
        recentInteractions: { feed: 0, pet: 3, play: 1 }, lastGuest: 'Sam',
      });
      return `action=${d.action}, ${d.explanation}`;
    }),
  );
  if (process.argv.includes('--image')) {
    results.push(
      await check(`image (${ai.models.image})`, async () => {
        const r = await ai.generatePetImage(DEFAULT_PET);
        return `${r.png.length} bytes PNG`;
      }),
    );
  } else {
    console.log('SKIP image (pass --image to generate one billed image)');
  }
  process.exitCode = results.every(Boolean) ? 0 : 1;
}

main().catch(() => {
  console.log('FAIL smoke script crashed');
  process.exitCode = 1;
});
