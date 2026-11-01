import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { LiveSession } from '../../server/session';
import { createOpenAIAdapter } from '../../server/openai';
import { exampleBuildInput } from '../../shared/example';

let session: LiveSession;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const openai = createOpenAIAdapter({
    apiKey: null,
    baseUrl: 'http://invalid',
    visionModel: 'v',
    decisionsModel: 'd',
    imageModel: 'i',
    visionTimeoutMs: 1000,
    decisionsTimeoutMs: 1000,
    imageTimeoutMs: 1000,
  });
  session = new LiveSession({ initialApiStatus: openai.initialStatus(), publicBaseUrl: null });
  app = createApp({ session, openai });
});

afterEach(() => {
  session.dispose();
});

describe('POST /api/world', () => {
  it('builds a valid world and resets the sim', async () => {
    const res = await request(app).post('/api/world').send(exampleBuildInput());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, world: { version: 1, source: 'example' } });
    expect(res.body.world.graph.nodes).toHaveLength(3);

    const state = await request(app).get('/api/state');
    expect(state.body.world.version).toBe(1);
    expect(state.body.sim.epoch).toBe(1);
  });

  it('rejects an invalid graph with a readable error and keeps the previous world', async () => {
    await request(app).post('/api/world').send(exampleBuildInput()).expect(200);
    const bad = exampleBuildInput();
    bad.graph.nodes[2].kind = 'service';
    const res = await request(app).post('/api/world').send(bad);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: 'invalid_graph' });
    expect(res.body.error).toMatch(/exactly one service step/);

    const nonsense = await request(app).post('/api/world').send({ hello: 'world' });
    expect(nonsense.status).toBe(400);
    expect(nonsense.body.code).toBe('invalid_graph');

    const badAssumptions = exampleBuildInput();
    badAssumptions.assumptions.serviceTimeSec = 0;
    const r3 = await request(app).post('/api/world').send(badAssumptions);
    expect(r3.status).toBe(400);
    expect(r3.body.error).toMatch(/serviceTimeSec/);

    const state = await request(app).get('/api/state');
    expect(state.body.world.version).toBe(1);
  });

  it('rejects malformed JSON as invalid_input', async () => {
    const res = await request(app).post('/api/world').set('Content-Type', 'application/json').send('{"graph":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: 'invalid_input' });
  });
});

describe('simulation controls', () => {
  it('start, pause and reset', async () => {
    await request(app).post('/api/sim/start').expect(200, { ok: true });
    let state = (await request(app).get('/api/state')).body;
    expect(state.sim).toMatchObject({ running: true, started: true });
    expect(state.sim.metrics.submitted).toBe(1);

    await request(app).post('/api/sim/pause').expect(200, { ok: true });
    state = (await request(app).get('/api/state')).body;
    expect(state.sim.running).toBe(false);

    await request(app).post('/api/sim/reset').expect(200, { ok: true });
    state = (await request(app).get('/api/state')).body;
    expect(state.sim).toMatchObject({ running: false, started: false, time: 0, epoch: 1, orders: [] });
  });

  it('validates speed', async () => {
    await request(app).post('/api/sim/speed').send({ speed: 20 }).expect(200, { ok: true });
    expect(session.getState().sim.speed).toBe(20);
    for (const body of [{ speed: 3 }, { speed: '10' }, {}, { speed: null }]) {
      const res = await request(app).post('/api/sim/speed').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: 'invalid_input' });
      expect(res.body.error).toMatch(/1, 5, 10, 20/);
    }
    expect(session.getState().sim.speed).toBe(20);
  });
});

describe('POST /api/workers', () => {
  it('adds the second worker then refuses at cap', async () => {
    const res = await request(app).post('/api/workers').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, worker: { id: 2, addedBy: 'manual' } });

    const capped = await request(app).post('/api/workers');
    expect(capped.status).toBe(409);
    expect(capped.body).toEqual({ ok: false, error: 'Both workers are already on shift.', code: 'worker_cap' });
  });

  it('refuses a stale expectedEpoch', async () => {
    await request(app).post('/api/sim/reset').expect(200);
    const res = await request(app).post('/api/workers').send({ expectedEpoch: 0 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('stale_epoch');
  });
});

