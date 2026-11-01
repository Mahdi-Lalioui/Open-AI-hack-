/** Pivot: pet/circuit vision, pet decisions, pet portrait, mocked fetch only. */
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIAdapter, OpenAIError } from '../../server/openai';
import type { AppConfig } from '../../server/config';
import { PET_JSON_SCHEMA, CIRCUIT_JSON_SCHEMA } from '../../server/openai/creation';
import { allowedPetActions, examplePetDecision, PET_EXAMPLE_PREFIX, type PetFacts } from '../../server/beanRules';
import { DEFAULT_PET } from '../../shared/creations';

const KEY = 'sk-test-SECRET123';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);
const cfg: AppConfig['openai'] = {
  apiKey: KEY, baseUrl: 'https://api.example.test/v1', visionModel: 'gpt-6-astra', decisionsModel: 'gpt-6-luna',
  imageModel: 'gpt-image-2.5-flare', visionTimeoutMs: 45000, decisionsTimeoutMs: 20000, imageTimeoutMs: 90000,
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const out = (p: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(p) }] }] });

function mock(...responses: Response[]) {
  const bodies: any[] = [];
  const urls: string[] = [];
  const fetch = vi.fn(async (url: any, init?: RequestInit) => {
    urls.push(String(url));
    bodies.push(JSON.parse(String(init?.body)));
    const r = responses.shift();
    if (!r) throw new Error('extra call');
    return r;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, bodies, urls };
}
async function rejects(p: Promise<unknown>): Promise<OpenAIError> {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(OpenAIError); return e as OpenAIError; }
  throw new Error('expected rejection');
}
const facts = (o: Partial<PetFacts> = {}): PetFacts => ({
  name: 'Pixel', hunger: 20, happiness: 70, energy: 80, currentAction: 'idle',
  recentInteractions: { feed: 0, pet: 2, play: 1 }, lastGuest: null, ...o,
});

const petOut = { inScope: true, pet: { ...DEFAULT_PET, bodyColor: '#1f8a84' }, uncertainties: ['Name was invented.'] };
const circuitOut = {
  inScope: true,
  circuit: {
    components: [
      { id: 'c1', type: 'battery', label: '9V', value: 9, x: 0.15, y: 0.5 },
      { id: 'c2', type: 'switch', label: 'switch', value: null, x: 0.5, y: 0.2 },
      { id: 'c3', type: 'resistor', label: '220Ω', value: 220, x: 0.8, y: 0.6 },
      { id: 'c4', type: 'led', label: 'LED', value: null, x: 0.5, y: 0.8 },
    ],
    wires: [{ from: 'c1', to: 'c2' }, { from: 'c2', to: 'c3' }, { from: 'c3', to: 'c4' }, { from: 'c4', to: 'c1' }, { from: 'c4', to: 'zz' }],
  },
  uncertainties: [],
};

describe('creation vision', () => {
  it('pet: strict schema with exact enums + hex pattern; validated PetSpec', async () => {
    const m = mock(json(200, out(petOut)));
    const c = await createOpenAIAdapter(cfg, { fetch: m.fetch }).analyzeCreation(PNG, 'image/png', 'pet');
    expect(c).toMatchObject({ mode: 'pet', inScope: true, circuit: null });
    expect(c.pet?.bodyColor).toBe('#1F8A84');
    const f = m.bodies[0].text.format;
    expect(f).toMatchObject({ type: 'json_schema', strict: true, name: 'pet_reading' });
    expect(f.schema).toEqual(PET_JSON_SCHEMA);
    const p = (PET_JSON_SCHEMA as any).properties.pet.properties;
    expect(p.bodyShape.enum).toEqual(['round', 'oval', 'bean', 'blob', 'tall']);
    expect(p.ears.enum).toEqual(['none', 'pointy', 'round', 'floppy', 'antenna']);
    expect(p.bodyColor.pattern).toBe('^#[0-9A-Fa-f]{6}$');
    expect(m.urls[0]).toMatch(/\/responses$/);
  });

  it('pet: rejects enum violations / bad colors / non-JSON', async () => {
    for (const bad of [
      out({ ...petOut, pet: { ...DEFAULT_PET, ears: 'wings' } }),
      out({ ...petOut, pet: { ...DEFAULT_PET, bodyColor: 'teal' } }),
      out({ ...petOut, pet: { ...DEFAULT_PET, legs: 3 } }),
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'a cute cat' }] }] },
    ]) {
      const m = mock(json(200, bad));
      expect((await rejects(createOpenAIAdapter(cfg, { fetch: m.fetch }).analyzeCreation(PNG, 'image/png', 'pet'))).code).toBe('invalid_model_output');
    }
  });

  it('circuit: values stay null unless written; dangling wires dropped', async () => {
    const m = mock(json(200, out(circuitOut)));
    const c = await createOpenAIAdapter(cfg, { fetch: m.fetch }).analyzeCreation(PNG, 'image/png', 'circuit');
    expect(c.mode).toBe('circuit');
    expect(c.circuit?.components.map((x) => x.value)).toEqual([9, null, 220, null]);
    expect(c.circuit?.wires).toHaveLength(4);
    expect(c.uncertainties.join(' ')).toMatch(/Ignored wires/);
    expect(m.bodies[0].text.format.schema).toEqual(CIRCUIT_JSON_SCHEMA);
  });

  it('circuit: unknown component type rejected', async () => {
    const bad = structuredClone(circuitOut) as any;
    bad.circuit.components[0].type = 'capacitor';
    const m = mock(json(200, out(bad)));
    expect((await rejects(createOpenAIAdapter(cfg, { fetch: m.fetch }).analyzeCreation(PNG, 'image/png', 'circuit'))).code).toBe('invalid_model_output');
  });
});

