/** Live queue metrics, sized for a projector. */
import type { PublicState } from '../../shared/types';
import { MAX_WORKERS } from '../../shared/types';
import { Card } from '../components/Card';
import { formatAvgWait, formatClock } from '../lib/format';

interface MetricProps {
  label: string;
  testId: string;
  raw: number | null;
  text: string;
  wide?: boolean;
  tone?: 'coral' | 'teal';
}

function Metric({ label, testId, raw, text, wide, tone }: MetricProps) {
  return (
    <div className={`metric ${wide ? 'metric-wide' : ''} ${tone ? `metric-${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd className="metric-value num" data-testid={testId} data-value={raw === null ? '' : String(raw)}>
        {text}
      </dd>
    </div>
  );
}

export function MetricsCard({ state }: { state: PublicState | null }) {
  const m = state?.sim.metrics;
  const n = (v: number | undefined) => (v === undefined ? null : v);
  const t = (v: number | undefined) => (v === undefined ? '—' : String(v));
  return (
    <Card id="metrics" title="Live numbers" className="metrics-card">
      <dl className="metrics-grid">
        <Metric label="Queue (waiting)" testId="metric-waiting" raw={n(m?.waiting)} text={t(m?.waiting)} tone="coral" />
        <Metric label="In service" testId="metric-in-service" raw={n(m?.inService)} text={t(m?.inService)} />
        <Metric label="Served" testId="metric-completed" raw={n(m?.completed)} text={t(m?.completed)} tone="teal" />
        <Metric label="Submitted" testId="metric-submitted" raw={n(m?.submitted)} text={t(m?.submitted)} />
        <Metric
          label="Avg wait"
          testId="metric-avg-wait"
          raw={m ? m.avgWaitSec : null}
          text={m ? formatAvgWait(m.avgWaitSec) : '—'}
        />
        <Metric
          label="Workers"
          testId="metric-workers"
          raw={n(m?.workers)}
          text={m ? `${m.workers} / ${MAX_WORKERS}` : '—'}
        />
        <Metric
          label="Sim time"
          testId="metric-sim-time"
          raw={n(m?.simTimeSec)}
          text={m ? formatClock(m.simTimeSec) : '—'}
          wide
        />
      </dl>
      <p className="footnote">Avg wait = mean wait of served orders.</p>
    </Card>
  );
}
