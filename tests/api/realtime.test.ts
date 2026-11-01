/**
 * Real-time behaviour over a real HTTP server + Socket.IO (ephemeral port, example mode).
 * Covers multi-client agreement, reset propagation, reconnects (no duplicate orders, no second
 * timer) and idempotent order ids.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { attachRealtime, createApp } from '../../server/app';
import { LiveSession } from '../../server/session';
import { createOpenAIAdapter } from '../../server/openai';
import { loadConfig } from '../../server/config';
import { exampleBuildInput } from '../../shared/example';
import { SOCKET_EVENTS, type PublicState } from '../../shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: http.Server;
let session: LiveSession;
let realtime: ReturnType<typeof attachRealtime>;
let baseUrl = '';
const clients: Client[] = [];
let ipCounter = 1;

interface Client {
  socket: Socket;
  states: PublicState[];
  latest(): PublicState;
  waitFor(pred: (s: PublicState) => boolean, timeoutMs?: number, label?: string): Promise<PublicState>;
  /** Resolves with the first state received after this call. */
  nextState(timeoutMs?: number): Promise<PublicState>;
}

function makeClient(): Promise<Client> {
  const socket = connectClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  const states: PublicState[] = [];
  const waiters = new Set<() => void>();
  socket.on(SOCKET_EVENTS.state, (s: PublicState) => {
    states.push(s);
    waiters.forEach((w) => w());
  });
  const client: Client = {
    socket,
    states,
    latest() {
      const s = states[states.length - 1];
      if (!s) throw new Error('no state received yet');
      return s;
    },
    waitFor(pred, timeoutMs = 3000, label = 'condition') {
      return new Promise((resolve, reject) => {
        const check = () => {
          const s = states[states.length - 1];
          if (s && pred(s)) {
            waiters.delete(check);
            clearTimeout(timer);
            resolve(s);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timed out waiting for ${label}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    nextState(timeoutMs = 3000) {
      const start = states.length;
      return client.waitFor(() => states.length > start, timeoutMs, 'next state');
    },
  };
  clients.push(client);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('socket connect timeout')), 3000);
    socket.once(SOCKET_EVENTS.state, () => {
      clearTimeout(t);
      resolve(client);
    });
    socket.once('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function api(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: json };
}

/** Audience orders are rate limited per IP; give each test order its own forwarded address. */
function audienceOrder(id: string, nickname?: string) {
  return api('/orders', { id, origin: 'audience', nickname }, { 'X-Forwarded-For': `10.9.0.${ipCounter++ % 250}` });
}

const getState = async () => (await api('/state')).body as unknown as PublicState;
const orderId = (tag: string) => `rt${tag}${Math.random().toString(36).slice(2, 10)}`;

/** Automatic arrivals happen at 0, 30, ... while t < 300 once Start was pressed. */
const autoArrivalsBy = (t: number) => Math.min(10, Math.floor(t / 30) + 1);

beforeAll(async () => {
  const config = loadConfig({} as NodeJS.ProcessEnv);
  const openai = createOpenAIAdapter({ ...config.openai, apiKey: null });
  session = new LiveSession({ initialApiStatus: openai.initialStatus(), publicBaseUrl: null });
  server = http.createServer(createApp({ session, openai }));
  realtime = attachRealtime(server, session);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  realtime?.close();
  session?.dispose();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  expect((await api('/world', exampleBuildInput())).status).toBe(200);
  expect((await api('/sim/reset', {})).status).toBe(200);
});

afterEach(() => {
  while (clients.length) clients.pop()!.socket.disconnect();
});

describe('realtime state over Socket.IO', () => {
  it('sends the full state on connect, equal to GET /api/state', async () => {
    const a = await makeClient();
    const rest = await getState();
    expect(a.latest().sim.epoch).toBe(rest.sim.epoch);
    expect(a.latest().world?.version).toBe(rest.world?.version);
    expect(a.latest().serverId).toBe(rest.serverId);
  });

  it('two clients receive identical state after a guest order', async () => {
    const a = await makeClient();
    const b = await makeClient();
    const id = orderId('guest');
    const res = await audienceOrder(id, 'Ana');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body?.duplicate).toBe(false);
    const has = (s: PublicState) => s.sim.orders.some((o) => o.id === id);
    await Promise.all([a.waitFor(has, 3000, 'order on A'), b.waitFor(has, 3000, 'order on B')]);
    await sleep(150); // let any coalesced broadcast settle
    expect(a.latest().sim).toEqual(b.latest().sim);
    expect(a.latest().world).toEqual(b.latest().world);
    const order = a.latest().sim.orders.find((o) => o.id === id)!;
    expect(order.origin).toBe('audience');
    expect(order.nickname).toBe('Ana');
    expect(a.latest().sim.metrics.submitted).toBe(1);
    expect(a.latest().sim.metrics.waiting + a.latest().sim.metrics.inService).toBe(1);
  });

  it('host adds a worker: both clients see 2 workers; the cap is 2', async () => {
    const a = await makeClient();
    const b = await makeClient();
    expect(a.latest().sim.workers).toHaveLength(1);
    const res = await api('/workers', {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const two = (s: PublicState) => s.sim.workers.length === 2 && s.sim.metrics.workers === 2;
    await Promise.all([a.waitFor(two, 3000, 'A sees 2 workers'), b.waitFor(two, 3000, 'B sees 2 workers')]);
    const third = await api('/workers', {});
    expect(third.status).toBeGreaterThanOrEqual(400);
    expect((await getState()).sim.workers).toHaveLength(2);
  });

  it('reset is reflected on both clients: orders cleared, epoch + 1, one worker', async () => {
    const a = await makeClient();
    const b = await makeClient();
    await api('/orders', { id: orderId('p'), origin: 'presenter' });
    await api('/workers', {});
    await a.waitFor((s) => s.sim.orders.length === 1 && s.sim.workers.length === 2, 3000, 'order+worker');
    const epoch = a.latest().sim.epoch;
    expect((await api('/sim/reset', {})).status).toBe(200);
    const reset = (s: PublicState) =>
      s.sim.epoch === epoch + 1 && s.sim.orders.length === 0 && s.sim.metrics.submitted === 0;
    const [sa, sb] = await Promise.all([a.waitFor(reset, 3000, 'reset on A'), b.waitFor(reset, 3000, 'reset on B')]);
    for (const s of [sa, sb]) {
      expect(s.sim.workers).toHaveLength(1);
      expect(s.sim.running).toBe(false);
      expect(s.sim.time).toBe(0);
      expect(s.world).not.toBeNull(); // the diagram is kept
    }
  });

  it('re-POSTing the same order id does not duplicate the order', async () => {
    const a = await makeClient();
    const id = orderId('dup');
    const first = await audienceOrder(id, 'Bo');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body?.duplicate).toBe(false);
    const again = await audienceOrder(id, 'Bo');
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body?.duplicate).toBe(true);
    const presenterRetry = await api('/orders', { id, origin: 'presenter' });
    expect(presenterRetry.status).toBe(200);
    expect(presenterRetry.body?.duplicate).toBe(true);
    await sleep(150);
    const s = await getState();
    expect(s.sim.orders.filter((o) => o.id === id)).toHaveLength(1);
    expect(s.sim.metrics.submitted).toBe(1);
    expect(a.latest().sim.orders.filter((o) => o.id === id)).toHaveLength(1);
  });

  it('reconnecting clients get current state, add no orders and no second timer', async () => {
    expect((await api('/sim/speed', { speed: 10 })).status).toBe(200);
    const a = await makeClient();
    const b = await makeClient();
    const id = orderId('rc');
    expect((await audienceOrder(id, 'Cy')).status).toBe(200);
    expect((await api('/sim/start', {})).status).toBe(200);
    await a.waitFor((s) => s.sim.running, 3000, 'running');

    const rate = async () => {
      const s0 = await getState();
      const w0 = Date.now();
      await sleep(1200);
      const s1 = await getState();
      const w1 = Date.now();
      return ((s1.sim.time - s0.sim.time) / (w1 - w0)) * 1000;
    };

    const before = await rate();
    expect(before).toBeGreaterThan(7);
    expect(before).toBeLessThan(13);

    for (let i = 0; i < 5; i++) {
      for (const c of [a, b]) {
        c.socket.disconnect();
        await sleep(30);
        const got = c.nextState();
        c.socket.connect();
        const s = await got;
        const now = await getState();
        expect(s.sim.epoch).toBe(now.sim.epoch);
        expect(Math.abs(s.sim.time - now.sim.time)).toBeLessThan(5);
      }
    }
    // Extra fresh clients that connect and drop must not change anything either.
    for (let i = 0; i < 3; i++) (await makeClient()).socket.disconnect();

    const after = await rate();
    expect(after).toBeGreaterThan(7);
    expect(after).toBeLessThan(13);

    await api('/sim/pause', {});
    const s = await getState();
    const ids = s.sim.orders.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.sim.orders.filter((o) => o.origin === 'audience')).toHaveLength(1);
    expect(s.sim.orders.filter((o) => o.origin === 'automatic')).toHaveLength(autoArrivalsBy(s.sim.time));
    expect(s.sim.metrics.submitted).toBe(1 + autoArrivalsBy(s.sim.time));
  }, 30_000);
});
