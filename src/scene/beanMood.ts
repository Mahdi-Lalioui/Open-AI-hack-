/** Bean's mood, derived only from real state. Pure, shared by the 3D scene and the UI. */
import type { PublicState } from '../../shared/types';

export type BeanMood = 'sleepy' | 'calm' | 'busy' | 'worried' | 'thinking' | 'proud';

export const BEAN_LINES: Record<BeanMood, string> = {
  sleepy: 'Zzz… wake me when the doors open.',
  calm: 'All quiet. I could get used to this.',
  busy: 'A little line. Totally under control.',
  worried: 'Uh-oh. The line is longer than my legs!',
  thinking: 'Hmm… counting cups, counting feet…',
  proud: 'Backup is here. Watch that line melt!',
};

function waitingCount(state: PublicState): number {
  const m = state.sim?.metrics?.waiting;
  if (typeof m === 'number' && Number.isFinite(m)) return m;
  return (state.sim?.orders ?? []).filter((o) => o.serviceStartTime == null && o.completionTime == null).length;
}

export function beanMood(state: PublicState): { mood: BeanMood; line: string } {
  const mood = pickMood(state);
  return { mood, line: BEAN_LINES[mood] };
}

function pickMood(state: PublicState): BeanMood {
  if (!state.world) return 'sleepy';
  if (state.bean?.thinking) return 'thinking';
  if (!state.sim?.started) return 'sleepy';
  const waiting = waitingCount(state);
  if ((state.sim.workers?.length ?? 0) >= 2 && waiting <= 1) return 'proud';
  if (waiting >= 3) return 'worried';
  if (waiting >= 1) return 'busy';
  return 'calm';
}
