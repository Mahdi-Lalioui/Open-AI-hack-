/** AI routes with supertest, the real LiveSession and a mocked OpenAI fetch (test-only). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { LiveSession } from '../../server/session';
import { createOpenAIAdapter } from '../../server/openai';
import type { AppConfig } from '../../server/config';
import { exampleBuildInput } from '../../shared/example';
import { DEFAULT_PET } from '../../shared/creations';
import { EXAMPLE_PREFIX } from '../../server/beanRules';

const KEY = 'sk-test-SECRET123';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('body')]);
const cfg = (apiKey: string | null): AppConfig['openai'] => ({
  apiKey, baseUrl: 'https://api.example.test/v1', visionModel: 'gpt-6-astra', decisionsModel: 'gpt-6-luna',
  imageModel: 'gpt-image-2.5-flare', visionTimeoutMs: 45000, decisionsTimeoutMs: 20000, imageTimeoutMs: 90000,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const choice = (name: string, value: string) => json(200, { answers: [{ type: 'choice', name, choice: value, confidence: 0.8, probabilities: [] }] });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const sessions: LiveSession[] = [];
afterEach(() => sessions.splice(0).forEach((s) => s.dispose()));

function setup(opts: { key?: boolean; fetch?: typeof fetch } = {}) {
  const openai = createOpenAIAdapter(cfg(opts.key ? KEY : null), { fetch: opts.fetch ?? (vi.fn() as any), sleep: async () => {} });
  const session = new LiveSession({ initialApiStatus: openai.initialStatus(), publicBaseUrl: null });
  sessions.push(session);
  return { app: createApp({ session, openai } as any), session };
}

/** Café world with 1 in service and 4 waiting (sim not started). */
function busyQueue(session: LiveSession) {
  session.buildWorld(exampleBuildInput());
  for (let i = 0; i < 5; i++) session.addOrder({ id: `order-${i}-abcdef`, origin: 'presenter' });
}
function buildPet(session: LiveSession, hunger?: number) {
  (session as any).buildCreation({ mode: 'pet', pet: DEFAULT_PET, source: 'example' });
  if (hunger !== undefined) (session as any).pet.hunger = hunger;
}

function routeMock(handler: (url: string) => Promise<Response> | Response) {
  const calls: string[] = [];
  const fetch = vi.fn(async (url: any) => {
    calls.push(String(url));
    return handler(String(url));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('POST /api/vision/analyze — upload validation', () => {
  it('415 for unsupported types', async () => {
    const { app } = setup();
    for (const type of ['text/plain', 'image/gif']) {
      const r = await request(app).post('/api/vision/analyze').set('Content-Type', type).send(Buffer.from('GIF89a'));
      expect(r.status).toBe(415);
      expect(r.body.code).toBe('unsupported_image');
    }
  });
  it('400 for bad magic bytes and empty uploads', async () => {
    const { app } = setup({ key: true });
    const bad = await request(app).post('/api/vision/analyze').set('Content-Type', 'image/png').send(Buffer.from('definitely not a png'));
    expect([bad.status, bad.body.code]).toEqual([400, 'invalid_image']);
    const empty = await request(app).post('/api/vision/analyze').set('Content-Type', 'image/png').send(Buffer.alloc(0));
    expect([empty.status, empty.body.code]).toEqual([400, 'empty_image']);
  });
  it('413 for > 8 MB', async () => {
    const { app } = setup({ key: true });
    const big = Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]);
    const r = await request(app).post('/api/vision/analyze').set('Content-Type', 'image/png').send(big);
    expect([r.status, r.body.code]).toEqual([413, 'too_large']);
  });
  it('503 not_configured without a key', async () => {
    const { app } = setup();
    const r = await request(app).post('/api/vision/analyze?mode=pet').set('Content-Type', 'image/png').send(PNG);
    expect([r.status, r.body.code]).toEqual([503, 'not_configured']);
    expect(r.body.error).toMatch(/example mode/);
  });
  it('400 for an unknown mode', async () => {
    const { app } = setup({ key: true });
    const r = await request(app).post('/api/vision/analyze?mode=dragon').set('Content-Type', 'image/png').send(PNG);
    expect(r.status).toBe(400);
  });
});

describe('POST /api/vision/analyze — mocked OpenAI', () => {
  it('pet mode returns a creation and marks vision live', async () => {
    const m = routeMock(() => json(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ inScope: true, pet: DEFAULT_PET, uncertainties: [] }) }] }] }));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    const r = await request(app).post('/api/vision/analyze?mode=pet').set('Content-Type', 'image/png').send(PNG);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, model: 'gpt-6-astra', creation: { mode: 'pet', inScope: true, pet: { name: 'Pixel' } } });
    expect(session.getState().api.vision.state).toBe('live');
  });
  it('invalid model output → 502 and vision unavailable, no key in the response', async () => {
    const m = routeMock(() => json(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'nope' }] }] }));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    const r = await request(app).post('/api/vision/analyze?mode=circuit').set('Content-Type', 'image/png').send(PNG);
    expect([r.status, r.body.code]).toEqual([502, 'invalid_model_output']);
    expect(session.getState().api.vision.state).toBe('unavailable');
    expect(JSON.stringify(r.body) + JSON.stringify(session.getState())).not.toContain('SECRET123');
  });
});

