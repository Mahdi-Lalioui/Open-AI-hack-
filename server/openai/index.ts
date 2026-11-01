/**
 * OpenAI adapter: vision (Responses API), decisions (Decisions API), image (Image API).
 * Plain `fetch`, no SDK. `deps.fetch` is injectable for tests only; the app always uses the global fetch.
 * The API key is only ever placed in the Authorization header and never logged or returned.
 */
import type { ApiStatusMap, BeanActionName, RecognizedSketch } from '../../shared/types';
import type { AppConfig } from '../config';
import type { QueueFacts } from '../beanRules';
import { NOTHING_TO_DECIDE, hasDecisionToMake } from '../beanRules';
import { OpenAIError, notConfiguredError } from './errors';
import { type HttpDeps, defaultHttpDeps, postJson } from './http';
import { type ImageMime, buildVisionRequest, extractOutputText, parseSketch } from './vision';
import { buildDecisionRequest, parseDecision } from './decisions';
import { buildImageRequest, parseImageResponse } from './image';

export { OpenAIError } from './errors';
export type { OpenAIErrorCode } from './errors';
export type { ImageMime } from './vision';

export interface AiDecision {
  action: BeanActionName;
  explanation: string;
  confidence: number | null;
  model: string;
}

export interface OpenAIAdapter {
  initialStatus(): ApiStatusMap;
  readonly configured: boolean;
  readonly models: { vision: string; decisions: string; image: string };
  /** Reads a sketch photo. Throws OpenAIError. */
  analyzeSketch(image: Buffer, mime: ImageMime): Promise<RecognizedSketch>;
  /** One Decisions API call. Throws OpenAIError ('nothing_to_decide' without calling when workers are at max). */
  decide(facts: QueueFacts): Promise<AiDecision>;
  /** One image generation call, never retried. Returns PNG bytes. Throws OpenAIError. */
  generateBeanImage(): Promise<{ png: Buffer; model: string }>;
}

export interface OpenAIAdapterDeps {
  fetch?: typeof fetch;
  /** Test hook to skip real waiting between retries. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function createOpenAIAdapter(config: AppConfig['openai'], deps: OpenAIAdapterDeps = {}): OpenAIAdapter {
  const apiKey = config.apiKey;
  const configured = Boolean(apiKey);
  const base = defaultHttpDeps();
  const http: HttpDeps = {
    fetch: deps.fetch ?? base.fetch,
    sleep: deps.sleep ?? base.sleep,
    now: deps.now ?? base.now,
  };
  const models = { vision: config.visionModel, decisions: config.decisionsModel, image: config.imageModel };

  const entry = (model: string) => ({
    state: configured ? ('ready' as const) : ('not_configured' as const),
    model,
    message: configured ? 'Key configured; not called yet.' : 'No OPENAI_API_KEY set — example mode.',
    updatedAt: Date.now(),
  });

  return {
    configured,
    models,
    initialStatus: () => ({
      vision: entry(models.vision),
      decisions: entry(models.decisions),
      image: entry(models.image),
    }),

    async analyzeSketch(image, mime) {
      if (!apiKey) throw notConfiguredError('vision');
      const response = await postJson(http, {
        kind: 'vision',
        model: models.vision,
        baseUrl: config.baseUrl,
        path: '/responses',
        apiKey,
        body: buildVisionRequest(models.vision, image, mime),
        timeoutMs: config.visionTimeoutMs,
        retry: true,
      });
      return parseSketch(extractOutputText(response));
    },

    async decide(facts) {
      if (!hasDecisionToMake(facts)) {
        throw new OpenAIError('nothing_to_decide', 'decisions', NOTHING_TO_DECIDE);
      }
      if (!apiKey) throw notConfiguredError('decisions');
      const response = await postJson(http, {
        kind: 'decisions',
        model: models.decisions,
        baseUrl: config.baseUrl,
        path: '/decisions',
        apiKey,
        body: buildDecisionRequest(models.decisions, facts),
        timeoutMs: config.decisionsTimeoutMs,
        retry: true,
      });
      const parsed = parseDecision(response, facts);
      return { ...parsed, model: models.decisions };
    },

    async generateBeanImage() {
      if (!apiKey) throw notConfiguredError('image');
      const response = await postJson(http, {
        kind: 'image',
        model: models.image,
        baseUrl: config.baseUrl,
        path: '/images/generations',
        apiKey,
        body: buildImageRequest(models.image),
        timeoutMs: config.imageTimeoutMs,
        // Image generation is slow and billed per image: never retried automatically.
        retry: false,
      });
      return { png: parseImageResponse(response), model: models.image };
    },
  };
}
