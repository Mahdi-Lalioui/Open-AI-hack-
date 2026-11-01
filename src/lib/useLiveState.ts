/** Subscribes to the authoritative server state over Socket.IO. OWNER: lead. */
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type PublicState } from '../../shared/types';

export type Connection = 'connecting' | 'online' | 'offline';

let socket: Socket | null = null;
let latest: PublicState | null = null;
let connection: Connection = 'connecting';
const listeners = new Set<() => void>();

function ensureSocket() {
  if (socket) return;
  socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
  const notify = () => listeners.forEach((l) => l());
  socket.on('connect', () => {
    connection = 'online';
    notify();
  });
  socket.on('disconnect', () => {
    connection = 'offline';
    notify();
  });
  socket.on('connect_error', () => {
    connection = 'offline';
    notify();
  });
  socket.on(SOCKET_EVENTS.state, (s: PublicState) => {
    latest = s;
    notify();
  });
}

export function useLiveState(enabled = true): { state: PublicState | null; connection: Connection } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    ensureSocket();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, [enabled]);
  return { state: latest, connection };
}
