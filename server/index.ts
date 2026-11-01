/**
 * Process entry: `npm run dev` (Vite middleware) or `npm start` (built client). OWNER: lead.
 */
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config';
import { createApp, attachRealtime } from './app';
import { LiveSession } from './session';
import { createOpenAIAdapter } from './openai';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const config = loadConfig();
  const openai = createOpenAIAdapter(config.openai);
  const session = new LiveSession({
    initialApiStatus: openai.initialStatus(),
    publicBaseUrl: config.publicBaseUrl,
  });

  const app = createApp({ session, openai });
  const server = http.createServer(app);
  attachRealtime(server, session);

  if (config.isProduction) {
    const clientDir = path.join(root, 'dist', 'client');
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root,
      appType: 'spa',
      server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
  }

  server.listen(config.port, config.host, () => {
    const local = `http://localhost:${config.port}`;
    console.log(`\n  Living Paper ${config.isProduction ? '(production)' : '(dev)'}`);
    console.log(`  Host screen:  ${local}/`);
    console.log(`  Guest page:   ${(config.publicBaseUrl ?? local) + '/join'}`);
    console.log(`  OpenAI key:   ${config.openai.apiKey ? 'configured' : 'not configured (example mode)'}`);
    if (!config.publicBaseUrl) {
      console.log('  Tip: set PUBLIC_BASE_URL so audience phones get a reachable QR link.');
    }
  });

  const shutdown = () => {
    session.dispose();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start Living Paper:', (err as Error).message);
  process.exit(1);
});
