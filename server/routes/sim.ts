/**
 * REST mutations for the world, the simulation clock, workers, orders and the Bean management
 * switch. Mounted at /api. JSON in/out; errors are `{ ok: false, error, code }`.
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AddOrderInput, ApiError, BuildWorldInput } from '../../shared/types';
import { SIM_SPEEDS } from '../../shared/types';
import type { LiveSessionApi } from '../types';
import { STALE_EPOCH_REASON, WorldValidationError, isValidSpeed, type LiveSession } from '../session';

const speedSchema = z.object({
  speed: z.number().refine(isValidSpeed, { message: `Speed must be one of ${SIM_SPEEDS.join(', ')}.` }),
});

const managementSchema = z.object({ enabled: z.boolean() });

const addWorkerSchema = z.object({ expectedEpoch: z.number().int().min(0).optional() }).passthrough();

function sendError(res: Response, status: number, code: string, error: string) {
  const body: ApiError = { ok: false, error, code };
  res.status(status).json(body);
}

const ORDER_ERROR_STATUS: Record<string, number> = {
  invalid_input: 400,
  rate_limited: 429,
  queue_full: 409,
};

const INTERACTION_ERROR_STATUS: Record<string, number> = { invalid_input: 400, rate_limited: 429, no_creation: 409, wrong_mode: 409 };

/** Creation methods are not on the lead-owned LiveSessionApi contract; they live on LiveSession. */
type CreationSession = LiveSessionApi & Pick<LiveSession, 'buildCreation' | 'interact'>;

export function createSimRouter(session: LiveSessionApi): Router {
  // app.ts types the session as LiveSessionApi; the real LiveSession also has creation methods.
  const creations = session as Partial<CreationSession>;
  const router = Router();

  router.post('/world', (req, res, next) => {
    try {
      const world = session.buildWorld((req.body ?? {}) as BuildWorldInput);
      res.json({ ok: true, world });
    } catch (err) {
      if (err instanceof WorldValidationError) {
        sendError(res, 400, 'invalid_graph', err.message || 'This drawing cannot be built yet.');
        return;
      }
      next(err);
    }
  });

  router.post('/sim/start', (_req, res) => {
    session.start();
    res.json({ ok: true });
  });

  router.post('/sim/pause', (_req, res) => {
    session.pause();
    res.json({ ok: true });
  });

  router.post('/sim/reset', (_req, res) => {
    session.reset();
    res.json({ ok: true });
  });

  router.post('/sim/speed', (req, res) => {
    const parsed = speedSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, 'invalid_input', `Speed must be one of ${SIM_SPEEDS.join(', ')}.`);
      return;
    }
    session.setSpeed(parsed.data.speed);
    res.json({ ok: true });
  });

  router.post('/workers', (req, res) => {
    const parsed = addWorkerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, 'invalid_input', 'expectedEpoch must be a whole number.');
      return;
    }
    const result = session.addWorker('manual', { expectedEpoch: parsed.data.expectedEpoch });
    if (!result.ok) {
      const code = result.reason === STALE_EPOCH_REASON ? 'stale_epoch' : 'worker_cap';
      sendError(res, 409, code, result.reason);
      return;
    }
    res.json({ ok: true, worker: result.worker });
  });

  router.post('/orders', (req, res) => {
    const result = session.addOrder((req.body ?? {}) as AddOrderInput, { ip: req.ip });
    if (!result.ok) {
      const status = ORDER_ERROR_STATUS[result.code] ?? 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  router.post('/bean/management', (req, res) => {
    const parsed = managementSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, 'invalid_input', 'enabled must be true or false.');
      return;
    }
    session.setAiManagement(parsed.data.enabled);
    res.json({ ok: true });
  });

  router.post('/creation', (req, res, next) => {
    try {
      if (!creations.buildCreation) return sendError(res, 501, 'not_supported', 'Creations are not supported.');
      const creation = creations.buildCreation(req.body ?? {});
      res.json({ ok: true, creation });
    } catch (err) {
      if (err instanceof WorldValidationError) {
        sendError(res, 400, 'invalid_creation', err.message || 'This creation cannot be built.');
        return;
      }
      next(err);
    }
  });

  router.post('/interactions', (req, res) => {
    if (!creations.interact) return sendError(res, 501, 'not_supported', 'Creations are not supported.');
    const result = creations.interact(req.body ?? {}, { ip: req.ip });
    if (!result.ok) {
      const status = INTERACTION_ERROR_STATUS[result.code] ?? 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}
