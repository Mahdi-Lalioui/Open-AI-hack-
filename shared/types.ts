/**
 * Shared contracts between server and browser.
 * OWNER: lead. Agents may read but must not change shapes without telling the lead.
 */

// ---------------------------------------------------------------------------
// Flow graph (what the sketch means)
// ---------------------------------------------------------------------------

export type NodeKind = 'source' | 'service' | 'sink';

export interface FlowNode {
  /** Unique id, e.g. "n1". */
  id: string;
  kind: NodeKind;
  /** Short human label, e.g. "Customers", "Barista", "Pickup". Max 32 chars. */
  label: string;
  /** Normalised position in the drawing, 0..1 (x → right, y → down). */
  x: number;
  y: number;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Adjustable simulation assumptions (all in simulated seconds). */
export interface Assumptions {
  /** One automatic arrival every N simulated seconds. Default 30. */
  arrivalIntervalSec: number;
  /** Service time per order. Default 50. */
  serviceTimeSec: number;
  /** Automatic arrivals happen while sim time < this. Default 300. */
  autoArrivalUntilSec: number;
  /** Workers at start (1 or 2). Default 1. */
  initialWorkers: 1 | 2;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  arrivalIntervalSec: 30,
  serviceTimeSec: 50,
  autoArrivalUntilSec: 300,
  initialWorkers: 1,
};

export const MAX_WORKERS = 2;

/** Result of reading a photo with the vision model (validated on the server). */
export interface RecognizedSketch {
  /** False if the picture is not a simple source → service → sink chain. */
  inScope: boolean;
  graph: FlowGraph;
  /** Only filled when clearly written on the drawing; never invented. */
  serviceTimeSec: number | null;
  workers: number | null;
  arrivalIntervalSec: number | null;
  /** Things the model could not read or was unsure about — shown to the host. */
  uncertainties: string[];
}

export type WorldSource = 'example' | 'vision' | 'manual';

/** A confirmed world, built when the host clicks "Build world". */
export interface WorldConfig {
  graph: FlowGraph;
  assumptions: Assumptions;
  /** example = built-in example, no image analysis; vision = from a live vision read; manual = edited by hand. */
  source: WorldSource;
  /** Increments on every build — the 3D scene plays the reveal when this changes. */
  version: number;
  builtAtWall: number;
}

export interface BuildWorldInput {
  graph: FlowGraph;
  assumptions: Assumptions;
  source: WorldSource;
}

// ---------------------------------------------------------------------------
// Queue simulation
// ---------------------------------------------------------------------------

export type OrderOrigin = 'audience' | 'presenter' | 'automatic';

export interface Order {
  id: string;
  origin: OrderOrigin;
  /** Optional guest nickname (audience only), max 24 chars. */
  nickname?: string;
  /** Simulated seconds. */
  arrivalTime: number;
  serviceStartTime: number | null;
  completionTime: number | null;
  /** Worker currently / last serving it. */
  workerId: number | null;
}

export type WorkerAddedBy = 'initial' | 'manual' | 'ai' | 'example';

export interface Worker {
  id: number;
  /** Order id currently in service, or null if idle. */
  busyWith: string | null;
  addedBy: WorkerAddedBy;
  /** Sim time the worker joined. */
  addedAt: number;
}

export interface Metrics {
  submitted: number;
  waiting: number;
  inService: number;
  completed: number;
  /** Mean of (serviceStart − arrival) over completed orders; null when none completed. */
  avgWaitSec: number | null;
  workers: number;
  simTimeSec: number;
}

export interface SimSnapshot {
  time: number;
  running: boolean;
  /** Simulated seconds per real second (1, 5, 10, 20). */
  speed: number;
  /** Increments on every reset; used to reject stale actions. */
  epoch: number;
  workers: Worker[];
  /** All orders of this epoch, oldest first. */
  orders: Order[];
  metrics: Metrics;
  /** Next automatic arrival time, or null if none left. */
  nextAutoArrival: number | null;
  /** True once Start has been pressed at least once this epoch. */
  started: boolean;
}

// ---------------------------------------------------------------------------
// Bean (the pet) and API status
// ---------------------------------------------------------------------------

export type BeanActionName = 'call_backup' | 'keep_serving';

/** ai = a real Decisions API response; example = deterministic rule, no AI used. */
export type BeanActionSource = 'ai' | 'example';

export interface BeanDecision {
  action: BeanActionName | import('./creations').PetActionName;
  source: BeanActionSource;
  /** Short explanation built from the facts that were sent / the model's reason. */
  explanation: string;
  /** Whether application code actually added a worker because of this decision. */
  applied: boolean;
  /** Why it was not applied, if not (e.g. "AI management is off", "session was reset"). */
  notAppliedReason?: string;
  simTime: number;
  wallTime: number;
  epoch: number;
  model?: string;
}

export interface BeanImageState {
  status: 'none' | 'loading' | 'ready' | 'error';
  /** Served by the backend, e.g. "/api/bean/image.png?v=3". */
  url?: string;
  error?: string;
  model?: string;
}

export interface BeanState {
  thinking: boolean;
  /** When on, a real call_backup decision is executed by app code. */
  aiManagement: boolean;
  lastDecision: BeanDecision | null;
  /** Last error from Ask Bean, human-readable, no secrets. */
  lastError: string | null;
  image: BeanImageState;
}

export type ApiKind = 'vision' | 'decisions' | 'image';

/**
 * not_configured: no key. ready: key present, not called yet. waiting: request in flight.
 * live: last call succeeded. unavailable: last call failed (message says why).
 */
export type ApiState = 'not_configured' | 'ready' | 'waiting' | 'live' | 'unavailable';

export interface ApiStatusEntry {
  state: ApiState;
  model: string;
  message: string;
  updatedAt: number;
}

export type ApiStatusMap = Record<ApiKind, ApiStatusEntry>;

// ---------------------------------------------------------------------------
// The single broadcast state
// ---------------------------------------------------------------------------

export interface PublicState {
  /** Random per server process; clients can detect restarts. */
  serverId: string;
  world: WorldConfig | null;
  sim: SimSnapshot;
  bean: BeanState;
  api: ApiStatusMap;
  /** From PUBLIC_BASE_URL env, or null (client then uses window.location.origin). */
  publicBaseUrl: string | null;
  /** PIVOT: the built pet/circuit creation, or null. */
  creation?: import('./creations').CreationConfig | null;
  pet?: import('./creations').PetState;
  circuit?: { switchClosed: boolean; result: import('./creations').CircuitResult | null };
}

// ---------------------------------------------------------------------------
// REST payloads
// ---------------------------------------------------------------------------

export interface AddOrderInput {
  /** Client-generated unique id (uuid). Re-sending the same id is a no-op. */
  id: string;
  origin: 'audience' | 'presenter';
  nickname?: string;
}

export interface AddOrderResult {
  ok: true;
  duplicate: boolean;
  order: Order;
  /** 1-based position among waiting orders, or 0 if already in service/completed. */
  position: number;
  metrics: Metrics;
}

export interface ApiError {
  ok: false;
  error: string;
  /** Machine-readable code, e.g. "rate_limited", "invalid_input", "not_configured". */
  code: string;
}

export interface AnalyzeResult {
  ok: true;
  sketch: RecognizedSketch;
  model: string;
}

export const SIM_SPEEDS = [1, 5, 10, 20] as const;

/** Socket.IO event names. Server → client only; all mutations go through REST. */
export const SOCKET_EVENTS = {
  state: 'state',
} as const;
