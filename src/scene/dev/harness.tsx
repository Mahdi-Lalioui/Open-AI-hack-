/** Dev-only harness: renders World with fake states. Open /src/scene/dev/harness.html?mode=pet|circuit|empty */
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { DEFAULT_PET, type CircuitSpec, type PetActionName } from '../../../shared/creations';
import type { PublicState } from '../../../shared/types';
import { World } from '../World';
import type { StationId } from '../types';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'pet';
const action = (q.get('action') ?? 'idle') as PetActionName;
const closed = q.get('closed') === '1';

const circuit: CircuitSpec = {
  components: [
    { id: 'b', type: 'battery', label: 'Battery', value: 9, x: 0.1, y: 0.5 },
    { id: 's', type: 'switch', label: 'Switch', value: null, x: 0.4, y: 0.1 },
    { id: 'r', type: 'resistor', label: 'Resistor', value: 470, x: 0.75, y: 0.15 },
    { id: 'l', type: 'led', label: 'LED', value: 2, x: 0.85, y: 0.85 },
  ],
  wires: [
    { from: 'b', to: 's' },
    { from: 's', to: 'r' },
    { from: 'r', to: 'l' },
    { from: 'l', to: 'b' },
  ],
};

const state = {
  serverId: 'dev',
  world: null,
  sim: { time: 0, running: false, speed: 1, epoch: 0, workers: [], orders: [], metrics: { submitted: 0, waiting: 0, inService: 0, completed: 0, avgWaitSec: null, workers: 0, simTimeSec: 0 }, nextAutoArrival: null, started: false },
  bean: { thinking: false, aiManagement: false, lastDecision: null, lastError: null, image: q.get('img') ? { status: 'ready', url: q.get('img')! } : { status: 'none' } },
  api: {} as PublicState['api'],
  publicBaseUrl: null,
  creation: mode === 'empty' ? null : { mode, version: 1, source: 'example', pet: { ...DEFAULT_PET, extras: ['spots', 'hat'] }, circuit },
  pet: { hunger: 30, happiness: 80, energy: 70, action, actionUntil: 0, counts: { feed: 0, pet: 0, play: 0 }, lastBy: null },
  circuit: { result: { valid: true, closedLoop: closed, switchClosed: closed, currentMa: closed ? 14.9 : 0, ledOn: closed, brightness: closed ? 0.8 : 0, message: closed ? 'LED on: 14.9 mA through 470 Ω' : 'Switch open: no current', warnings: [] } },
} as unknown as PublicState;

function App() {
  const [sel, setSel] = useState<StationId | null>(null);
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <World state={state} selected={sel} onSelect={setSel} cameraCommand={null} reducedMotion={q.get('rm') === '1'} fallback={<p>No WebGL</p>} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
