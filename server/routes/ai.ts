/**
 * AI routes (mounted at /api): sketch reading, Ask Bean, Bean image.
 * Every failure answers { ok:false, error, code } with a human-readable, secret-free message.
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { ApiError, ApiKind, BeanActionSource, BeanDecision, BeanImageState } from '../../shared/types';
import type { LiveSessionApi } from '../types';
import type { ImageMime, OpenAIAdapter } from '../openai';
import { OpenAIError } from '../openai';
import { NOTHING_TO_DECIDE, exampleDecision, hasDecisionToMake, queueFactsFromState } from '../beanRules';
import { examplePetDecision, petFacts } from '../beanRules';
import { DEFAULT_PET } from '../../shared/creations';
import type { PetActionName, PetSpec, SketchMode } from '../../shared/creations';

/** Backend adds setPetAction to the session; called defensively so this compiles before/after. */
type PetActionSetter = { setPetAction?: (action: PetActionName, by?: string | null) => unknown };
function applyPetAction(session: LiveSessionApi, action: PetActionName): { ok: boolean; reason?: string } {
  const fn = (session as unknown as PetActionSetter).setPetAction;
  if (typeof fn !== 'function') return { ok: false, reason: 'This server cannot animate the pet yet.' };
  const r = fn.call(session, action, null) as { ok?: boolean; reason?: string } | void;
  if (r && typeof r === 'object' && r.ok === false) return { ok: false, reason: r.reason ?? 'Not applied.' };
  return { ok: true };
}

const IMAGE_TYPES: ImageMime[] = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const NOT_CONFIGURED_VISION =
  'Reading an image needs an OPENAI_API_KEY on the server, so for now you can start from a built-in example instead.';
const NOT_CONFIGURED_IMAGE = 'Drawing a portrait needs an OPENAI_API_KEY on the server.';

function sendError(res: Response, status: number, code: string, error: string) {
  const body: ApiError = { ok: false, error, code };
  res.status(status).json(body);
}

function sendOpenAIError(res: Response, err: unknown) {
  if (err instanceof OpenAIError) {
    sendError(res, err.httpStatus, err.code, err.message);
    return;
  }
  sendError(res, 500, 'server_error', 'Something went wrong on the server.');
}

function errorMessage(err: unknown): string {
  return err instanceof OpenAIError ? err.message : 'Unexpected server error.';
}

