/** Center column: framed 3D stage, simulation + camera controls, station inspector, text view. */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PublicState } from '../../shared/types';
import { SIM_SPEEDS } from '../../shared/types';
import { World } from '../scene/World';
import type { CameraCommand, CameraCommandType, StationId } from '../scene/types';
import { api, newOrderId } from '../lib/api';
import { formatClock, ordinal } from '../lib/format';
import { StationDetails, stationLabel } from './StationDetails';
import { TextSimulation, queueSummary } from './TextSimulation';

const STATIONS: StationId[] = ['source', 'queue', 'service', 'sink', 'bean'];

const CAMERA: { type: CameraCommandType; label: string; icon: string }[] = [
  { type: 'reset', label: 'Reset view', icon: '⟲' },
  { type: 'zoomIn', label: 'Zoom in', icon: '+' },
  { type: 'zoomOut', label: 'Zoom out', icon: '−' },
  { type: 'orbitLeft', label: 'Rotate left', icon: '↺' },
  { type: 'orbitRight', label: 'Rotate right', icon: '↻' },
];

const CAPTION_MS = 5000;

interface Props {
  state: PublicState | null;
  reducedMotion: boolean;
  selected: StationId | null;
  onSelect: (id: StationId | null) => void;
  stageRef: RefObject<HTMLDivElement>;
}