describe('pet decisions', () => {
  it('allowed actions follow the needs rules', () => {
    expect(allowedPetActions(facts())).toEqual(['play', 'dance', 'wave']);
    expect(allowedPetActions(facts({ hunger: 41 }))).toContain('eat');
    expect(allowedPetActions(facts({ energy: 39 }))).toContain('sleep');
    expect(allowedPetActions(facts({ hunger: 40, energy: 40 }))).not.toContain('eat');
  });

  it('sends only the allowed choices and accepts one of them', async () => {
    const m = mock(json(200, { answers: [{ type: 'choice', name: 'pet_action', choice: 'eat', confidence: 0.9, probabilities: [] }] }));
    const d = await createOpenAIAdapter(cfg, { fetch: m.fetch }).decidePet(facts({ hunger: 80 }));
    expect(d.action).toBe('eat');
    expect(m.urls[0]).toMatch(/\/decisions$/);
    const q = m.bodies[0].questions[0];
    expect(q.type).toBe('choice');
    expect(q.choices.map((c: any) => c.value)).toEqual(['eat', 'play', 'dance', 'wave']);
    expect(m.bodies[0].input[1].content[1]).toMatchObject({ type: 'input_json', data: { hunger: 80 } });
  });

  it('rejects a choice that is not allowed (eat when not hungry)', async () => {
    const m = mock(json(200, { answers: [{ type: 'choice', name: 'pet_action', choice: 'eat', confidence: 0.9 }] }));
    expect((await rejects(createOpenAIAdapter(cfg, { fetch: m.fetch }).decidePet(facts()))).code).toBe('invalid_model_output');
  });

  it('example rule is deterministic and labelled', () => {
    expect(examplePetDecision(facts({ hunger: 90 })).action).toBe('eat');
    expect(examplePetDecision(facts({ energy: 10 })).action).toBe('sleep');
    const d = examplePetDecision(facts());
    expect(allowedPetActions(facts())).toContain(d.action);
    expect(d.explanation.startsWith(PET_EXAMPLE_PREFIX)).toBe(true);
  });
});

describe('pet portrait', () => {
  it('builds the prompt from the parts; transparent PNG; never retried', async () => {
    const m = mock(json(500, {}), json(200, { data: [{ b64_json: PNG.toString('base64') }] }));
    const err = await rejects(createOpenAIAdapter(cfg, { fetch: m.fetch, sleep: async () => {} }).generatePetImage(DEFAULT_PET));
    expect(err.code).toBe('upstream_error');
    expect(m.bodies).toHaveLength(1);
    const b = m.bodies[0];
    expect(b).toMatchObject({ background: 'transparent', output_format: 'png' });
    expect(b.prompt).toMatch(/2D/);
    expect(b.prompt).toMatch(/Pixel/);
    expect(b.prompt).toMatch(/pointy ears/);
    expect(b.prompt).toMatch(/#1F8A84/);
    expect(JSON.stringify(err)).not.toContain('SECRET123');
  });
});