describe('POST /api/bean/ask — Ask the pet', () => {
  it('example decision without a key, labelled source example, applied to the pet', async () => {
    const { app, session } = setup();
    buildPet(session, 90);
    const r = await request(app).post('/api/bean/ask');
    expect(r.status).toBe(200);
    expect(r.body.decision).toMatchObject({ source: 'example', action: 'eat', applied: true });
    expect(r.body.decision.explanation.startsWith('Example action (rule-based, no AI)')).toBe(true);
    expect(session.getState().pet?.action).toBe('eat');
    expect(session.getState().pet?.hunger).toBeLessThan(70);
    expect(session.getState().bean.thinking).toBe(false);
  });

  it('AI decision applied via setPetAction', async () => {
    const m = routeMock(() => choice('pet_action', 'dance'));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session, 10);
    const r = await request(app).post('/api/bean/ask');
    expect(r.body.decision).toMatchObject({ source: 'ai', action: 'dance', applied: true, model: 'gpt-6-luna' });
    expect(session.getState().pet?.action).toBe('dance');
  });

  it('a disallowed choice is an error: nothing applied, lastError set', async () => {
    const m = routeMock(() => choice('pet_action', 'eat'));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session, 10);
    const before = session.getState().pet?.action;
    const r = await request(app).post('/api/bean/ask');
    expect([r.status, r.body.code]).toEqual([502, 'invalid_model_output']);
    expect(session.getState().pet?.action).toBe(before);
    expect(session.getState().bean.lastError).toMatch(/not usable/);
    expect(session.getState().api.decisions.state).toBe('unavailable');
  });

  it('pet rebuilt during an in-flight decision → not applied (stale); concurrent ask → 409', async () => {
    const gate = deferred<Response>();
    const m = routeMock(() => gate.promise);
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session, 10);
    const first = request(app).post('/api/bean/ask').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    const second = await request(app).post('/api/bean/ask');
    expect([second.status, second.body.code]).toEqual([409, 'busy']);
    buildPet(session, 10);
    gate.resolve(choice('pet_action', 'wave'));
    const r = await first;
    expect(r.body.decision).toMatchObject({ action: 'wave', applied: false });
    expect(r.body.decision.notAppliedReason).toMatch(/rebuilt or reset/);
    expect(session.getState().pet?.action).not.toBe('wave');
    expect(session.getState().bean.lastDecision).toBeNull();
  });

  it('an old failed decision cannot set the rebuilt pet error', async () => {
    const gate = deferred<Response>();
    const m = routeMock(() => gate.promise);
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session, 10);
    const first = request(app).post('/api/bean/ask').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    buildPet(session, 10);
    gate.resolve(json(400, { error: { message: 'Invalid decision request.' } }));
    await first;
    expect(session.getState().bean.lastError).toBeNull();
  });
});

