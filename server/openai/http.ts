/**
 * Minimal JSON POST helper for the OpenAI REST API (no SDK).
 * - Bounded total time per call (AbortController), covering connect + body.
 * - At most ONE retry, only for transient failures (network error, 5xx, 429 with Retry-After ≤ 5 s)
 *   and only when the caller allows it (image generation never retries).
 * - Errors are OpenAIError with secret-free messages.
 */
import type { ApiKind } from '../../shared/types';
import { OpenAIError, httpError, invalidOutputError, networkError, redact, timeoutError } from './errors';

export interface HttpDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface PostJsonOptions {
  kind: ApiKind;
  model: string;
  baseUrl: string;
  /** Path below the base URL, e.g. "/responses". */
  path: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  /** Allow one retry for transient failures. */
  retry: boolean;
}

const MAX_RETRY_DELAY_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 600;
/** Do not start a retry that cannot finish in a useful amount of time. */
const MIN_TIME_FOR_RETRY_MS = 1500;
/** Error bodies are small; never buffer huge unexpected bodies into memory. */
const MAX_ERROR_BODY_CHARS = 20_000;

export const defaultHttpDeps = (): HttpDeps => ({
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
});

/** Parses `retry-after-ms` / `retry-after` (seconds or HTTP date). */
export function parseRetryAfter(headers: Headers, now: number): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.round(Number(ms));
  const ra = headers.get('retry-after');
  if (!ra) return undefined;
  const t = ra.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const date = Date.parse(t);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

export async function postJson(deps: HttpDeps, opts: PostJsonOptions): Promise<unknown> {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}${opts.path}`;
  const payload = JSON.stringify(opts.body);
  const deadline = deps.now() + opts.timeoutMs;
  const maxAttempts = opts.retry ? 2 : 1;

  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptOnce(deps, opts, url, payload, deadline);
    } catch (err) {
      const e = err instanceof OpenAIError ? err : networkError(opts.kind);
      const remaining = deadline - deps.now();
      const delay = Math.min(e.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS);
      const canRetry =
        attempt < maxAttempts && e.transient && e.code !== 'timeout' && remaining - delay > MIN_TIME_FOR_RETRY_MS;
      if (!canRetry) throw e;
      await deps.sleep(delay);
    }
  }
}

async function attemptOnce(
  deps: HttpDeps,
  opts: PostJsonOptions,
  url: string,
  payload: string,
  deadline: number,
): Promise<unknown> {
  const remaining = deadline - deps.now();
  if (remaining <= 0) throw timeoutError(opts.kind, opts.timeoutMs);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, remaining);

  try {
    let res: Response;
    try {
      res = await deps.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload,
        signal: controller.signal,
      });
    } catch {
      // Never forward the raw fetch error: it can carry request details.
      if (timedOut) throw timeoutError(opts.kind, opts.timeoutMs);
      throw networkError(opts.kind);
    }

    let text: string;
    try {
      text = await res.text();
    } catch {
      if (timedOut) throw timeoutError(opts.kind, opts.timeoutMs);
      throw networkError(opts.kind);
    }

    if (!res.ok) {
      let body: unknown = null;
      try {
        body = JSON.parse(text.slice(0, MAX_ERROR_BODY_CHARS));
      } catch {
        /* non-JSON error page (proxy, gateway) */
      }
      throw httpError(opts.kind, opts.model, res.status, body, parseRetryAfter(res.headers, deps.now()), opts.apiKey);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw invalidOutputError(opts.kind, 'the API response was not JSON');
    }
  } catch (err) {
    if (err instanceof OpenAIError) {
      // Belt and braces: make sure no message can ever carry the key.
      if (err.message.includes(opts.apiKey)) {
        throw new OpenAIError(err.code, err.kind, redact(err.message, opts.apiKey), {
          upstreamStatus: err.upstreamStatus,
          transient: err.transient,
          retryAfterMs: err.retryAfterMs,
        });
      }
      throw err;
    }
    throw networkError(opts.kind);
  } finally {
    clearTimeout(timer);
  }
}
