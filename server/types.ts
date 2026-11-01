/**
 * Server-side contracts. OWNER: lead.
 * Backend agent implements LiveSessionApi in server/session.ts.
 * OpenAI agent consumes it from server/routes/ai.ts.
 */
import type {
  AddOrderInput,
  AddOrderResult,
  ApiError,
  ApiKind,
  ApiStatusEntry,
  ApiStatusMap,
  BeanDecision,
  BeanImageState,
  BuildWorldInput,
  PublicState,
  Worker,
  WorkerAddedBy,
  WorldConfig,
} from '../shared/types';

export interface LiveSessionOptions {
  initialApiStatus: ApiStatusMap;
  publicBaseUrl: string | null;
  /** Real milliseconds between simulation ticks while running. Default 100. */
  tickMs?: number;
  /** Injectable clock for tests. Default Date.now. */
  now?: () => number;
}

export type AddWorkerResult = { ok: true; worker: Worker } | { ok: false; reason: string };

export interface LiveSessionApi {
  getState(): PublicState;
  /** Listener is called (coalesced) after every change. Returns unsubscribe. */
  subscribe(listener: (state: PublicState) => void): () => void;

  /** Validates (throws Error with readable message on invalid), stores world, resets the sim. */
  buildWorld(input: BuildWorldInput): WorldConfig;
  start(): void;
  pause(): void;
  /** Stops the clock, clears orders, restores initial workers, epoch++. Keeps the world. */
  reset(): void;
  setSpeed(speed: number): void;

  /** Idempotent by input.id. `ip` is used for audience rate limiting. */
  addOrder(input: AddOrderInput, meta?: { ip?: string }): AddOrderResult | ApiError;
  /**
   * Adds the second worker (cap MAX_WORKERS). If expectedEpoch is given and differs from the
   * current epoch (a reset happened), refuses, protects against stale AI responses.
   */
  addWorker(by: WorkerAddedBy, opts?: { expectedEpoch?: number }): AddWorkerResult;

  setAiManagement(enabled: boolean): void;
  setBeanThinking(thinking: boolean): void;
  recordBeanDecision(decision: BeanDecision): void;
  setBeanError(message: string | null): void;
  setBeanImage(image: BeanImageState): void;
  setApiStatus(kind: ApiKind, entry: Partial<ApiStatusEntry>): void;

  buildCreation(input: import('./creation/schemas').BuildCreationInput): import('../shared/creations').CreationConfig;
  interact(input: import('./creation/schemas').InteractionInput, meta?: { ip?: string }): import('./session').InteractionResult | import('../shared/types').ApiError;
  setPetAction(action: import('../shared/creations').PetActionName, by?: string | null, durationMs?: number): void;

  /** Clears timers. */
  dispose(): void;
}