/** Detects the real image type from magic bytes. */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function contentType(req: Request): string {
  return String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function createAiRouter(session: LiveSessionApi, openai: OpenAIAdapter): Router {
  const router = Router();
  const rawImage = express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES });

  let visionBusy = false;
  let imageBusy = false;
  /** Local guard as well: reset() clears bean.thinking while an earlier call may still be in flight. */
  let askBusy = false;
  /** Bean image bytes are kept in memory for the life of the server process. */
  let beanImage: { png: Buffer; version: number; model: string; key: string } | null = null;
  const imageKey = () => { const c = session.getState().creation; return c?.mode === 'pet' ? JSON.stringify(c.pet ?? DEFAULT_PET) : 'bean'; };
  let imageVersion = 0;

  const setStatus = (kind: ApiKind, state: 'waiting' | 'live' | 'unavailable', message: string) =>
    session.setApiStatus(kind, { state, message, model: openai.models[kind], updatedAt: Date.now() });

  // -------------------------------------------------------------------------
  // POST /api/vision/analyze, raw image body
  // -------------------------------------------------------------------------
  router.post(
    '/vision/analyze',
    (req: Request, res: Response, next: NextFunction) => {
      if (!(IMAGE_TYPES as string[]).includes(contentType(req))) {
        sendError(res, 415, 'unsupported_image', 'Upload a PNG, JPEG or WebP image.');
        return;
      }
      rawImage(req, res, (err?: unknown) => {
        if (err) {
          const e = err as { type?: string; status?: number };
          if (e.type === 'entity.too.large' || e.status === 413) {
            sendError(res, 413, 'too_large', 'Image is larger than 8 MB. Use a smaller photo.');
          } else {
            sendError(res, 400, 'invalid_image', 'Could not read the uploaded image.');
          }
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        sendError(res, 400, 'empty_image', 'The upload was empty. Choose a photo of the sketch.');
        return;
      }
      if (body.length > MAX_IMAGE_BYTES) {
        sendError(res, 413, 'too_large', 'Image is larger than 8 MB. Use a smaller photo.');
        return;
      }
      const mime = sniffImage(body);
      if (!mime) {
        sendError(res, 400, 'invalid_image', 'The file is not a valid PNG, JPEG or WebP image.');
        return;
      }
      if (!openai.configured) {
        sendError(res, 503, 'not_configured', NOT_CONFIGURED_VISION);
        return;
      }
      if (visionBusy) {
        sendError(res, 409, 'busy', 'A sketch is already being read. Wait for it to finish.');
        return;
      }
      const modeQ = typeof req.query.mode === 'string' ? req.query.mode : undefined;
      if (modeQ !== undefined && modeQ !== 'pet' && modeQ !== 'circuit') {
        sendError(res, 400, 'invalid_input', 'mode must be "pet" or "circuit".');
        return;
      }
      const mode = modeQ as SketchMode | undefined;
      visionBusy = true;
      setStatus('vision', 'waiting', 'Reading the sketch…');
      try {
        if (mode) {
          const creation = await openai.analyzeCreation(body, mime, mode);
          setStatus('vision', 'live', 'Last sketch read succeeded.');
          res.json({ ok: true, creation, model: openai.models.vision });
          return;
        }
        const sketch = await openai.analyzeSketch(body, mime);
        setStatus('vision', 'live', 'Last sketch read succeeded.');
        res.json({ ok: true, sketch, model: openai.models.vision });
      } catch (err) {
        setStatus('vision', 'unavailable', errorMessage(err));
        sendOpenAIError(res, err);
      } finally {
        visionBusy = false;
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/bean/ask, one decision, applied only by app code under clear rules
  // -------------------------------------------------------------------------
  router.post('/bean/ask', async (_req: Request, res: Response) => {
    const start = session.getState();
    if (start.bean.thinking || askBusy) {
      sendError(res, 409, 'busy', 'It is still thinking, so wait for that answer first.');
      return;
    }
    const epoch = start.sim.epoch;
    if (start.creation?.mode === 'pet' && start.pet) {
      await askPet(res, start.creation.pet ?? DEFAULT_PET, epoch);
      return;
    }
    const facts = queueFactsFromState(start);
    if (!hasDecisionToMake(facts)) {
      sendError(res, 409, 'nothing_to_decide', NOTHING_TO_DECIDE);
      return;
    }

    askBusy = true;
    session.setBeanThinking(true);
    try {
      let action: BeanDecision['action'];
      let explanation: string;
      let source: BeanActionSource;
      let model: string | undefined;

      if (!openai.configured) {
        const rule = exampleDecision(facts);
        action = rule.action;
        explanation = rule.explanation;
        source = 'example';
      } else {
        setStatus('decisions', 'waiting', 'Asking the pet…');
        try {
          const ai = await openai.decide(facts);
          action = ai.action;
          explanation = ai.explanation;
          model = ai.model;
          source = 'ai';
          setStatus('decisions', 'live', 'Last decision succeeded.');
          session.setBeanError(null);
        } catch (err) {
          // Never fall back to a fake AI answer: report the failure honestly.
          const message = errorMessage(err);
          setStatus('decisions', 'unavailable', message);
          session.setBeanError(message);
          sendOpenAIError(res, err);
          return;
        }
      }

      // Re-check the live state after the await: a reset or a manual worker may have happened.
      const now = session.getState();
      let applied = false;
      let notAppliedReason: string | undefined;
      if (now.sim.epoch !== epoch) {
        notAppliedReason = 'The session was reset while it was thinking, so nothing was changed.';
      } else if (action === 'call_backup') {
        if (!now.bean.aiManagement) {
          notAppliedReason = 'AI management is off, so use Add worker to act on it.';
        } else {
          const added = session.addWorker(source === 'ai' ? 'ai' : 'example', { expectedEpoch: epoch });
          if (added.ok) applied = true;
          else notAppliedReason = added.reason;
        }
      }

      const decision: BeanDecision = {
        action,
        source,
        explanation,
        applied,
        ...(notAppliedReason ? { notAppliedReason } : {}),
        simTime: facts.simTimeSec,
        wallTime: Date.now(),
        epoch,
        ...(model ? { model } : {}),
      };
      session.recordBeanDecision(decision);
      res.json({ ok: true, decision });
    } catch (err) {
      sendOpenAIError(res, err);
    } finally {
      askBusy = false;
      session.setBeanThinking(false);
    }
  });

  /** "Ask the pet": choose among allowed actions; app code applies it via session.setPetAction. */
  async function askPet(res: Response, spec: PetSpec, epoch: number) {
    const st = session.getState();
    if (!st.pet) return sendError(res, 409, 'no_pet', 'Build a pet first.');
    const facts = petFacts(st.pet, spec);
    const version = st.creation?.version;
    const isCurrentPet = () => {
      const now = session.getState();
      return now.sim.epoch === epoch && now.creation?.mode === 'pet' && now.creation.version === version;
    };
    askBusy = true;
    session.setBeanThinking(true);
    try {
      let action: PetActionName;
      let explanation: string;
      let source: BeanActionSource;
      let model: string | undefined;
      if (!openai.configured) {
        ({ action, explanation } = examplePetDecision(facts));
        source = 'example';
      } else {
        setStatus('decisions', 'waiting', 'Asking the pet…');
        try {
          const ai = await openai.decidePet(facts);
          ({ action, explanation, model } = ai);
          source = 'ai';
          setStatus('decisions', 'live', 'Last decision succeeded.');
          if (isCurrentPet()) session.setBeanError(null);
        } catch (err) {
          const message = errorMessage(err);
          setStatus('decisions', 'unavailable', message);
          if (isCurrentPet()) session.setBeanError(message);
          return sendOpenAIError(res, err);
        }
      }
      const now = session.getState();
      let applied = false;
      let notAppliedReason: string | undefined;
      if (now.sim.epoch !== epoch || now.creation?.mode !== 'pet' || now.creation.version !== version) {
        notAppliedReason = 'The pet was rebuilt or reset while it was thinking, so nothing was changed.';
      } else {
        const r = applyPetAction(session, action);
        applied = r.ok;
        notAppliedReason = r.reason;
      }
      const decision = {
        action,
        source,
        explanation,
        applied,
        ...(notAppliedReason ? { notAppliedReason } : {}),
        simTime: now.sim.time,
        wallTime: Date.now(),
        epoch,
        ...(model ? { model } : {}),
      };
      if (isCurrentPet()) session.recordBeanDecision(decision);
      res.json({ ok: true, decision });
    } catch (err) {
      sendOpenAIError(res, err);
    } finally {
      askBusy = false;
      session.setBeanThinking(false);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/bean/image, generate once on request; GET serves cached bytes
  // -------------------------------------------------------------------------
  router.post('/bean/image', async (_req: Request, res: Response) => {
    if (!openai.configured) {
      sendError(res, 503, 'not_configured', NOT_CONFIGURED_IMAGE);
      return;
    }
    if (imageBusy || session.getState().bean.image.status === 'loading') {
      sendError(res, 409, 'busy', 'A portrait is already being drawn, so wait for it to finish.');
      return;
    }
    if (beanImage && beanImage.key === imageKey()) {
      const image: BeanImageState = { status: 'ready', url: `/api/bean/image.png?v=${beanImage.version}`, model: beanImage.model };
      if (session.getState().bean.image.status !== 'ready') session.setBeanImage(image);
      res.json({ ok: true, image });
      return;
    }

    imageBusy = true;
    const model = openai.models.image;
    const target = session.getState();
    const targetKey = imageKey();
    const isCurrentTarget = () => {
      const now = session.getState();
      return now.sim.epoch === target.sim.epoch && now.creation?.version === target.creation?.version && imageKey() === targetKey;
    };
    const clearStaleLoading = () => {
      if (session.getState().bean.image.status === 'loading') session.setBeanImage({ status: 'none' });
    };
    session.setBeanImage({ status: 'loading', model });
    setStatus('image', 'waiting', 'Drawing a portrait…');
    try {
      const result =
        target.creation?.mode === 'pet' ? await openai.generatePetImage(target.creation.pet ?? DEFAULT_PET) : await openai.generateBeanImage();
      if (!isCurrentTarget()) {
        clearStaleLoading();
        setStatus('image', 'live', 'Portrait generated for an earlier creation; result discarded.');
        sendError(res, 409, 'stale_creation', 'The creation was rebuilt or reset while its portrait was drawing. Generate a portrait for the current creation.');
        return;
      }
      imageVersion += 1;
      beanImage = { png: result.png, version: imageVersion, model: result.model, key: targetKey };
      const image: BeanImageState = { status: 'ready', url: `/api/bean/image.png?v=${imageVersion}`, model: result.model };
      // Note for UI: this is a 2D portrait/texture of the pet, not a 3D model.
      session.setBeanImage(image);
      setStatus('image', 'live', 'Portrait generated.');
      res.json({ ok: true, image });
    } catch (err) {
      const message = errorMessage(err);
      if (isCurrentTarget()) session.setBeanImage({ status: 'error', error: message, model });
      else clearStaleLoading();
      setStatus('image', 'unavailable', message);
      sendOpenAIError(res, err);
    } finally {
      imageBusy = false;
    }
  });

  router.get('/bean/image.png', (_req: Request, res: Response) => {
    const currentImage = session.getState().bean.image;
    if (!beanImage || beanImage.key !== imageKey() || currentImage.status !== 'ready') {
      sendError(res, 404, 'not_found', 'No portrait has been generated yet.');
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.type('image/png').send(beanImage.png);
  });

  return router;
}
