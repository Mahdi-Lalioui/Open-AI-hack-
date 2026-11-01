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

const IMAGE_TYPES: ImageMime[] = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const NOT_CONFIGURED_VISION =
  'Image analysis needs an OPENAI_API_KEY. The app is in example mode: use the built-in example sketch or edit the steps by hand.';
const NOT_CONFIGURED_IMAGE = 'Generating Bean needs an OPENAI_API_KEY. The app is in example mode: the default Bean is shown.';

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
  let beanImage: { png: Buffer; version: number; model: string } | null = null;
  let imageVersion = 0;

  const setStatus = (kind: ApiKind, state: 'waiting' | 'live' | 'unavailable', message: string) =>
    session.setApiStatus(kind, { state, message, model: openai.models[kind], updatedAt: Date.now() });

  // -------------------------------------------------------------------------
  // POST /api/vision/analyze — raw image body
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
      visionBusy = true;
      setStatus('vision', 'waiting', 'Reading the sketch…');
      try {
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
  // POST /api/bean/ask — one decision, applied only by app code under clear rules
  // -------------------------------------------------------------------------
  router.post('/bean/ask', async (_req: Request, res: Response) => {
    const start = session.getState();
    if (start.bean.thinking || askBusy) {
      sendError(res, 409, 'busy', 'Bean is already thinking. Wait for the answer.');
      return;
    }
    const epoch = start.sim.epoch;
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
        setStatus('decisions', 'waiting', 'Asking Bean…');
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
        notAppliedReason = 'The session was reset while Bean was thinking — nothing was changed.';
      } else if (action === 'call_backup') {
        if (!now.bean.aiManagement) {
          notAppliedReason = 'AI management is off — use Add worker to act on it.';
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

  // -------------------------------------------------------------------------
  // POST /api/bean/image — generate once on request; GET serves cached bytes
  // -------------------------------------------------------------------------
  router.post('/bean/image', async (_req: Request, res: Response) => {
    if (!openai.configured) {
      sendError(res, 503, 'not_configured', NOT_CONFIGURED_IMAGE);
      return;
    }
    if (imageBusy || session.getState().bean.image.status === 'loading') {
      sendError(res, 409, 'busy', 'Bean is already being drawn. Wait for it to finish.');
      return;
    }
    if (beanImage) {
      const image: BeanImageState = { status: 'ready', url: `/api/bean/image.png?v=${beanImage.version}`, model: beanImage.model };
      if (session.getState().bean.image.status !== 'ready') session.setBeanImage(image);
      res.json({ ok: true, image });
      return;
    }

    imageBusy = true;
    const model = openai.models.image;
    session.setBeanImage({ status: 'loading', model });
    setStatus('image', 'waiting', 'Drawing Bean…');
    try {
      const result = await openai.generateBeanImage();
      imageVersion += 1;
      beanImage = { png: result.png, version: imageVersion, model: result.model };
      const image: BeanImageState = { status: 'ready', url: `/api/bean/image.png?v=${imageVersion}`, model: result.model };
      session.setBeanImage(image);
      setStatus('image', 'live', 'Bean image generated.');
      res.json({ ok: true, image });
    } catch (err) {
      const message = errorMessage(err);
      session.setBeanImage({ status: 'error', error: message, model });
      setStatus('image', 'unavailable', message);
      sendOpenAIError(res, err);
    } finally {
      imageBusy = false;
    }
  });

  router.get('/bean/image.png', (_req: Request, res: Response) => {
    if (!beanImage) {
      sendError(res, 404, 'not_found', 'No Bean image has been generated yet.');
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.type('image/png').send(beanImage.png);
  });

  return router;
}
