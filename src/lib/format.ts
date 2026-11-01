/** Pure formatting + derivation helpers for the host and guest screens (no React, no DOM). */
import type {
  ApiState,
  ApiStatusMap,
  BeanActionName,
  BeanDecision,
  PublicState,
  WorldConfig,
} from '../../shared/types';

/** Simulated seconds → "m:ss" (or "h:mm:ss" past an hour). Negative / invalid → "0:00". */
export function formatClock(totalSec: number): string {
  const s = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** A duration for people: "42 s", "1 min 5 s", "3 min". */
export function formatDuration(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : 0;
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/** Average wait metric: null (nothing served yet) → "—". */
export function formatAvgWait(sec: number | null): string {
  return sec === null || !Number.isFinite(sec) ? '—' : formatDuration(sec);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const lastTwo = v % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

/** Guest confirmation from AddOrderResult.position (1-based; 0 = already in service / done). */
export function positionMessage(position: number): string {
  if (!(position > 0)) return 'Your order is being made now';
  return `You are ${ordinal(position)} in line`;
}

/** True for hosts a phone in the audience can never reach. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0') return true;
  return /^127(\.\d{1,3}){3}$/.test(h);
}

export interface GuestUrlInfo {
  url: string;
  isLocal: boolean;
}

/** guest URL = (PUBLIC_BASE_URL ?? page origin) + "/join". */
export function guestUrlFor(publicBaseUrl: string | null | undefined, pageOrigin: string): GuestUrlInfo {
  const base = (publicBaseUrl && publicBaseUrl.trim()) || pageOrigin;
  const trimmed = base.trim().replace(/\/+$/, '');
  const url = `${trimmed}/join`;
  let isLocal = false;
  try {
    isLocal = isLocalHostname(new URL(url).hostname);
  } catch {
    isLocal = /localhost|127\.0\.0\.1|\[::1\]/i.test(trimmed);
  }
  return { url, isLocal };
}

export type StatusBadgeText = 'Live' | 'Ready' | 'Waiting' | 'Not configured' | 'Unavailable';

export function apiStateLabel(state: ApiState): StatusBadgeText {
  switch (state) {
    case 'live':
      return 'Live';
    case 'ready':
      return 'Ready';
    case 'waiting':
      return 'Waiting';
    case 'not_configured':
      return 'Not configured';
    default:
      return 'Unavailable';
  }
}

/** "Live AI available" as soon as any integration has a key. */
export function isLiveAiAvailable(api: ApiStatusMap | null | undefined): boolean {
  if (!api) return false;
  return Object.values(api).some((e) => e && e.state !== 'not_configured');
}

export function beanActionWords(action: BeanActionName): string {
  return action === 'call_backup' ? 'Call backup' : 'Keep serving';
}

export function beanSourceLabel(decision: Pick<BeanDecision, 'source' | 'model'>): string {
  if (decision.source === 'ai') return `AI decision · ${decision.model || 'model not reported'}`;
  return 'Example action (rule-based, no AI)';
}

/** Title for the guest page, e.g. "Barista café". */
export function cafeTitle(world: WorldConfig | null | undefined): string {
  const service = world?.graph.nodes.find((n) => n.kind === 'service')?.label.trim();
  if (!service) return 'Living Paper café';
  if (/caf[eé]|coffee/i.test(service)) return service;
  return `${service} café`;
}

/** Accepted upload types and size for sketch photos. Returns an error sentence or null. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Please choose a PNG, JPEG or WebP photo of your sketch.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That photo is ${mb} MB. Please use one under 8 MB.`;
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Parses a whole number of seconds within [min, max]; null if invalid. */
export function parseWholeSeconds(raw: string, min: number, max: number): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export interface BeanMoodText {
  mood: string;
  line: string;
}

/** Plain-text mood used when the scene's beanMood() helper is not available. */
export function simpleBeanMood(state: PublicState): BeanMoodText {
  const { waiting, workers } = state.sim.metrics;
  if (!state.world) return { mood: 'sleepy', line: 'Bean is waiting for a sketch to come to life.' };
  if (waiting === 0) return { mood: 'calm', line: 'All quiet. Bean is keeping an eye on the counter.' };
  if (waiting <= 3) return { mood: 'busy', line: `A small line of ${waiting}. Bean is watching it.` };
  if (workers >= 2) return { mood: 'tense', line: `${waiting} waiting even with two workers. Hang in there.` };
  return { mood: 'worried', line: `${waiting} people waiting. Bean thinks the counter needs help.` };
}