describe('POST /api/bean/ask — legacy queue (no pet built)', () => {
  it('example decision labelled example; AI management off → not applied', async () => {
    const { app, session } = setup();
    busyQueue(session);
    const r = await request(app).post('/api/bean/ask');
    expect(r.body.decision).toMatchObject({ source: 'example', action: 'call_backup', applied: false });
    expect(r.body.decision.explanation.startsWith(EXAMPLE_PREFIX)).toBe(true);
    expect(r.body.decision.notAppliedReason).toMatch(/AI management is off/);
    expect(session.getState().sim.workers).toHaveLength(1);
  });
  it('AI call_backup with management on → worker added by ai', async () => {
    const m = routeMock(() => choice('bean_action', 'call_backup'));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    busyQueue(session);
    session.setAiManagement(true);
    const r = await request(app).post('/api/bean/ask');
    expect(r.body.decision).toMatchObject({ source: 'ai', applied: true });
    expect(session.getState().sim.workers.map((w) => w.addedBy)).toEqual(['initial', 'ai']);
  });
  it('reset during an in-flight decision → not applied', async () => {
    const gate = deferred<Response>();
    const m = routeMock(() => gate.promise);
    const { app, session } = setup({ key: true, fetch: m.fetch });
    busyQueue(session);
    session.setAiManagement(true);
    const p = request(app).post('/api/bean/ask').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    session.reset();
    gate.resolve(choice('bean_action', 'call_backup'));
    const r = await p;
    expect(r.body.decision.applied).toBe(false);
    expect(session.getState().sim.workers).toHaveLength(1);
  });
  it('both workers on shift → 409 nothing_to_decide without calling the API', async () => {
    const m = routeMock(() => choice('bean_action', 'keep_serving'));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    busyQueue(session);
    session.addWorker('manual');
    const r = await request(app).post('/api/bean/ask');
    expect([r.status, r.body.code]).toEqual([409, 'nothing_to_decide']);
    expect(m.calls).toHaveLength(0);
  });
});

describe('POST /api/bean/image — pet portrait', () => {
  it('503 without a key; 404 for the PNG before generation', async () => {
    const { app } = setup();
    const r = await request(app).post('/api/bean/image');
    expect([r.status, r.body.code]).toEqual([503, 'not_configured']);
    expect((await request(app).get('/api/bean/image.png')).status).toBe(404);
  });
  it('generates once, serves cached bytes, no second request', async () => {
    const m = routeMock(() => json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session);
    const r = await request(app).post('/api/bean/image');
    expect(r.body.image).toMatchObject({ status: 'ready', model: 'gpt-image-2.5-flare' });
    const png = await request(app).get(r.body.image.url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(png.headers['content-type']).toMatch(/image\/png/);
    expect(png.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(png.body, PNG)).toBe(0);
    await request(app).post('/api/bean/image');
    expect(m.calls).toHaveLength(1);
    expect(session.getState().bean.image.status).toBe('ready');
  });
  it('failure → image error state, single attempt', async () => {
    const m = routeMock(() => json(500, {}));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    const r = await request(app).post('/api/bean/image');
    expect(r.status).toBe(502);
    expect(m.calls).toHaveLength(1);
    expect(session.getState().bean.image.status).toBe('error');
  });

  it('discards a portrait completed after the pet was rebuilt', async () => {
    const gate = deferred<Response>();
    let calls = 0;
    const m = routeMock(() => calls++ === 0 ? gate.promise : json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session);
    const first = request(app).post('/api/bean/image').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    session.buildCreation({ mode: 'pet', pet: { ...DEFAULT_PET, name: 'Nova', bodyColor: '#AA33DD' }, source: 'manual' });
    gate.resolve(json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const stale = await first;
    expect([stale.status, stale.body.code]).toEqual([409, 'stale_creation']);
    expect(session.getState().bean.image.status).toBe('none');
    expect((await request(app).get('/api/bean/image.png')).status).toBe(404);
    await request(app).post('/api/bean/image').expect(200);
    expect(m.calls).toHaveLength(2);
  });

  it('does not put an old portrait failure on a rebuilt pet', async () => {
    const gate = deferred<Response>();
    const m = routeMock(() => gate.promise);
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session);
    const first = request(app).post('/api/bean/image').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    buildPet(session);
    gate.resolve(json(400, { error: { message: 'Invalid image request.' } }));
    await first;
    expect(session.getState().bean.image.status).toBe('none');
  });

  it('reset during portrait generation discards the result and clears loading', async () => {
    const gate = deferred<Response>();
    const m = routeMock(() => gate.promise);
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session);
    const first = request(app).post('/api/bean/image').then((r) => r);
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    session.reset();
    gate.resolve(json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const stale = await first;
    expect([stale.status, stale.body.code]).toEqual([409, 'stale_creation']);
    expect(session.getState().bean.image.status).toBe('none');
  });

  it('hides the previous cached portrait after a different pet is built', async () => {
    const m = routeMock(() => json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const { app, session } = setup({ key: true, fetch: m.fetch });
    buildPet(session);
    await request(app).post('/api/bean/image').expect(200);
    session.buildCreation({ mode: 'pet', pet: { ...DEFAULT_PET, name: 'Nova' }, source: 'manual' });
    expect(session.getState().bean.image.status).toBe('none');
    await request(app).get('/api/bean/image.png?v=1').expect(404);
  });
});
