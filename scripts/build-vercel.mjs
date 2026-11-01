/**
 * Writes Vercel's Build Output: the built client as static files, and the API bundled into one function.
 * Run through `npm run build:vercel`, after the normal build has produced dist/client.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.vercel', 'output');
const functionDir = path.join(output, 'functions', 'api.func');

await rm(output, { recursive: true, force: true });
await mkdir(functionDir, { recursive: true });
await cp(path.join(root, 'dist', 'client'), path.join(output, 'static'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'vercel.ts')],
  outfile: path.join(functionDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Some dependencies are CommonJS and expect require() to exist.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});

await writeFile(path.join(functionDir, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  maxDuration: 300, // a design checked against a drawing can take a couple of minutes
}, null, 2));

await writeFile(path.join(output, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/api/(.*)', dest: '/api' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2));

console.log('Vercel output written to .vercel/output');
