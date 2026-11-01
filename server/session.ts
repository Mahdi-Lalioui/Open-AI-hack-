/** TEMPORARY STUB — the backend agent replaces this file. Keep: class LiveSession implements LiveSessionApi. */
import { DEFAULT_ASSUMPTIONS } from '../shared/types';
import type { PublicState } from '../shared/types';
import type { LiveSessionApi, LiveSessionOptions } from './types';

export class LiveSession implements LiveSessionApi {
  private state: PublicState;
  constructor(opts: LiveSessionOptions) {
    void DEFAULT_ASSUMPTIONS;
    this.state = {
      serverId: Math.random().toString(36).slice(2),
      world: null,
      sim: {
        time: 0, running: false, speed: 10, epoch: 0, workers: [{ id: 1, busyWith: null, addedBy: 'initial', addedAt: 0 }],
        orders: [], nextAutoArrival: 0, started: false,
        metrics: { submitted: 0, waiting: 0, inService: 0, completed: 0, avgWaitSec: null, workers: 1, simTimeSec: 0 },
      },
      bean: { thinking: false, aiManagement: false, lastDecision: null, lastError: null, image: { status: 'none' } },
      api: opts.initialApiStatus,
      publicBaseUrl: opts.publicBaseUrl,
    };
  }
  getState() { return this.state; }
  subscribe() { return () => {}; }
  buildWorld(): never { throw new Error('stub'); }
  start() {} pause() {} reset() {} setSpeed() {}
  addOrder(): never { throw new Error('stub'); }
  addWorker() { return { ok: false as const, reason: 'stub' }; }
  setAiManagement() {} setBeanThinking() {} recordBeanDecision() {} setBeanError() {} setBeanImage() {} setApiStatus() {}
  dispose() {}
}
