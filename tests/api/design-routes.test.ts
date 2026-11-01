/** /api/design with a fake OpenAI at the fetch boundary: no network. */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { loadConfig } from '../../server/config';
import { createOpenAIAdapter } from '../../server/openai';
import { BLUEPRINT_JSON_SCHEMA, createDesignAi } from '../../server/openai/design';
import { renderFrontView } from '../../server/design/preview';
import { refineWithRules, interpretWithRules, RuleError } from '../../server/design/rules';
import { LiveSession } from '../../server/session';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import { validateBlueprint } from '../../shared/blueprint/validate';
import type { DesignBlueprint } from '../../shared/blueprint/types';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAAMBAQAY3Y2wAAAAAElFTkSuQmCC', 'base64');

function organiser(): DesignBlueprint {
  const r = validateBlueprint(DESIGN_TEMPLATES[0].build());
  if (!r.ok) throw new Error('template invalid');
  return r.blueprint;
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const modelSays = (data: unknown) => reply({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });

function appWith(fetchFn?: typeof fetch) {
  const config = loadConfig({ OPENAI_API_KEY: fetchFn ? 'sk-test-key-123456' : '' } as NodeJS.ProcessEnv);
  const session = new LiveSession({ initialApiStatus: createOpenAIAdapter(config.openai).initialStatus(), publicBaseUrl: null });
  const designAi = createDesignAi(config.openai, { fetch: fetchFn ?? ((() => { throw new Error('no network in tests'); }) as unknown as typeof fetch), sleep: async () => undefined });
  return { app: createApp({ session, openai: createOpenAIAdapter(config.openai), designAi }), session };
}

describe('without an API key', () => {
  it('reports status honestly', async () => {
    const { app } = appWith();
    const res = await request(app).get('/api/design/status');
    expect(res.body.ai.configured).toBe(false);
    expect(res.body.liveTest).toBe(true);
    expect(res.body.templates.length).toBe(DESIGN_TEMPLATES.length);
    expect(res.body.formats.map((f: { id: string }) => f.id)).toContain('scad');
  });

  it('loads an example, labelled as an example', async () => {
    const { app } = appWith();
    const res = await request(app).post('/api/design/interpret').send({ templateId: 'planter' });
    expect(res.status).toBe(200);
    expect(res.body.design.source.kind).toBe('example');
    expect(res.body.design.source.label).toMatch(/no AI/);
  });

  it('matches text to a design by rules, labelled no AI, and applies sizes', async () => {
    const { app } = appWith();
    const res = await request(app).post('/api/design/interpret').send({ text: 'a desk organiser 300 mm wide in navy' });
    expect(res.body.design.source.kind).toBe('rules');
    expect(res.body.design.source.label).toMatch(/no AI/);
    expect(res.body.design.blueprint.dimensions.width).toBeCloseTo(300, 0);
    expect(res.body.design.blueprint.materials.some((m: { name: string }) => m.name === 'Navy')).toBe(true);
  });

  it('refuses to pretend it read a sketch', async () => {
    const { app } = appWith();
    const res = await request(app).post('/api/design/interpret').send({ image: { base64: PNG.toString('base64') } });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('not_configured');
  });

  it('says what it cannot design', async () => {
    const { app } = appWith();
    const res = await request(app).post('/api/design/interpret').send({ text: 'a spaceship' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('rules_not_understood');
  });

  it('refines, keeps history, undoes, and retrieves', async () => {
    const { app } = appWith();
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const { id } = body.design;
    const wider = await request(app).post('/api/design/refine').send({ id, instruction: 'make it 50% wider' });
    expect(wider.body.design.blueprint.dimensions.width).toBeCloseTo(360, 0);
    expect(wider.body.design.version).toBe(2);
    expect(wider.body.design.history).toHaveLength(2);
    const undone = await request(app).post(`/api/design/${id}/undo`);
    expect(undone.body.design.blueprint.dimensions.width).toBe(240);
    const got = await request(app).get(`/api/design/${id}`);
    expect(got.body.design.version).toBe(1);
    expect((await request(app).post(`/api/design/${id}/undo`)).status).toBe(409);
  });

  it('a refinement that breaks the design is rejected and the design is kept', async () => {
    const { app } = appWith();
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const { id } = body.design;
    const res = await request(app).post('/api/design/refine').send({ id, instruction: 'walls 500 mm' });
    expect(res.status).toBe(422);
    expect((await request(app).get(`/api/design/${id}`)).body.design.version).toBe(1);
  });

  it('accepts a manual edit only if it validates', async () => {
    const { app } = appWith();
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const { id, blueprint } = body.design;
    const bad = await request(app).post('/api/design/refine').send({ id, blueprint: { ...blueprint, components: [] } });
    expect(bad.status).toBe(422);
    const edited = { ...blueprint, name: 'Renamed' };
    const good = await request(app).post('/api/design/refine').send({ id, blueprint: edited });
    expect(good.body.design.blueprint.name).toBe('Renamed');
    expect(good.body.design.source.kind).toBe('manual');
  });

  it('exports real files with attachment names and rejects unknown formats', async () => {
    const { app } = appWith();
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const { id } = body.design;
    const stl = await request(app).post('/api/design/export').send({ id, format: 'stl' }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(stl.status).toBe(200);
    expect(stl.headers['content-disposition']).toContain('modular-desk-organiser.stl');
    expect((stl.body as Buffer).readUInt32LE(80)).toBeGreaterThan(0);
    expect((await request(app).post('/api/design/export').send({ id, format: 'toString' })).status).toBe(400);
    expect((await request(app).post('/api/design/export').send({ id: 'nope', format: 'stl' })).status).toBe(404);
  });

  it('survives landing on a server instance that never saw the design', async () => {
    const first = appWith();
    const { body } = await request(first.app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const { id, blueprint } = body.design;
    const other = appWith();
    const lost = await request(other.app).post('/api/design/export').send({ id, format: 'scad' });
    expect(lost.status).toBe(404);
    const exported = await request(other.app).post('/api/design/export').send({ id, format: 'scad', current: blueprint });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain('pen_bin_width');
    const third = appWith();
    const refined = await request(third.app).post('/api/design/refine').send({ id, instruction: 'taller', current: blueprint });
    expect(refined.status).toBe(200);
    const fourth = appWith();
    const bad = await request(fourth.app).post('/api/design/export').send({ id, format: 'scad', current: { name: 'not a blueprint' } });
    expect(bad.status).toBe(404);
  });

  it('opens a saved Blueprint, and refuses an invalid one', async () => {
    const { app } = appWith();
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'led_circuit' });
    const opened = await request(app).post('/api/design/interpret').send({ blueprint: body.design.blueprint });
    expect(opened.status).toBe(200);
    expect(opened.body.design.source.kind).toBe('file');
    expect(opened.body.design.blueprint.circuit.components).toHaveLength(4);
    const bad = await request(app).post('/api/design/interpret').send({ blueprint: { name: 'nope' } });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('invalid_blueprint');
  });

  it('treats circuits and pets as ordinary designs, from words too', async () => {
    const { app } = appWith();
    const circuit = await request(app).post('/api/design/interpret').send({ text: 'a simple LED circuit with a switch' });
    expect(circuit.body.design.blueprint.circuit).not.toBeNull();
    const pet = await request(app).post('/api/design/interpret').send({ text: 'a cute pet for my desk' });
    expect(pet.body.design.blueprint.pet).not.toBeNull();
    const refined = await request(app).post('/api/design/refine').send({ id: circuit.body.design.id, instruction: 'use a 1k ohm resistor and a 12 V battery' });
    const parts = refined.body.design.blueprint.circuit.components;
    expect(parts.find((c: { type: string }) => c.type === 'resistor').value).toBe(1000);
    expect(parts.find((c: { type: string }) => c.type === 'battery').value).toBe(12);
    const blue = await request(app).post('/api/design/refine').send({ id: pet.body.design.id, instruction: 'make it blue' });
    expect(blue.body.design.blueprint.pet.bodyColor).toBe('#2F6DB5');
  });
});

describe('with AI (fake OpenAI)', () => {
  it('sends text and image in a strict schema request and stores the validated result', async () => {
    const fetchFn = vi.fn(async () => modelSays({ inScope: true, ...organiser() }));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ text: 'a pen holder', image: { base64: PNG.toString('base64') } });
    expect(res.status).toBe(200);
    expect(res.body.design.source.kind).toBe('ai');
    expect(res.body.design.source.label).toContain('gpt-');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/responses$/);
    const sent = JSON.parse(String(init.body));
    expect(sent.text.format.strict).toBe(true);
    expect(JSON.stringify(sent.input)).toContain('a pen holder');
    expect(JSON.stringify(sent.input)).toContain('data:image/png;base64,');
  });

  it('repairs an invalid answer once, telling the model what was wrong', async () => {
    const broken = { inScope: true, ...organiser() };
    broken.components = broken.components.map((c, i) => (i ? c : { ...c, materialId: 'ghost' }));
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(modelSays(broken))
      .mockResolvedValueOnce(modelSays({ inScope: true, ...organiser() }));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ text: 'organiser' });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[1][1].body)).toContain('missing material');
  });

  it('gives up after one repair: an invalid design is never stored', async () => {
    const broken = { inScope: true, ...organiser(), components: [] };
    const fetchFn = vi.fn(async () => modelSays(broken));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ text: 'organiser' });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('invalid_model_output');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rebuilds a recognised circuit from its spec, whatever parts the model listed', async () => {
    const circuit = { components: [{ id: 'c1', type: 'battery', label: '9V', value: 9, x: 0.2, y: 0.5 }, { id: 'c2', type: 'led', label: 'LED', value: null, x: 0.8, y: 0.5 }], wires: [{ from: 'c1', to: 'c2' }, { from: 'c2', to: 'c1' }] };
    const { app } = appWith((async () => modelSays({ inScope: true, ...organiser(), name: 'Torch circuit', materials: [], components: [], circuit, pet: null })) as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ image: { base64: PNG.toString('base64') } });
    expect(res.status).toBe(200);
    expect(res.body.design.blueprint.name).toBe('Torch circuit');
    expect(res.body.design.blueprint.circuit.components).toHaveLength(2);
    expect(res.body.design.blueprint.components.some((c: { id: string }) => c.id === 'board')).toBe(true);
  });

  it('builds a drawn character from its own parts, and checks it against the drawing', async () => {
    const pet = { name: 'Boxy', bodyShape: 'round', bodyColor: '#112233', accentColor: '#445566', eyeCount: 2, eyeStyle: 'round', ears: 'none', legs: 0, tail: 'none', mouth: 'smile', extras: [] };
    const drawn = { ...organiser(), name: 'Boxy', pet, circuit: null, observations: ['A square body with a W mouth'], inScope: true };
    const fetchFn = vi.fn(async () => modelSays(drawn));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ image: { base64: PNG.toString('base64') } });
    expect(res.status).toBe(200);
    expect(res.body.design.blueprint.customModel).toBe(true);
    expect(res.body.design.blueprint.components.some((c: { id: string }) => c.id === 'pen_bin')).toBe(true);
    expect(res.body.design.blueprint.pet.name).toBe('Boxy');
    // The second request shows the model both its drawing and a real render of its own result.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const compare = String((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body);
    expect(compare.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(compare).toContain('Compare the two pictures');
  });

  it('keeps the first design if the check against the drawing fails', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(modelSays({ inScope: true, ...organiser() }))
      .mockResolvedValue(reply({ error: { message: 'overloaded' } }, 400));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ image: { base64: PNG.toString('base64') } });
    expect(res.status).toBe(200);
    expect(res.body.design.blueprint.name).toBe('Modular Desk Organiser');
  });

  it('does not run the check when there is no drawing', async () => {
    const fetchFn = vi.fn(async () => modelSays({ inScope: true, ...organiser() }));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    await request(app).post('/api/design/interpret').send({ text: 'an organiser' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports an out-of-scope request', async () => {
    const { app } = appWith((async () => modelSays({ inScope: false, ...organiser() })) as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ text: 'write me a poem' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('out_of_scope');
  });

  it('never leaks the key in an auth failure and keeps the design', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(reply({ error: { message: 'bad key sk-test-key-123456' } }, 401));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/interpret').send({ text: 'organiser' });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('sk-test');
  });

  it('refine sends the current blueprint; engine=rules skips the AI', async () => {
    const fetchFn = vi.fn(async () => {
      const next = organiser();
      next.name = 'AI Renamed';
      return modelSays({ inScope: true, ...next });
    });
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const { body } = await request(app).post('/api/design/interpret').send({ templateId: 'desk_organiser' });
    const res = await request(app).post('/api/design/refine').send({ id: body.design.id, instruction: 'rename it' });
    expect(res.body.design.blueprint.name).toBe('AI Renamed');
    expect(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain('pen_bin');
    fetchFn.mockClear();
    const rules = await request(app).post('/api/design/refine').send({ id: body.design.id, instruction: 'taller', engine: 'rules' });
    expect(rules.body.design.source.kind).toBe('rules');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('transcribes audio', async () => {
    const fetchFn = vi.fn(async () => reply({ text: ' make it taller ' }));
    const { app } = appWith(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/design/transcribe').set('Content-Type', 'audio/webm').send(Buffer.from('fake-audio'));
    expect(res.body.text).toBe('make it taller');
    expect(String((fetchFn.mock.calls[0] as unknown as [string])[0])).toMatch(/audio\/transcriptions$/);
  });
});

describe('schema', () => {
  it('meets the strict mode rules at every level', () => {
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect(new Set(o.required as string[])).toEqual(new Set(Object.keys(o.properties as object)));
      }
      Object.values(o).forEach(walk);
    };
    walk(BLUEPRINT_JSON_SCHEMA);
  });
});

describe('front view render', () => {
  it('is a real PNG that shows the design and its colour', async () => {
    const png = renderFrontView(organiser());
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(512);
    const { inflateSync } = await import('node:zlib');
    let at = 8;
    const parts: Buffer[] = [];
    while (at < png.length) {
      const length = png.readUInt32BE(at);
      if (png.toString('ascii', at + 4, at + 8) === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length));
      at += 12 + length;
    }
    const pixels = inflateSync(Buffer.concat(parts));
    let drawn = 0;
    for (let i = 0; i < pixels.length; i += 3) if (pixels[i] !== 255) drawn++;
    expect(drawn).toBeGreaterThan(5000);
  });
});

describe('rules', () => {
  it('handles the documented vocabulary', () => {
    const bp = organiser();
    expect(refineWithRules(bp, 'make it 300 mm wide').notes.join()).toContain('300 mm');
    expect(refineWithRules(bp, 'make the tray blue').blueprint.materials.some((m) => m.name === 'Blue')).toBe(true);
    expect(refineWithRules(bp, 'remove the tray').blueprint.components.some((c) => c.id === 'tray')).toBe(false);
    expect(refineWithRules(bp, 'walls 3 mm').blueprint.components.find((c) => c.id === 'pen_bin')?.params.wall).toBe(3);
    expect(refineWithRules(bp, 'add another cup').blueprint.components.length).toBe(bp.components.length + 1);
    expect(validateBlueprint(refineWithRules(bp, 'add another cup').blueprint).ok).toBe(true);
  });
  it('colouring one part leaves parts that share its material alone', () => {
    const r = refineWithRules(organiser(), 'make the tray blue').blueprint;
    expect(r.components.find((c) => c.id === 'tray')?.materialId).toBe('m_blue');
    expect(r.components.find((c) => c.id === 'pen_bin')?.materialId).toBe('teal');
  });
  it('rejects what it does not understand', () => {
    expect(() => refineWithRules(organiser(), 'make it more elegant')).toThrow(RuleError);
    expect(() => interpretWithRules('a spaceship')).toThrow(RuleError);
  });
  it('finds a design from words', () => {
    expect(interpretWithRules('I need a nightstand').blueprint.name).toBe('Bedside Table with Drawer');
    expect(interpretWithRules('case for my raspberry pi').blueprint.name).toBe('Single-Board Computer Case');
  });
});
