import type { Connection } from '../lib/useLiveState';

const TEXT: Record<Connection, string> = {
  online: 'Online',
  connecting: 'Connecting…',
  offline: 'Reconnecting…',
};

export function ConnectionPill({ connection }: { connection: Connection }) {
  return (
    <span className={`pill pill-conn pill-${connection}`} role="status" data-testid="connection-status">
      <span className="dot" aria-hidden="true" />
      {TEXT[connection]}
    </span>
  );
}
