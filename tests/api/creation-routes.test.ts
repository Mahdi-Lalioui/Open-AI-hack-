import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { LiveSession } from '../../server/session';
import { createOpenAIAdapter } from '../../server/openai';
import { EXAMPLE_CIRCUIT, EXAMPLE_PET } from '../../shared/creationExamples';

let session: LiveSession;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  const openai = createOpenAIAdapter({
    apiKey: null, baseUrl: 'http://invalid', visionModel: 'v', decisionsModel: 'd', imageModel: 'i',
    visionTimeoutMs: 1000, decisionsTimeoutMs: 1000, imageTimeoutMs: 1000,
  });
  session = new LiveSession({ initialApiStatus: openai.initialStatus(), publicBaseUrl: null });
  app = createApp({ session, openai });
});
afterEach(() => session.dispose());

describe('creation routes', () => {
  it('builds a pet and interacts', async () => {
    const r = await request(app).post('/api/creation').send({ mode: 'pet', pet: EXAMPLE_PET, source: 'example' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, creation: { mode: 'pet', version: 1, pet: { name: 'Pixel' } } });
    const i = await request(app).post('/api/interactions').set('X-Forwarded-For', '5.5.5.5').send({ id: 'api-inter-1', kind: 'play' });
    expect(i.status).toBe(200);
    expect(i.body).toMatchObject({ ok: true, duplicate: false, pet: { action: 'play', counts: { play: 1 } } });
    const dup = await request(app).post('/api/interactions').set('X-Forwarded-For', '5.5.5.5').send({ id: 'api-inter-1', kind: 'play' });
    expect(dup.body.duplicate).toBe(true);
    const lim = await request(app).post('/api/interactions').set('X-Forwarded-For', '5.5.5.5').send({ id: 'api-inter-2', kind: 'feed' });
    expect(lim.status).toBe(429);
    const state = await request(app).get('/api/state');
    expect(state.body.pet.counts.play).toBe(1);
  });

  it('builds a circuit and toggles the switch', async () => {
    await request(app).post('/api/creation').send({ mode: 'circuit', circuit: EXAMPLE_CIRCUIT, source: 'example' }).expect(200);
    const t = await request(app).post('/api/interactions').send({ id: 'api-toggle-1', kind: 'toggle_switch' });
    expect(t.body.circuit.result).toMatchObject({ currentMa: 31.8, ledOn: true });
  });

  it('validates input', async () => {
    const bad = await request(app).post('/api/creation').send({ mode: 'dragon' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('invalid_creation');
    expect((await request(app).post('/api/interactions').send({ id: 'x', kind: 'feed' })).status).toBe(400);
    const none = await request(app).post('/api/interactions').send({ id: 'api-inter-9', kind: 'feed' });
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('no_creation');
  });
});