describe('POST /api/orders', () => {
  it('adds an order and treats a resend as a duplicate', async () => {
    await request(app).post('/api/sim/start').expect(200);
    const body = { id: 'abcdef123456', origin: 'audience', nickname: 'Sam' };
    const first = await request(app).post('/api/orders').set('X-Forwarded-For', '10.0.0.1').send(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      duplicate: false,
      order: { id: 'abcdef123456', origin: 'audience', nickname: 'Sam', serviceStartTime: null },
      position: 1,
      metrics: { submitted: 2, waiting: 1, inService: 1 },
    });

    // Immediate resend from the same phone: idempotent, not rate limited.
    const again = await request(app).post('/api/orders').set('X-Forwarded-For', '10.0.0.1').send(body);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ ok: true, duplicate: true, order: { id: 'abcdef123456' } });
    expect(session.getState().sim.metrics.submitted).toBe(2);
  });

  it('returns 429 when an audience member orders too fast, per ip', async () => {
    const send = (id: string, ip: string, origin = 'audience') =>
      request(app).post('/api/orders').set('X-Forwarded-For', ip).send({ id, origin });
    expect((await send('rate-order-1', '10.0.0.2')).status).toBe(200);
    const limited = await send('rate-order-2', '10.0.0.2');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ ok: false, code: 'rate_limited' });
    expect((await send('rate-order-3', '10.0.0.3')).status).toBe(200);
    expect((await send('rate-order-4', '10.0.0.2', 'presenter')).status).toBe(200);
  });

  it('rejects invalid orders with 400', async () => {
    for (const body of [{}, { id: 'short', origin: 'audience' }, { id: 'valid-id-000', origin: 'automatic' }, { id: 'bad id with spaces', origin: 'audience' }]) {
      const res = await request(app).post('/api/orders').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: 'invalid_input' });
    }
  });

  it('returns 409 queue_full when the per-run cap is hit', async () => {
    const small = new LiveSession({ initialApiStatus: session.getState().api, publicBaseUrl: null, maxOrdersPerEpoch: 1 });
    try {
      const openai = createOpenAIAdapter({
        apiKey: null,
        baseUrl: 'http://invalid',
        visionModel: 'v',
        decisionsModel: 'd',
        imageModel: 'i',
        visionTimeoutMs: 1000,
        decisionsTimeoutMs: 1000,
        imageTimeoutMs: 1000,
      });
      const smallApp = createApp({ session: small, openai });
      await request(smallApp).post('/api/orders').send({ id: 'full-order-1', origin: 'presenter' }).expect(200);
      const res = await request(smallApp).post('/api/orders').send({ id: 'full-order-2', origin: 'presenter' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('queue_full');
    } finally {
      small.dispose();
    }
  });

  it('a resend after reset is not re-added', async () => {
    const body = { id: 'retry-after-reset', origin: 'presenter' };
    await request(app).post('/api/orders').send(body).expect(200);
    await request(app).post('/api/sim/reset').expect(200);
    const res = await request(app).post('/api/orders').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ duplicate: true, position: 0 });
    expect(session.getState().sim.orders).toHaveLength(0);
  });
});

describe('POST /api/bean/management', () => {
  it('toggles AI management and validates the body', async () => {
    await request(app).post('/api/bean/management').send({ enabled: true }).expect(200, { ok: true });
    expect(session.getState().bean.aiManagement).toBe(true);
    const bad = await request(app).post('/api/bean/management').send({ enabled: 'yes' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('invalid_input');
    expect(session.getState().bean.aiManagement).toBe(true);
  });
});

describe('fallbacks', () => {
  it('unknown API routes return JSON 404', async () => {
    const res = await request(app).post('/api/does-not-exist').send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'Not found', code: 'not_found' });
    const get = await request(app).get('/api/sim/start');
    expect(get.status).toBe(404);
    expect(get.body.code).toBe('not_found');
  });

  it('GET /api/state returns the full public state', async () => {
    const res = await request(app).get('/api/state');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      world: null,
      publicBaseUrl: null,
      sim: { time: 0, speed: 10, running: false },
      bean: { thinking: false, aiManagement: false },
      api: { vision: { state: 'not_configured' } },
    });
  });
});
