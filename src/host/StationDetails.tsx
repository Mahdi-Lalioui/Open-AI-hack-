/** Details panel for the station selected in the scene or via the Inspect buttons. */
import type { ReactNode } from 'react';
import type { PublicState } from '../../shared/types';
import { DEFAULT_ASSUMPTIONS } from '../../shared/types';
import type { StationId } from '../scene/types';
import { beanActionWords, formatAvgWait, formatClock, formatDuration } from '../lib/format';
import { getBeanMood } from './mood';

export function stationLabel(state: PublicState | null, id: StationId): string {
  const node = (k: 'source' | 'service' | 'sink') => state?.world?.graph.nodes.find((n) => n.kind === k)?.label;
  switch (id) {
    case 'source':
      return node('source') ?? 'Start';
    case 'queue':
      return 'Queue';
    case 'service':
      return node('service') ?? 'Counter';
    case 'sink':
      return node('sink') ?? 'Pickup';
    case 'bean':
      return 'Bean';
  }
}

const ROLE: Record<StationId, string> = {
  source: 'Start · where orders come from',
  queue: 'Queue · orders waiting for the counter',
  service: 'Service · where the work happens',
  sink: 'End · where finished orders go',
  bean: 'Pet · watches the queue and can suggest calling backup',
};

interface Props {
  state: PublicState;
  selected: StationId;
  onClose: () => void;
}

export function StationDetails({ state, selected, onClose }: Props) {
  const { sim } = state;
  const m = sim.metrics;
  const a = state.world?.assumptions ?? DEFAULT_ASSUMPTIONS;
  const rows: [string, ReactNode][] = [];
  const count = (origin: string) => sim.orders.filter((o) => o.origin === origin).length;
  const waiting = sim.orders.filter((o) => o.serviceStartTime === null);

  switch (selected) {
    case 'source':
      rows.push(['Orders submitted', m.submitted]);
      rows.push(['From the audience', count('audience')]);
      rows.push(['From the presenter', count('presenter')]);
      rows.push(['Automatic', count('automatic')]);
      rows.push(['Next automatic arrival', sim.nextAutoArrival === null ? 'none left' : formatClock(sim.nextAutoArrival)]);
      rows.push(['Assumption', `one every ${a.arrivalIntervalSec} s until ${formatClock(a.autoArrivalUntilSec)}`]);
      break;
    case 'queue':
      rows.push(['Waiting', m.waiting]);
      rows.push(['Oldest wait', waiting.length ? formatDuration(sim.time - waiting[0].arrivalTime) : '—']);
      break;
    case 'service': {
      const busy = sim.workers.filter((w) => w.busyWith).length;
      rows.push(['Workers busy', `${busy} / ${sim.workers.length}`]);
      rows.push(['In service', m.inService]);
      rows.push(['Service time', `${a.serviceTimeSec} s per order`]);
      break;
    }
    case 'sink':
      rows.push(['Served', m.completed]);
      rows.push(['Avg wait', formatAvgWait(m.avgWaitSec)]);
      break;
    case 'bean': {
      const mood = getBeanMood(state);
      rows.push(['Mood', mood.mood]);
      rows.push(['Says', mood.line]);
      const d = state.bean.lastDecision;
      rows.push(['Last decision', d ? beanActionWords(d.action) : 'not asked yet']);
      break;
    }
  }

  return (
    <section className="details" aria-labelledby="details-title" data-testid="station-details">
      <div className="details-head">
        <div>
          <h3 id="details-title">{stationLabel(state, selected)}</h3>
          <p className="details-role">{ROLE[selected]}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose} aria-label="Close details (Escape)">
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <dl className="details-list">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
