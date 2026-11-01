/** Typed REST helpers for the browser. OWNER: lead. All mutations go through REST; state arrives via socket. */
import type {
  AddOrderInput,
  AddOrderResult,
  AnalyzeResult,
  BeanDecision,
  BeanImageState,
  BuildWorldInput,
  WorldConfig,
} from '../../shared/types';

export class ApiClientError extends Error {
  constructor(message: string, public code: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ApiClientError('Cannot reach the VDraw server. Check the connection.', 'network', 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const b = body as { ok?: boolean; error?: string; code?: string; details?: unknown } | null;
  if (!res.ok || (b && b.ok === false)) {
    throw new ApiClientError(b?.error ?? `Request failed (${res.status}).`, b?.code ?? 'http_error', res.status, b?.details);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });

export const api = {
  buildWorld: (input: BuildWorldInput) => post<{ ok: true; world: WorldConfig }>('/api/world', input),
  start: () => post<{ ok: true }>('/api/sim/start'),
  pause: () => post<{ ok: true }>('/api/sim/pause'),
  reset: () => post<{ ok: true }>('/api/sim/reset'),
  setSpeed: (speed: number) => post<{ ok: true }>('/api/sim/speed', { speed }),
  addWorker: () => post<{ ok: true }>('/api/workers'),
  addOrder: (input: AddOrderInput) => post<AddOrderResult>('/api/orders', input),
  setAiManagement: (enabled: boolean) => post<{ ok: true }>('/api/bean/management', { enabled }),
  askBean: () => post<{ ok: true; decision: BeanDecision }>('/api/bean/ask'),
  generateBeanImage: () => post<{ ok: true; image: BeanImageState }>('/api/bean/image'),
  analyzeImage: (file: Blob) =>
    request<AnalyzeResult>('/api/vision/analyze', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }),
};

/** Collision-resistant id for idempotent order submission. */
export function newOrderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
