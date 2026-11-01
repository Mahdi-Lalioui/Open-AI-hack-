/** Accessible text/HTML version of the live queue (WebGL fallback and "Text view"). */
import type { Order, OrderOrigin, PublicState } from '../../shared/types';
import { formatClock, formatDuration } from '../lib/format';

const ORIGIN_TEXT: Record<OrderOrigin, string> = {
  audience: 'Audience',
  presenter: 'Presenter',
  automatic: 'Automatic',
};

function who(o: Order): string {
  return o.nickname ? `${o.nickname} (${ORIGIN_TEXT[o.origin].toLowerCase()})` : ORIGIN_TEXT[o.origin];
}

const MAX_LISTED = 12;

export function TextSimulation({ state, compact = false }: { state: PublicState; compact?: boolean }) {
  const { sim, world } = state;
  const label = (k: 'source' | 'service' | 'sink', fallback: string) =>
    world?.graph.nodes.find((n) => n.kind === k)?.label ?? fallback;
  const waiting = sim.orders.filter((o) => o.serviceStartTime === null);
  const inService = sim.orders.filter((o) => o.serviceStartTime !== null && o.completionTime === null);
  const completed = sim.metrics.completed;

  return (
    <div className={`text-sim ${compact ? 'text-sim-compact' : ''}`}>
      <p className="text-sim-flow">
        {label('source', 'Start')} → queue → {label('service', 'Service')} → {label('sink', 'End')} · simulated time{' '}
        {formatClock(sim.time)} · {sim.running ? `running at ${sim.speed}×` : sim.started ? 'paused' : 'not started'}
      </p>
      <div className="text-sim-grid">
        <section aria-label="Waiting in line">
          <h3>
            Waiting in line <span className="count">{waiting.length}</span>
          </h3>
          {waiting.length === 0 ? (
            <p className="muted">Nobody is waiting.</p>
          ) : (
            <ol>
              {waiting.slice(0, MAX_LISTED).map((o) => (
                <li key={o.id}>
                  {who(o)} <span className="muted">· waiting {formatDuration(sim.time - o.arrivalTime)}</span>
                </li>
              ))}
              {waiting.length > MAX_LISTED && <li className="muted">…and {waiting.length - MAX_LISTED} more</li>}
            </ol>
          )}
        </section>
        <section aria-label="Being served">
          <h3>
            At the {label('service', 'counter')} <span className="count">{inService.length}</span>
          </h3>
          {inService.length === 0 ? (
            <p className="muted">No order in service.</p>
          ) : (
            <ul>
              {inService.map((o) => (
                <li key={o.id}>
                  {who(o)} <span className="muted">· worker {o.workerId ?? '?'}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            Workers: {sim.workers.length} ({sim.workers.filter((w) => w.busyWith).length} busy)
          </p>
        </section>
        <section aria-label="Served">
          <h3>
            Served at {label('sink', 'pickup')} <span className="count">{completed}</span>
          </h3>
        </section>
      </div>
    </div>
  );
}

/** One-sentence summary for a polite live region. */
export function queueSummary(state: PublicState): string {
  const m = state.sim.metrics;
  return `${m.waiting} waiting, ${m.inService} being served, ${m.completed} served, ${m.workers} ${
    m.workers === 1 ? 'worker' : 'workers'
  }.`;
}
