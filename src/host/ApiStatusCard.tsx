/** Honest status of each OpenAI integration. */
import type { ApiKind, PublicState } from '../../shared/types';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';

const ROWS: { kind: ApiKind; title: string; use: string }[] = [
  { kind: 'vision', title: 'Vision', use: 'reads your sketch' },
  { kind: 'decisions', title: 'Decisions', use: 'the pet’s answer' },
  { kind: 'image', title: 'Image', use: 'custom skin' },
];

export function ApiStatusCard({ state }: { state: PublicState | null }) {
  return (
    <Card id="api-status" title="AI connections" className="api-card">
      <ul className="api-list">
        {ROWS.map((r) => {
          const e = state?.api[r.kind];
          return (
            <li key={r.kind} className="api-row" data-testid={`api-status-${r.kind}`}>
              <div className="api-row-head">
                <span className="api-name">
                  {r.title} <span className="muted">· {r.use}</span>
                </span>
                {e ? <StatusBadge state={e.state} /> : <span className="badge">Waiting</span>}
              </div>
              {e && (
                <p className="api-detail">
                  <code className="model-id">{e.model}</code>
                  {e.message ? <span> — {e.message}</span> : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
