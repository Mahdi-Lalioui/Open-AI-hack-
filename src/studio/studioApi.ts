/** REST helpers for the Design Studio. */
import type { StudioDesign, StudioStatus } from '../../shared/blueprint/api';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import { ApiClientError } from '../lib/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ApiClientError('Cannot reach the server. Check the connection.', 'network', 0);
  }
  const body = await res.json().catch(() => null) as { ok?: boolean; error?: string; code?: string } | null;
  if (!res.ok || body?.ok === false) {
    throw new ApiClientError(body?.error ?? `Request failed (${res.status}).`, body?.code ?? 'http_error', res.status);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const getStatus = () => request<StudioStatus>('/api/design/status');

type DesignResponse = { ok: true; design: StudioDesign };

export type Engine = 'ai' | 'rules' | undefined;

export const interpret = (input: { text?: string; image?: { base64: string }; engine?: Engine; templateId?: string; blueprint?: unknown }) =>
  post<DesignResponse>('/api/design/interpret', input).then((r) => r.design);

export const refine = (id: string, instruction: string, engine?: Engine) =>
  post<DesignResponse>('/api/design/refine', { id, instruction, engine }).then((r) => r.design);

export const saveEdit = (id: string, blueprint: DesignBlueprint, summary: string) =>
  post<DesignResponse>('/api/design/refine', { id, blueprint, summary }).then((r) => r.design);

export const getDesign = (id: string) => request<DesignResponse>(`/api/design/${encodeURIComponent(id)}`).then((r) => r.design);

export const undo = (id: string) => post<DesignResponse>(`/api/design/${id}/undo`, {}).then((r) => r.design);

export async function transcribe(audio: Blob): Promise<string> {
  const r = await request<{ ok: true; text: string }>('/api/design/transcribe', {
    method: 'POST', headers: { 'Content-Type': audio.type.split(';')[0] || 'audio/webm' }, body: audio,
  });
  return r.text;
}

export interface DownloadedFile { blob: Blob; filename: string }

export async function exportFile(id: string, format: string): Promise<DownloadedFile> {
  let res: Response;
  try {
    res = await fetch('/api/design/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, format }) });
  } catch {
    throw new ApiClientError('Cannot reach the server. Check the connection.', 'network', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
    throw new ApiClientError(body?.error ?? `Export failed (${res.status}).`, body?.code ?? 'http_error', res.status);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'design';
  return { blob: await res.blob(), filename: name };
}

export function saveFile({ blob, filename }: DownloadedFile) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}
