import { describe, expect, it } from 'vitest';
import { checkChain, addOrderSchema, buildWorldSchema } from '../../shared/validation';
import { EXAMPLE_GRAPH, exampleBuildInput } from '../../shared/example';
import type { FlowGraph } from '../../shared/types';

const clone = (g: FlowGraph): FlowGraph => structuredClone(g);

describe('checkChain', () => {
  it('accepts the example Customers → Barista → Pickup chain in order', () => {
    const r = checkChain(EXAMPLE_GRAPH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain.map((n) => n.label)).toEqual(['Customers', 'Barista', 'Pickup']);
  });

  it('rejects a missing arrow', () => {
    const g = clone(EXAMPLE_GRAPH);
    g.edges = [{ from: 'n1', to: 'n2' }];
    const r = checkChain(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Missing arrow Barista → Pickup/);
  });

  it('rejects branches, extra steps and two services', () => {
    const branch = clone(EXAMPLE_GRAPH);
    branch.edges.push({ from: 'n1', to: 'n3' });
    expect(checkChain(branch).ok).toBe(false);

    const twoServices = clone(EXAMPLE_GRAPH);
    twoServices.nodes[2].kind = 'service';
    expect(checkChain(twoServices).ok).toBe(false);

    const four = clone(EXAMPLE_GRAPH);
    four.nodes.push({ id: 'n4', kind: 'sink', label: 'Exit', x: 0.9, y: 0.9 });
    expect(checkChain(four).ok).toBe(false);
  });

  it('rejects arrows to unknown steps and duplicate ids', () => {
    const g = clone(EXAMPLE_GRAPH);
    g.edges.push({ from: 'n3', to: 'zz' });
    expect(checkChain(g).ok).toBe(false);
    const d = clone(EXAMPLE_GRAPH);
    d.nodes[1].id = 'n1';
    expect(checkChain(d).ok).toBe(false);
  });
});

describe('schemas', () => {
  it('accepts the example build input and rejects out-of-range positions/labels', () => {
    expect(buildWorldSchema.safeParse(exampleBuildInput()).success).toBe(true);
    const bad = exampleBuildInput();
    bad.graph.nodes[0].x = 1.5;
    expect(buildWorldSchema.safeParse(bad).success).toBe(false);
    const longLabel = exampleBuildInput();
    longLabel.graph.nodes[0].label = 'x'.repeat(33);
    expect(buildWorldSchema.safeParse(longLabel).success).toBe(false);
    const threeWorkers = exampleBuildInput() as unknown as { assumptions: { initialWorkers: number } };
    threeWorkers.assumptions.initialWorkers = 3;
    expect(buildWorldSchema.safeParse(threeWorkers).success).toBe(false);
  });

  it('limits and sanitises guest nicknames and order ids', () => {
    const ok = addOrderSchema.safeParse({ id: 'abcdef123456', origin: 'audience', nickname: '  <Ana>  ' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.nickname).toBe('Ana');
    expect(addOrderSchema.safeParse({ id: 'abcdef123456', origin: 'audience', nickname: 'x'.repeat(25) }).success).toBe(false);
    expect(addOrderSchema.safeParse({ id: 'short', origin: 'audience' }).success).toBe(false);
    expect(addOrderSchema.safeParse({ id: 'abcdef12345/..', origin: 'audience' }).success).toBe(false);
    expect(addOrderSchema.safeParse({ id: 'abcdef123456', origin: 'automatic' }).success).toBe(false);
    const blank = addOrderSchema.safeParse({ id: 'abcdef123456', origin: 'presenter', nickname: '   ' });
    expect(blank.success && blank.data.nickname).toBe(undefined);
  });
});
