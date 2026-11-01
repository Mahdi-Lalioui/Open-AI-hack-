/**
 * Express app + Socket.IO wiring. OWNER: lead.
 * createApp() has no side effects (no listen) so tests can use supertest.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { SOCKET_EVENTS } from '../shared/types';
import type { LiveSessionApi } from './types';
import { createSimRouter } from './routes/sim';
import { createAiRouter } from './routes/ai';
import { createDesignRouter } from './routes/design';
import type { OpenAIAdapter } from './openai';
import { NOT_CONFIGURED_DESIGN_AI, type DesignAi } from './openai/design';

export interface AppDeps {
  session: LiveSessionApi;
  openai: OpenAIAdapter;
  designAi?: DesignAi;
  /** False where there is no long-running server for the shared live test. */
  liveTest?: boolean;
}

export function createApp({ session, openai, designAi = NOT_CONFIGURED_DESIGN_AI, liveTest = true }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a tunnel/reverse proxy the client IP comes from X-Forwarded-For (used for rate limiting).
  app.set('trust proxy', true);

  // Before the 64 kB JSON limit below: design requests can carry a sketch.
  app.use('/api/design', createDesignRouter(designAi, { liveTest }));

  app.use('/api', express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/state', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(session.getState());
  });

  app.use('/api', createSimRouter(session));
  app.use('/api', createAiRouter(session, openai));

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found', code: 'not_found' });
  });

  // JSON errors, never echoing internals or secrets.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ ok: false, error: 'Upload is too large.', code: 'too_large' });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ ok: false, error: 'Request body is not valid JSON.', code: 'invalid_input' });
      return;
    }
    console.error(`[api] ${req.method} ${req.path} failed:`, (err as Error)?.message ?? err);
    res.status(500).json({ ok: false, error: 'Something went wrong on the server.', code: 'server_error' });
  });

  return app;
}

/** One broadcast per change; every new/reconnected client gets the full state immediately. */
export function attachRealtime(httpServer: HttpServer, session: LiveSessionApi) {
  const io = new IOServer(httpServer, {
    serveClient: false,
    cors: { origin: true },
    destroyUpgrade: false,
  });
  io.on('connection', (socket) => {
    socket.emit(SOCKET_EVENTS.state, session.getState());
  });
  const unsubscribe = session.subscribe((state) => {
    io.emit(SOCKET_EVENTS.state, state);
  });
  return {
    io,
    close: () => {
      unsubscribe();
      io.close();
    },
  };
}
