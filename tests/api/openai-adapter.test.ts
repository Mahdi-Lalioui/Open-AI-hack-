/**
 * OpenAI adapter tests — mocked fetch only (no network, no real key).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIAdapter, OpenAIError } from '../../server/openai';
import type { AppConfig } from '../../server/config';
import type { QueueFacts } from '../../server/beanRules';
import { EXAMPLE_PREFIX, exampleDecision } from '../../server/beanRules';
import { VISION_JSON_SCHEMA } from '../../server/openai/vision';

const KEY = 'sk-test-SECRET123';
const BASE = 'https://api.example.test/v1';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body')]);

function cfg(over: Partial<AppConfig['openai']> = {}): AppConfig['openai'] {
  return {
    apiKey: KEY,
    baseUrl: BASE,
    visionModel: 'gpt-6-astra',
    decisionsModel: 'gpt-6-luna',
    imageModel: 'gpt-image-2.5-flare',
    visionTimeoutMs: 45_000,
    decisionsTimeoutMs: 20_000,
    imageTimeoutMs: 90_000,
    ...over,
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type Step = Response | Error | ((init: RequestInit) => Promise<Response>);

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, any>;
}

function mockFetch(steps: Step[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? '{}')) });
    const step = steps.shift();
    if (!step) throw new Error('unexpected extra fetch call');
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(init ?? {});
    return step;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const noSleep = { sleep: async () => {} };

function responsesBody(payload: unknown) {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
      },
    ],
  };
}

const goodSketch = {
  inScope: true,
  graph: {
    nodes: [
      { id: 'a', kind: 'source', label: 'Customers', x: 0.15, y: 0.5 },
      { id: 'b', kind: 'service', label: 'Barista', x: 0.5, y: 0.45 },
      { id: 'c', kind: 'sink', label: 'Pickup', x: 0.85, y: 0.52 },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
  },
  serviceTimeSec: null,
  workers: null,
  arrivalIntervalSec: null,
  uncertainties: [],
};

function facts(over: Partial<QueueFacts> = {}): QueueFacts {
  return {
    waiting: 5,
    inService: 1,
    completed: 3,
    avgWaitSec: 80,
    workers: 1,
    maxWorkers: 2,
    simTimeSec: 240,
    arrivalIntervalSec: 30,
    serviceTimeSec: 50,
    serviceLabel: 'Barista',
    ...over,
  };
}

function decisionBody(answer: Record<string, unknown>) {
  return { model: 'gpt-6-luna', answers: [answer], usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } };
}

async function catchErr(p: Promise<unknown>): Promise<OpenAIError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OpenAIError);
    return e as OpenAIError;
  }
  throw new Error('expected a rejection');
}

function expectNoSecret(value: unknown) {
  const texts = [
    String(value),
    JSON.stringify(value),
    (value as Error)?.message ?? '',
    (value as Error)?.stack ?? '',
  ];
  for (const t of texts) {
    expect(t).not.toContain(KEY);
    expect(t).not.toContain('SECRET123');
  }
}

describe('initialStatus / configuration', () => {
  it('reports not_configured for every kind without a key', () => {
    const a = createOpenAIAdapter(cfg({ apiKey: null }));
    expect(a.configured).toBe(false);
    const s = a.initialStatus();
    for (const kind of ['vision', 'decisions', 'image'] as const) {
      expect(s[kind].state).toBe('not_configured');
      expect(s[kind].message).toBe('No OPENAI_API_KEY set — example mode.');
    }
    expect(s.vision.model).toBe('gpt-6-astra');
    expect(s.decisions.model).toBe('gpt-6-luna');
    expect(s.image.model).toBe('gpt-image-2.5-flare');
  });

  it('reports ready with a key, and never exposes the key', () => {
    const a = createOpenAIAdapter(cfg());
    const s = a.initialStatus();
    expect(s.vision.state).toBe('ready');
    expect(s.vision.message).toBe('Key configured; not called yet.');
    expectNoSecret(s);
    expectNoSecret(a);
  });

  it('absent key → not_configured errors without any network call', async () => {
    const m = mockFetch([]);
    const a = createOpenAIAdapter(cfg({ apiKey: null }), { fetch: m.fetch });
    expect((await catchErr(a.analyzeSketch(PNG, 'image/png'))).code).toBe('not_configured');
    expect((await catchErr(a.decide(facts()))).code).toBe('not_configured');
    expect((await catchErr(a.generateBeanImage())).code).toBe('not_configured');
    expect(m.calls).toHaveLength(0);
  });
});

describe('vision (Responses API + Structured Outputs)', () => {
  it('sends a strict json_schema request with a base64 data-URL image', async () => {
    const m = mockFetch([json(200, responsesBody(goodSketch))]);
    const a = createOpenAIAdapter(cfg(), { fetch: m.fetch });
    await a.analyzeSketch(PNG, 'image/png');
    expect(m.calls).toHaveLength(1);
    const { url, init, body } = m.calls[0];
    expect(url).toBe(`${BASE}/responses`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(body.model).toBe('gpt-6-astra');
    expect(typeof body.instructions).toBe('string');
    expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'sketch_reading', strict: true });
    expect(body.text.format.schema).toEqual(VISION_JSON_SCHEMA);
    const content = body.input[0].content;
    expect(body.input[0].role).toBe('user');
    expect(content[0].type).toBe('input_text');
    expect(content[1].type).toBe('input_image');
    expect(content[1].image_url).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(body.store).toBe(false);
  });

  it('strict schema: every object lists all properties as required and disallows extras', () => {
    const visit = (s: any) => {
      if (s && typeof s === 'object') {
        if (s.type === 'object') {
          expect(s.additionalProperties).toBe(false);
          expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
        }
        for (const v of Object.values(s)) visit(v);
      }
    };
    visit(VISION_JSON_SCHEMA);
  });

  it('turns valid output into a RecognizedSketch (ids normalised, nulls preserved)', async () => {
    const m = mockFetch([json(200, responsesBody(goodSketch))]);
    const a = createOpenAIAdapter(cfg(), { fetch: m.fetch });
    const sketch = await a.analyzeSketch(PNG, 'image/png');
    expect(sketch.inScope).toBe(true);
    expect(sketch.graph.nodes.map((n) => [n.id, n.kind, n.label])).toEqual([
      ['n1', 'source', 'Customers'],
      ['n2', 'service', 'Barista'],
      ['n3', 'sink', 'Pickup'],
    ]);
    expect(sketch.graph.edges).toEqual([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);
    expect(sketch.serviceTimeSec).toBeNull();
    expect(sketch.workers).toBeNull();
    expect(sketch.arrivalIntervalSec).toBeNull();
    expect(sketch.uncertainties).toEqual([]);
  });

  it('keeps numbers only when the model reports them as written', async () => {
    const written = { ...goodSketch, serviceTimeSec: 50, workers: 2, arrivalIntervalSec: null, uncertainties: ['Arrow 2 is faint.'] };
    const m = mockFetch([json(200, responsesBody(written))]);
    const sketch = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png');
    expect(sketch.serviceTimeSec).toBe(50);
    expect(sketch.workers).toBe(2);
    expect(sketch.arrivalIntervalSec).toBeNull();
    expect(sketch.uncertainties).toContain('Arrow 2 is faint.');
  });

  it('keeps an in-scope sketch that fails the chain check, listing the problems', async () => {
    const broken = { ...goodSketch, graph: { ...goodSketch.graph, edges: [{ from: 'a', to: 'b' }] } };
    const m = mockFetch([json(200, responsesBody(broken))]);
    const sketch = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png');
    expect(sketch.graph.nodes).toHaveLength(3);
    expect(sketch.uncertainties.some((u) => u.includes('Missing arrow Barista → Pickup'))).toBe(true);
  });

  it('shortens over-long labels and notes it', async () => {
    const long = structuredClone(goodSketch);
    long.graph.nodes[1].label = 'Barista making very elaborate oat milk lattes';
    const m = mockFetch([json(200, responsesBody(long))]);
    const sketch = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png');
    expect(sketch.graph.nodes[1].label.length).toBeLessThanOrEqual(32);
    expect(sketch.uncertainties.some((u) => u.startsWith('Shortened the label'))).toBe(true);
  });

  it('accepts an out-of-scope answer with no boxes', async () => {
    const none = { ...goodSketch, inScope: false, graph: { nodes: [], edges: [] }, uncertainties: ['This is a photo of a cat.'] };
    const m = mockFetch([json(200, responsesBody(none))]);
    const sketch = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png');
    expect(sketch.inScope).toBe(false);
    expect(sketch.graph.nodes).toEqual([]);
  });

  it('rejects non-JSON output with invalid_model_output', async () => {
    const m = mockFetch([json(200, responsesBody('Sure! Here are the boxes: Customers, Barista'))]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('invalid_model_output');
    expect(err.httpStatus).toBe(502);
  });

  it('rejects schema-violating output with invalid_model_output', async () => {
    const bad = [
      { ...goodSketch, graph: { nodes: [{ id: 'a', kind: 'queue', label: 'X', x: 0, y: 0 }], edges: [] } },
      { inScope: true, uncertainties: [] },
      { ...goodSketch, serviceTimeSec: 'fifty' },
    ];
    for (const payload of bad) {
      const m = mockFetch([json(200, responsesBody(payload))]);
      const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png'));
      expect(err.code).toBe('invalid_model_output');
    }
  });

  it('handles refusals and incomplete responses', async () => {
    const refusal = {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }],
    };
    const m1 = mockFetch([json(200, refusal)]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m1.fetch }).analyzeSketch(PNG, 'image/png'))).code).toBe('model_refused');

    const incomplete = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] };
    const m2 = mockFetch([json(200, incomplete)]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m2.fetch }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('invalid_model_output');
    expect(err.message).toContain('cut off');
  });
});

describe('HTTP error mapping', () => {
  const cases: Array<{ status: number; body: unknown; headers?: Record<string, string>; code: string; expect: RegExp[] }> = [
    {
      status: 401,
      body: { error: { message: `Incorrect API key provided: ${KEY}.`, type: 'invalid_request_error', code: 'invalid_api_key' } },
      code: 'invalid_key',
      expect: [/401/, /OPENAI_API_KEY/],
    },
    {
      status: 403,
      body: { error: { message: 'Your organization must be verified to use the model.', code: null } },
      code: 'model_access',
      expect: [/403/, /verification/i, /gpt-6-astra/, /OPENAI_VISION_MODEL/],
    },
    {
      status: 404,
      body: { error: { message: 'The model `gpt-6-astra` does not exist', code: 'model_not_found' } },
      code: 'model_not_found',
      expect: [/404/, /gpt-6-astra/, /OPENAI_VISION_MODEL/],
    },
    {
      status: 429,
      body: { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'credit_balance_exhausted' } },
      code: 'quota_exceeded',
      expect: [/429/, /credits/i],
    },
    {
      status: 429,
      body: { error: { message: 'Rate limit reached', type: 'rate_limit_error', code: 'rate_limit_exceeded' } },
      headers: { 'retry-after': '30' },
      code: 'rate_limited',
      expect: [/429/, /rate limit/i, /30 s/],
    },
    { status: 500, body: { error: { message: 'Internal error' } }, code: 'upstream_error', expect: [/500/, /Try again/] },
    { status: 503, body: { error: { code: 'server_is_overloaded' } }, code: 'upstream_error', expect: [/503/, /overloaded/] },
    {
      status: 400,
      body: { error: { message: `Invalid schema (key was ${KEY}, header Bearer ${KEY})`, code: 'invalid_json_schema' } },
      code: 'bad_request',
      expect: [/400/, /invalid_json_schema/],
    },
  ];

  for (const c of cases) {
    it(`maps ${c.status}${c.headers ? ' with retry-after' : ''} → ${c.code}`, async () => {
      // 5xx are retried once, so provide the same answer twice.
      const m = mockFetch([json(c.status, c.body, c.headers), json(c.status, c.body, c.headers)]);
      const a = createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep });
      const err = await catchErr(a.analyzeSketch(PNG, 'image/png'));
      expect(err.code).toBe(c.code);
      for (const re of c.expect) expect(err.message).toMatch(re);
      expect(err.upstreamStatus).toBe(c.status);
      expectNoSecret(err);
    });
  }

  it('names the right env var per integration (decisions 404)', async () => {
    const m = mockFetch([json(404, { error: { code: 'model_not_found' } })]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).decide(facts()));
    expect(err.message).toContain('gpt-6-luna');
    expect(err.message).toContain('OPENAI_DECISIONS_MODEL');
  });

  it('maps a timeout to an actionable message', async () => {
    const hanging = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error(`aborted ${KEY}`), { name: 'AbortError' })));
      });
    const m = mockFetch([hanging, hanging]);
    const a = createOpenAIAdapter(cfg({ visionTimeoutMs: 40 }), { fetch: m.fetch, ...noSleep });
    const err = await catchErr(a.analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('timeout');
    expect(err.httpStatus).toBe(504);
    expect(err.message).toContain('OPENAI_VISION_TIMEOUT_MS');
    expect(m.calls).toHaveLength(1);
    expectNoSecret(err);
  });

  it('maps a network failure without leaking the raw error', async () => {
    const m = mockFetch([new TypeError(`fetch failed for Bearer ${KEY}`), new TypeError(`fetch failed ${KEY}`)]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('network');
    expect(err.message).toMatch(/network/i);
    expectNoSecret(err);
  });

  it('maps non-JSON success bodies to invalid_model_output', async () => {
    const m = mockFetch([new Response('<html>proxy</html>', { status: 200 })]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('invalid_model_output');
  });
});

describe('retry policy', () => {
  it('retries a 5xx once and succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const m = mockFetch([json(500, { error: {} }), json(200, responsesBody(goodSketch))]);
    const sketch = await createOpenAIAdapter(cfg(), { fetch: m.fetch, sleep }).analyzeSketch(PNG, 'image/png');
    expect(sketch.inScope).toBe(true);
    expect(m.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('never retries more than once', async () => {
    const m = mockFetch([json(502, {}), json(502, {}), json(200, responsesBody(goodSketch))]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('upstream_error');
    expect(m.calls).toHaveLength(2);
  });

  it('retries a network error once', async () => {
    const m = mockFetch([new TypeError('fetch failed'), json(200, responsesBody(goodSketch))]);
    await createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png');
    expect(m.calls).toHaveLength(2);
  });

  it('retries 429 only when Retry-After ≤ 5 s, waiting that long', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const m = mockFetch([json(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '2' }), json(200, responsesBody(goodSketch))]);
    await createOpenAIAdapter(cfg(), { fetch: m.fetch, sleep }).analyzeSketch(PNG, 'image/png');
    expect(m.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2000);

    const m2 = mockFetch([json(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '30' })]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m2.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png'));
    expect(err.code).toBe('rate_limited');
    expect(m2.calls).toHaveLength(1);

    const m3 = mockFetch([json(429, { error: { code: 'rate_limit_exceeded' } })]);
    await catchErr(createOpenAIAdapter(cfg(), { fetch: m3.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png'));
    expect(m3.calls).toHaveLength(1);
  });

  it('does not retry quota, auth, access, not-found or bad-request errors', async () => {
    for (const [status, body] of [
      [429, { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }],
      [401, {}],
      [403, {}],
      [404, {}],
      [400, {}],
    ] as const) {
      const m = mockFetch([json(status, body, { 'retry-after': '1' }), json(200, responsesBody(goodSketch))]);
      await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep }).analyzeSketch(PNG, 'image/png'));
      expect(m.calls).toHaveLength(1);
    }
  });

  it('never retries image generation (5xx, network, 429)', async () => {
    for (const step of [
      json(500, {}),
      new TypeError('fetch failed'),
      json(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '1' }),
    ]) {
      const m = mockFetch([step, json(200, { data: [{ b64_json: PNG.toString('base64') }] })]);
      await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch, ...noSleep }).generateBeanImage());
      expect(m.calls).toHaveLength(1);
    }
  });
});

describe('decisions (Decisions API, choice question)', () => {
  it('sends a choice question with the queue facts as input_json', async () => {
    const m = mockFetch([json(200, decisionBody({ type: 'choice', name: 'bean_action', choice: 'call_backup', confidence: 0.86, probabilities: [] }))]);
    const a = createOpenAIAdapter(cfg(), { fetch: m.fetch });
    const d = await a.decide(facts());
    expect(d).toMatchObject({ action: 'call_backup', confidence: 0.86, model: 'gpt-6-luna' });
    expect(d.explanation).toContain('5 waiting');
    expect(d.explanation.length).toBeLessThanOrEqual(200);

    const { url, body } = m.calls[0];
    expect(url).toBe(`${BASE}/decisions`);
    expect(body.model).toBe('gpt-6-luna');
    const q = body.questions[0];
    expect(q.type).toBe('choice');
    expect(q.name).toBe('bean_action');
    expect(q.choices.map((c: { value: string }) => c.value)).toEqual(['call_backup', 'keep_serving']);
    const userMsg = body.input.find((i: { role: string }) => i.role === 'user');
    const jsonPart = userMsg.content.find((p: { type: string }) => p.type === 'input_json');
    expect(jsonPart.data).toMatchObject({ waiting: 5, inService: 1, avgWaitSec: 80, workers: 1, maxWorkers: 2, serviceLabel: 'Barista' });
  });

  it('accepts keep_serving', async () => {
    const m = mockFetch([json(200, decisionBody({ type: 'choice', name: 'bean_action', choice: 'keep_serving', confidence: 0.7 }))]);
    const d = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).decide(facts({ waiting: 0 }));
    expect(d.action).toBe('keep_serving');
  });

  it('rejects a choice outside the offered set', async () => {
    for (const choice of ['hire_three_baristas', true, 'CALL_BACKUP']) {
      const m = mockFetch([json(200, decisionBody({ type: 'choice', name: 'bean_action', choice, confidence: 0.9 }))]);
      const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).decide(facts()));
      expect(err.code).toBe('invalid_model_output');
    }
  });

  it('rejects refusals and malformed answers', async () => {
    const m1 = mockFetch([json(200, decisionBody({ type: 'refusal', name: 'bean_action' }))]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m1.fetch }).decide(facts()))).code).toBe('model_refused');
    const m2 = mockFetch([json(200, { answers: [] })]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m2.fetch }).decide(facts()))).code).toBe('invalid_model_output');
    const m3 = mockFetch([json(200, decisionBody({ type: 'predicate', name: 'bean_action', probability: 0.9 }))]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m3.fetch }).decide(facts()))).code).toBe('invalid_model_output');
  });

  it('does not offer call_backup (or call the API) when both workers are on shift', async () => {
    const m = mockFetch([]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).decide(facts({ workers: 2 })));
    expect(err.code).toBe('nothing_to_decide');
    expect(err.httpStatus).toBe(409);
    expect(m.calls).toHaveLength(0);
  });
});

describe('example rule (no AI)', () => {
  it('calls backup when ≥ 3 waiting or avg wait > service time, with one worker', () => {
    expect(exampleDecision(facts({ waiting: 3, avgWaitSec: null })).action).toBe('call_backup');
    expect(exampleDecision(facts({ waiting: 1, avgWaitSec: 60 })).action).toBe('call_backup');
    expect(exampleDecision(facts({ waiting: 2, avgWaitSec: 40 })).action).toBe('keep_serving');
    expect(exampleDecision(facts({ waiting: 9, workers: 2 })).action).toBe('keep_serving');
    expect(exampleDecision(facts()).explanation.startsWith(EXAMPLE_PREFIX)).toBe(true);
  });
});

describe('image generation (Image API)', () => {
  it('requests a transparent PNG and decodes the base64 result', async () => {
    const m = mockFetch([json(200, { created: 1, data: [{ b64_json: PNG.toString('base64') }] })]);
    const r = await createOpenAIAdapter(cfg(), { fetch: m.fetch }).generateBeanImage();
    expect(r.png.equals(PNG)).toBe(true);
    expect(r.model).toBe('gpt-image-2.5-flare');
    const { url, body } = m.calls[0];
    expect(url).toBe(`${BASE}/images/generations`);
    expect(body).toMatchObject({ model: 'gpt-image-2.5-flare', background: 'transparent', output_format: 'png', n: 1 });
    expect(body.prompt).toMatch(/Bean/);
    expect(body.prompt).toMatch(/transparent background/);
    expect(body).not.toHaveProperty('response_format');
  });

  it('rejects missing or non-PNG image data', async () => {
    const m1 = mockFetch([json(200, { data: [] })]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m1.fetch }).generateBeanImage())).code).toBe('invalid_model_output');
    const m2 = mockFetch([json(200, { data: [{ b64_json: Buffer.from('GIF89a....').toString('base64') }] })]);
    expect((await catchErr(createOpenAIAdapter(cfg(), { fetch: m2.fetch }).generateBeanImage())).code).toBe('invalid_model_output');
  });

  it('maps moderation blocks without retrying', async () => {
    const m = mockFetch([json(400, { error: { type: 'image_generation_user_error', code: 'moderation_blocked' } })]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).generateBeanImage());
    expect(err.code).toBe('moderation_blocked');
    expect(m.calls).toHaveLength(1);
  });

  it('maps 403 to the organization verification hint naming the image model', async () => {
    const m = mockFetch([json(403, { error: { message: `org not verified; key ${KEY}` } })]);
    const err = await catchErr(createOpenAIAdapter(cfg(), { fetch: m.fetch }).generateBeanImage());
    expect(err.code).toBe('model_access');
    expect(err.message).toContain('gpt-image-2.5-flare');
    expect(err.message).toContain('OPENAI_IMAGE_MODEL');
    expectNoSecret(err);
  });
});
