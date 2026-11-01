/**
 * Typed, secret-free errors for the OpenAI integrations.
 * Messages are written for the host on stage: they say what went wrong and what to change.
 * They never contain the API key, the Authorization header or raw upstream bodies.
 */
import type { ApiKind } from '../../shared/types';

export type OpenAIErrorCode =
  | 'not_configured'
  | 'invalid_key'
  | 'model_access'
  | 'model_not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'bad_request'
  | 'moderation_blocked'
  | 'upstream_error'
  | 'timeout'
  | 'network'
  | 'invalid_model_output'
  | 'model_refused'
  | 'nothing_to_decide';

/** HTTP status our own API answers with for each code. */
const HTTP_STATUS: Record<OpenAIErrorCode, number> = {
  not_configured: 503,
  invalid_key: 502,
  model_access: 502,
  model_not_found: 502,
  rate_limited: 429,
  quota_exceeded: 502,
  bad_request: 502,
  moderation_blocked: 422,
  upstream_error: 502,
  timeout: 504,
  network: 502,
  invalid_model_output: 502,
  model_refused: 422,
  nothing_to_decide: 409,
};

export class OpenAIError extends Error {
  readonly code: OpenAIErrorCode;
  readonly kind: ApiKind;
  /** Status returned by OpenAI, if the failure came from an HTTP response. */
  readonly upstreamStatus?: number;
  /** Whether a single retry is reasonable (set by the HTTP helper). */
  readonly transient: boolean;
  /** Delay suggested by Retry-After headers, in ms. */
  readonly retryAfterMs?: number;

  constructor(
    code: OpenAIErrorCode,
    kind: ApiKind,
    message: string,
    extra: { upstreamStatus?: number; transient?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'OpenAIError';
    this.code = code;
    this.kind = kind;
    this.upstreamStatus = extra.upstreamStatus;
    this.transient = extra.transient ?? false;
    this.retryAfterMs = extra.retryAfterMs;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  toJSON() {
    return { code: this.code, kind: this.kind, message: this.message, upstreamStatus: this.upstreamStatus };
  }
}

export const MODEL_ENV_VAR: Record<ApiKind, string> = {
  vision: 'OPENAI_VISION_MODEL',
  decisions: 'OPENAI_DECISIONS_MODEL',
  image: 'OPENAI_IMAGE_MODEL',
};

export const TIMEOUT_ENV_VAR: Record<ApiKind, string> = {
  vision: 'OPENAI_VISION_TIMEOUT_MS',
  decisions: 'OPENAI_DECISIONS_TIMEOUT_MS',
  image: 'OPENAI_IMAGE_TIMEOUT_MS',
};

const KIND_LABEL: Record<ApiKind, string> = {
  vision: 'Sketch reading',
  decisions: 'Bean decision',
  image: 'Bean image',
};

/** Error codes OpenAI uses for exhausted credits / spend limits (do not retry). */
const QUOTA_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
  'billing_hard_limit_reached',
]);

/** Removes anything that could be a key or an auth header. Applied to every outgoing message. */
export function redact(text: string, apiKey?: string | null): string {
  let out = text;
  if (apiKey) out = out.split(apiKey).join('[redacted]');
  out = out.replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [redacted]');
  out = out.replace(/\bsk-[A-Za-z0-9_*.-]{3,}/g, '[redacted]');
  return out;
}

export interface UpstreamErrorBody {
  code?: string;
  type?: string;
  message?: string;
}

/** Reads `{ error: { code, type, message } }` defensively. */
export function readUpstreamError(body: unknown): UpstreamErrorBody {
  const e = (body as { error?: unknown } | null)?.error;
  if (!e || typeof e !== 'object') return {};
  const o = e as Record<string, unknown>;
  const safe = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v : undefined);
  return {
    code: safe(o.code),
    type: safe(o.type),
    message: typeof o.message === 'string' ? o.message : undefined,
  };
}

function shortUpstreamMessage(msg: string | undefined, apiKey: string | null): string {
  if (!msg) return '';
  const clean = redact(msg, apiKey).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return ` OpenAI said: "${clean.length > 160 ? `${clean.slice(0, 157)}...` : clean}"`;
}

export function notConfiguredError(kind: ApiKind): OpenAIError {
  return new OpenAIError(
    'not_configured',
    kind,
    'No OPENAI_API_KEY set — the app is in example mode. Use the built-in example or edit the steps by hand.',
  );
}

