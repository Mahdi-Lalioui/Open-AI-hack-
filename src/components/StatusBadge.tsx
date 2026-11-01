import type { ApiState } from '../../shared/types';
import { apiStateLabel } from '../lib/format';

/** One of: Live, Ready, Waiting, Not configured, Unavailable. */
export function StatusBadge({ state }: { state: ApiState }) {
  return (
    <span className={`badge badge-${state}`} data-state={state}>
      {apiStateLabel(state)}
    </span>
  );
}
