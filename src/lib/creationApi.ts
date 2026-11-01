/** REST helpers for the sketch → creation flow. */
import type {
  CircuitResult, CircuitSpec, CreationConfig, InteractionKind, PetSpec, PetState, RecognizedCreation, SketchMode,
} from '../../shared/creations';
import { ApiClientError, newOrderId } from './api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ApiClientError('Cannot reach the Living Paper server. Check the connection.', 'network', 0);
  }
  let body: { ok?: boolean; error?: string; code?: string } | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || body?.ok === false) {
    throw new ApiClientError(body?.error ?? `Request failed (${res.status}).`, body?.code ?? 'http_error', res.status);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export interface AnalyzeCreationResult { ok: true; creation: RecognizedCreation; model: string }

export function analyzeCreation(file: Blob, mode: SketchMode) {
  return request<AnalyzeCreationResult>(`/api/vision/analyze?mode=${mode}`, {
    method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
  });
}

export function buildCreation(input: { mode: SketchMode; pet?: PetSpec; circuit?: CircuitSpec; source: CreationConfig['source'] }) {
  return post<{ ok: true; creation: CreationConfig }>('/api/creation', input);
}

let clientId: string | null = null;
const CLIENT_ID_KEY = 'living-paper-client-id';

function browserClientId(): string {
  if (clientId) return clientId;
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return (clientId = saved);
  } catch { /* Storage can be unavailable in a private browser or embedded view. */ }
  clientId = newOrderId();
  try { localStorage.setItem(CLIENT_ID_KEY, clientId); } catch { /* Keep this page's in-memory identity. */ }
  return clientId;
}

export function sendInteraction(input: { id: string; kind: InteractionKind; nickname?: string }) {
  return post<{ ok: true; duplicate?: boolean }>('/api/interactions', { ...input, clientId: browserClientId() });
}