export function timeoutError(kind: ApiKind, timeoutMs: number): OpenAIError {
  const secs = Math.max(1, Math.round(timeoutMs / 1000));
  return new OpenAIError(
    'timeout',
    kind,
    `${KIND_LABEL[kind]}: OpenAI did not answer within ${secs} s. Try again, or raise ${TIMEOUT_ENV_VAR[kind]}.`,
  );
}

export function networkError(kind: ApiKind): OpenAIError {
  return new OpenAIError(
    'network',
    kind,
    `${KIND_LABEL[kind]}: could not reach the OpenAI API (network error). Check the internet connection or OPENAI_BASE_URL.`,
    { transient: true },
  );
}

export function invalidOutputError(kind: ApiKind, detail: string): OpenAIError {
  return new OpenAIError('invalid_model_output', kind, `${KIND_LABEL[kind]}: the model's answer was not usable (${detail}). Nothing was changed.`);
}

/**
 * Maps an HTTP error response from OpenAI to an actionable message.
 * Status meanings follow https://developers.openai.com/api/docs/guides/error-codes
 */
export function httpError(
  kind: ApiKind,
  model: string,
  status: number,
  body: unknown,
  retryAfterMs: number | undefined,
  apiKey: string | null,
): OpenAIError {
  const up = readUpstreamError(body);
  const label = KIND_LABEL[kind];
  const env = MODEL_ENV_VAR[kind];
  const extra = { upstreamStatus: status, retryAfterMs };

  if (status === 401) {
    // The upstream 401 message echoes a masked key, so it is never forwarded.
    return new OpenAIError(
      'invalid_key',
      kind,
      `${label}: OpenAI rejected the API key (401). Check OPENAI_API_KEY in .env (and the organization/project it belongs to), then restart the server.`,
      extra,
    );
  }
  if (status === 403) {
    if (up.code === 'unsupported_country_region_territory') {
      return new OpenAIError('model_access', kind, `${label}: the OpenAI API is not available from this country or region (403).`, extra);
    }
    return new OpenAIError(
      'model_access',
      kind,
      `${label}: no access to model "${model}" (403). The organization may need verification ` +
        `(platform.openai.com → Settings → Organization → General) or the project needs access to this model; ` +
        `or set ${env} to a model your account can use.`,
      extra,
    );
  }
  if (status === 404) {
    return new OpenAIError(
      'model_not_found',
      kind,
      `${label}: model "${model}" was not found for this key (404). Set ${env} in .env to a model your account can use, then restart.`,
      extra,
    );
  }
  if (status === 429) {
    const quota = (up.code && QUOTA_CODES.has(up.code)) || up.type === 'insufficient_quota';
    if (quota) {
      return new OpenAIError(
        'quota_exceeded',
        kind,
        `${label}: OpenAI credits or spend limit exhausted (429${up.code ? `, ${up.code}` : ''}). ` +
          'Add credits or raise the limit at platform.openai.com → Settings → Billing / Limits.',
        extra,
      );
    }
    const wait = retryAfterMs !== undefined ? ` Retry after about ${Math.max(1, Math.ceil(retryAfterMs / 1000))} s.` : ' Wait a few seconds and try again.';
    return new OpenAIError('rate_limited', kind, `${label}: OpenAI rate limit reached (429).${wait}`, {
      ...extra,
      transient: retryAfterMs !== undefined && retryAfterMs <= 5000,
    });
  }
  if (status >= 500) {
    const overloaded = status === 503;
    return new OpenAIError(
      'upstream_error',
      kind,
      overloaded
        ? `${label}: model "${model}" is temporarily overloaded (503). Try again in a moment.`
        : `${label}: OpenAI had a server problem (${status}). Try again in a moment.`,
      { ...extra, transient: retryAfterMs === undefined || retryAfterMs <= 5000 },
    );
  }
  if (up.code === 'moderation_blocked' || up.type === 'image_generation_user_error') {
    return new OpenAIError(
      'moderation_blocked',
      kind,
      `${label}: the request was blocked by an OpenAI safety check${up.code ? ` (${up.code})` : ''}. Nothing was retried.`,
      extra,
    );
  }
  if (status === 400 && up.code === 'model_not_found') {
    return new OpenAIError('model_not_found', kind, `${label}: model "${model}" is not available (400). Set ${env} in .env to a model your account can use.`, extra);
  }
  return new OpenAIError(
    'bad_request',
    kind,
    `${label}: OpenAI rejected the request (${status}${up.code ? `, ${up.code}` : ''}).${shortUpstreamMessage(up.message, apiKey)}`,
    extra,
  );
}