export function StageArea({ state, reducedMotion, selected, onSelect, stageRef }: Props) {
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const [webglIssue, setWebglIssue] = useState<string | null>(null);
  const [caption, setCaption] = useState(false);
  const [textView, setTextView] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const seenVersion = useRef<number | null | undefined>(undefined);

  const version = state ? (state.world?.version ?? null) : undefined;

  // Caption after each new build (not on first load of an existing world).
  useEffect(() => {
    if (version === undefined) return;
    if (seenVersion.current === undefined) {
      seenVersion.current = version;
      return;
    }
    if (version !== null && version !== seenVersion.current) {
      setCaption(true);
      const t = setTimeout(() => setCaption(false), CAPTION_MS);
      seenVersion.current = version;
      return () => clearTimeout(t);
    }
    seenVersion.current = version;
  }, [version]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.kind === 'ok' ? 3500 : 8000);
    return () => clearTimeout(t);
  }, [notice]);

  async function run(name: string, fn: () => Promise<string | void>) {
    setBusy(name);
    try {
      const msg = await fn();
      setNotice(msg ? { kind: 'ok', text: msg } : null);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message || 'That did not work.' });
    } finally {
      setBusy(null);
    }
  }

  const sendCamera = (type: CameraCommandType) => setCamera((c) => ({ type, nonce: (c?.nonce ?? 0) + 1 }));

  const sim = state?.sim;
  const running = Boolean(sim?.running);
  const disabled = !state;

  return (
    <div className="stage-area">
      <div className="stage-frame" ref={stageRef} tabIndex={-1} aria-label="3D café stage">
        <div className="stage-canvas">
          {state ? (
            <World
              state={state}
              selected={selected}
              onSelect={onSelect}
              cameraCommand={camera}
              reducedMotion={reducedMotion}
              onWebGLUnavailable={(reason) => setWebglIssue(reason || 'unknown')}
              fallback={
                <div className="webgl-fallback" data-testid="webgl-fallback">
                  <p className="msg msg-warn">3D view unavailable in this browser — showing the text simulation</p>
                  <TextSimulation state={state} />
                </div>
              }
            />
          ) : (
            <div className="stage-empty">
              <p>Connecting to the Living Paper server…</p>
            </div>
          )}
        </div>
        {state?.world && (
          <span className="stage-tag" title="Preset miniature pieces placed from your sketch">
            Interpreted model
          </span>
        )}
        {state && !state.world && (
          <div className="stage-hint" aria-hidden="true">
            <p>Your world appears here.</p>
            <p className="muted">Try the example or upload a sketch, then press Build world.</p>
          </div>
        )}
        {caption && (
          <p className={`stage-caption ${reducedMotion ? '' : 'animate-rise'}`} role="status">
            Interpreted model — preset miniature pieces placed from your sketch
          </p>
        )}
        {webglIssue && <span className="visually-hidden">3D view unavailable: {webglIssue}</span>}
      </div>

      <div className="control-bar" role="group" aria-label="Simulation controls">
        <div className="control-group">
          <button
            type="button"
            className={`btn ${running ? 'btn-secondary' : 'btn-primary'} btn-start`}
            data-testid="sim-start"
            disabled={disabled || busy === 'start'}
            onClick={() => run('start', () => (running ? api.pause() : api.start()).then(() => undefined))}
          >
            <span aria-hidden="true" className="btn-icon">
              {running ? '❚❚' : '▶'}
            </span>
            {running ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="sim-reset"
            disabled={disabled || busy === 'reset'}
            onClick={() => run('reset', () => api.reset().then(() => 'Simulation reset. Your world was kept.'))}
          >
            Reset
          </button>
          <label className="speed">
            <span>Speed</span>
            <select
              data-testid="sim-speed"
              value={sim?.speed ?? 1}
              disabled={disabled}
              onChange={(e) => {
                const v = Number(e.target.value);
                void run('speed', () => api.setSpeed(v).then(() => undefined));
              }}
            >
              {SIM_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-coral"
            data-testid="presenter-order"
            disabled={disabled || busy === 'order'}
            onClick={() =>
              run('order', async () => {
                const res = await api.addOrder({ id: newOrderId(), origin: 'presenter' });
                return res.position > 0
                  ? `Presenter order added — ${ordinal(res.position)} in line.`
                  : 'Presenter order added — being made now.';
              })
            }
          >
            Presenter order
          </button>
        </div>
        <div className="control-group camera-group" role="group" aria-label="Camera">
          {CAMERA.map((c) => (
            <button
              key={c.type}
              type="button"
              className="btn btn-icon-only"
              onClick={() => sendCamera(c.type)}
              disabled={disabled}
              aria-label={c.label}
              title={c.label}
              data-testid={`camera-${c.type}`}
            >
              <span aria-hidden="true">{c.icon}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sim-line">
        <p className="sim-time">
          Simulated time{' '}
          <strong className="num" data-testid="sim-time">
            {formatClock(sim?.time ?? 0)}
          </strong>
          <span className="sim-state">
            {sim ? (sim.running ? `running · ${sim.speed}×` : sim.started ? 'paused' : 'ready') : ''}
          </span>
        </p>
        <p className="sim-note">Simulated with your assumptions — not a prediction for a real business.</p>
      </div>

      <div className="control-feedback" aria-live="polite">
        {notice && (
          <p className={`msg ${notice.kind === 'ok' ? 'msg-ok' : 'msg-error'}`} data-testid="control-notice">
            {notice.text}
          </p>
        )}
      </div>

      <div className="inspect-row" role="group" aria-label="Inspect a station">
        <span className="inspect-label">Inspect:</span>
        {STATIONS.map((id) => (
          <button
            key={id}
            type="button"
            className={`chip-btn ${selected === id ? 'is-on' : ''}`}
            aria-pressed={selected === id}
            disabled={disabled}
            data-testid={`inspect-${id}`}
            onClick={() => onSelect(selected === id ? null : id)}
          >
            {stationLabel(state, id)}
          </button>
        ))}
        <button
          type="button"
          className={`chip-btn chip-btn-text ${textView ? 'is-on' : ''}`}
          aria-expanded={textView}
          aria-controls="text-view"
          onClick={() => setTextView((v) => !v)}
          disabled={disabled}
          data-testid="text-view-toggle"
        >
          Text view
        </button>
      </div>

      {state && selected && <StationDetails state={state} selected={selected} onClose={() => onSelect(null)} />}

      {state && textView && (
        <div id="text-view" className="card text-view-card">
          <TextSimulation state={state} />
        </div>
      )}
      {state && <LiveSummary state={state} />}
    </div>
  );
}

/** Visually hidden, throttled live region so screen readers hear the queue change. */
function LiveSummary({ state }: { state: PublicState }) {
  const latest = useRef(queueSummary(state));
  latest.current = queueSummary(state);
  const [spoken, setSpoken] = useState(latest.current);
  useEffect(() => {
    const t = setInterval(() => setSpoken(latest.current), 8000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="visually-hidden" aria-live="polite" data-testid="queue-live-summary">
      {spoken}
    </p>
  );
}
