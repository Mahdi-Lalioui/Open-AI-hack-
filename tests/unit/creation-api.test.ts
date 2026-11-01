// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('guest browser identity', () => {
  it('adds one persistent browser identity to different interaction requests and retries', async () => {
    const bodies: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const { sendInteraction } = await import('../../src/lib/creationApi');
    await sendInteraction({ id: 'interaction-001', kind: 'feed' });
    await sendInteraction({ id: 'interaction-002', kind: 'play' });
    vi.resetModules();
    const reloaded = await import('../../src/lib/creationApi');
    await reloaded.sendInteraction({ id: 'interaction-001', kind: 'feed' });
    expect(bodies[0].clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(bodies.map((b) => b.clientId)).toEqual([bodies[0].clientId, bodies[0].clientId, bodies[0].clientId]);
    expect(bodies.map((b) => b.id)).toEqual(['interaction-001', 'interaction-002', 'interaction-001']);
  });
});
