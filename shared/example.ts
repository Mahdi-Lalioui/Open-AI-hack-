/** Built-in example world. OWNER: lead. No image analysis is involved. */
import type { BuildWorldInput, FlowGraph } from './types';
import { DEFAULT_ASSUMPTIONS } from './types';

export const EXAMPLE_LABEL = 'Example: no image analysis used';

export const EXAMPLE_GRAPH: FlowGraph = {
  nodes: [
    { id: 'n1', kind: 'source', label: 'Customers', x: 0.16, y: 0.5 },
    { id: 'n2', kind: 'service', label: 'Barista', x: 0.5, y: 0.46 },
    { id: 'n3', kind: 'sink', label: 'Pickup', x: 0.84, y: 0.52 },
  ],
  edges: [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
  ],
};

export const EXAMPLE_IMAGE_URL = '/example-sketch.png';

export function exampleBuildInput(): BuildWorldInput {
  return {
    graph: structuredClone(EXAMPLE_GRAPH),
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    source: 'example',
  };
}
