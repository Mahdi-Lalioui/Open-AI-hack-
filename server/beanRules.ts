/**
 * Queue facts for Bean + the deterministic example rule used when no API key is configured.
 * The example rule is NOT AI: decisions built here are always labelled source 'example'.
 */
import { DEFAULT_ASSUMPTIONS, MAX_WORKERS } from '../shared/types';
import type { BeanActionName, PublicState } from '../shared/types';

export interface QueueFacts {
  waiting: number;
  inService: number;
  completed: number;
  /** Mean wait of completed orders, seconds; null when none completed yet. */
  avgWaitSec: number | null;
  workers: number;
  maxWorkers: number;
  simTimeSec: number;
  arrivalIntervalSec: number;
  serviceTimeSec: number;
  /** Label of the service step, e.g. "Barista". */
  serviceLabel: string;
}

export const EXAMPLE_PREFIX = 'Example action (rule-based, no AI): ';
export const NOTHING_TO_DECIDE = 'No decision needed: both workers are already on shift.';
const EXPLANATION_MAX = 200;

export function queueFactsFromState(state: PublicState): QueueFacts {
  const m = state.sim.metrics;
  const assumptions = state.world?.assumptions ?? DEFAULT_ASSUMPTIONS;
  const service = state.world?.graph.nodes.find((n) => n.kind === 'service');
  return {
    waiting: m.waiting,
    inService: m.inService,
    completed: m.completed,
    avgWaitSec: m.avgWaitSec === null ? null : Math.round(m.avgWaitSec * 10) / 10,
    workers: m.workers,
    maxWorkers: MAX_WORKERS,
    simTimeSec: Math.round(state.sim.time),
    arrivalIntervalSec: assumptions.arrivalIntervalSec,
    serviceTimeSec: assumptions.serviceTimeSec,
    serviceLabel: service?.label ?? 'Service',
  };
}

/** call_backup is only offered while a second worker can still be added. */
export function offeredActions(facts: QueueFacts): BeanActionName[] {
  const cap = Math.min(facts.maxWorkers, MAX_WORKERS);
  return facts.workers < cap && facts.workers < 2 ? ['call_backup', 'keep_serving'] : ['keep_serving'];
}

/** True when there is a real choice to make (otherwise do not call any API). */
export function hasDecisionToMake(facts: QueueFacts): boolean {
  return offeredActions(facts).includes('call_backup');
}

export function truncate(text: string, max = EXPLANATION_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const secs = (v: number) => `${Math.round(v)} s`;

/** One-line summary of the facts, used in explanations. */
export function describeFacts(f: QueueFacts): string {
  const wait = f.avgWaitSec === null ? 'no completed orders yet' : `avg wait ${secs(f.avgWaitSec)} vs ${secs(f.serviceTimeSec)} service`;
  return `${f.waiting} waiting, ${f.inService} in service, ${wait}, ${f.workers}/${f.maxWorkers} at ${f.serviceLabel}`;
}

/**
 * Deterministic example rule: call backup when there is room for a second worker and
 * (at least 3 are waiting, or the average wait is longer than one service time).
 */
export function exampleDecision(facts: QueueFacts): { action: BeanActionName; explanation: string } {
  const canAdd = offeredActions(facts).includes('call_backup');
  const longLine = facts.waiting >= 3;
  const slow = facts.avgWaitSec !== null && facts.avgWaitSec > facts.serviceTimeSec;
  if (canAdd && (longLine || slow)) {
    const why = longLine ? `${facts.waiting} waiting (≥ 3)` : `avg wait ${secs(facts.avgWaitSec ?? 0)} > ${secs(facts.serviceTimeSec)} service time`;
    return { action: 'call_backup', explanation: truncate(`${EXAMPLE_PREFIX}call backup — ${why} with ${facts.workers} worker at ${facts.serviceLabel}.`) };
  }
  const reason = !canAdd ? 'no room for another worker' : 'the line is short';
  return { action: 'keep_serving', explanation: truncate(`${EXAMPLE_PREFIX}keep serving — ${reason} (${describeFacts(facts)}).`) };
}

/** Explanation for a real AI decision when the API returns no rationale of its own. */
export function aiExplanation(action: BeanActionName, facts: QueueFacts, confidence: number | null): string {
  const verb = action === 'call_backup' ? 'call backup' : 'keep serving';
  const conf = confidence === null ? '' : ` (confidence ${Math.round(confidence * 100)}%)`;
  return truncate(`Bean chose to ${verb}${conf}. Facts sent: ${describeFacts(facts)}.`);
}
