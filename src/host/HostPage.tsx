/** Host screen: sketch → editor (left), 3D stage (center), live readout / AI / audience (right). */
import { useEffect, useRef, useState } from 'react';
import type { SketchMode } from '../../shared/creations';
import { useLiveState } from '../lib/useLiveState';
import { useReducedMotion } from '../lib/useReducedMotion';
import { isLiveAiAvailable } from '../lib/format';
import { World } from '../scene/World';
import type { CameraCommand, CameraCommandType, StationId } from '../scene/types';
import { ConnectionPill } from '../components/ConnectionPill';
import { CreationColumn } from './CreationColumn';
import { ReadoutCard } from './ReadoutCard';
import { AskCard } from './AskCard';
import { ApiStatusCard } from './ApiStatusCard';
import { AudienceCard } from './AudienceCard';

const CAMERA: { type: CameraCommandType; label: string; icon: string }[] = [
  { type: 'reset', label: 'Reset view', icon: '⟲' },
  { type: 'zoomIn', label: 'Zoom in', icon: '+' },
  { type: 'zoomOut', label: 'Zoom out', icon: '−' },
  { type: 'orbitLeft', label: 'Rotate left', icon: '↺' },
  { type: 'orbitRight', label: 'Rotate right', icon: '↻' },
];

export function HostPage() {
  const { state, connection } = useLiveState();
  const reducedMotion = useReducedMotion();
  const creation = state?.creation ?? null;
  const [mode, setMode] = useState<SketchMode>('pet');
  const [selected, setSelected] = useState<StationId | null>(null);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const [webgl, setWebgl] = useState<string | null>(null);
  const [caption, setCaption] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const seen = useRef<number | null | undefined>(undefined);
  const synced = useRef(false);

  useEffect(() => {
    if (creation && !synced.current) { synced.current = true; setMode(creation.mode); }
  }, [creation]);

  const version = state ? (creation?.version ?? null) : undefined;
  useEffect(() => {
    if (version === undefined) return;
    const prev = seen.current;
    seen.current = version;
    if (prev === undefined || version === null || version === prev) return;
    setCaption(true);
    const t = setTimeout(() => setCaption(false), 5000);
    return () => clearTimeout(t);
  }, [version]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const petName = creation?.pet?.name || 'the pet';
  const liveAi = isLiveAiAvailable(state?.api);
  const shownMode = creation?.mode ?? mode;

  return (
    <div className="app host">
      <header className="topbar">
        <div className="brand">
          <span className="wordmark">Living Paper</span>
          <span className="tagline">Turn a sketch into a world you can test.</span>
        </div>
        <div className="topbar-status">
          {state && (
            <span className={`pill ${liveAi ? 'pill-live' : 'pill-example'}`} data-testid="mode-pill">
              {liveAi ? 'Live AI available' : 'Example mode — no API key'}
            </span>
          )}
          <ConnectionPill connection={connection} />
        </div>
      </header>

      <main className="host-grid">
        <section className="col col-left" aria-label="Sketch to creation">
          <CreationColumn
            mode={mode}
            onMode={setMode}
            connected={Boolean(state)}
            reducedMotion={reducedMotion}
            onBuilt={() => {
              if (window.innerWidth < 1100) stageRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            }}
          />
        </section>

        <section className="col col-center" aria-label="3D stage">
          <div className="stage-frame" ref={stageRef} tabIndex={-1}>
            <div className="stage-canvas">
              {state ? (
                <World
                  state={state}
                  selected={selected}
                  onSelect={setSelected}
                  cameraCommand={camera}
                  reducedMotion={reducedMotion}
                  onWebGLUnavailable={(r) => setWebgl(r || 'unknown')}
                  fallback={
                    <div className="webgl-fallback" data-testid="webgl-fallback">
                      <p className="msg msg-warn">3D view unavailable in this browser — the readout on the right stays live.</p>
                    </div>
                  }
                />
              ) : (
                <div className="stage-empty"><p>Connecting to the Living Paper server…</p></div>
              )}
            </div>
            {creation && <span className="stage-tag">Interpreted model</span>}
            {state && !creation && (
              <div className="stage-hint" aria-hidden="true">
                <p>Your creation appears here.</p>
                <p className="muted">Try the example or upload a sketch, then press Build in 3D.</p>
              </div>
            )}
            {caption && (
              <p className={`stage-caption ${reducedMotion ? '' : 'animate-rise'}`} role="status">
                Interpreted model — preset 3D pieces placed from your sketch
              </p>
            )}
            {webgl && <span className="visually-hidden">3D unavailable: {webgl}</span>}
            <div className="stage-camera" role="group" aria-label="Camera">
            {CAMERA.map((c) => (
              <button key={c.type} type="button" className="btn btn-icon-only" aria-label={c.label} title={c.label} disabled={!state}
                data-testid={`camera-${c.type}`} onClick={() => setCamera((p) => ({ type: c.type, nonce: (p?.nonce ?? 0) + 1 }))}>
                <span aria-hidden="true">{c.icon}</span>
              </button>
            ))}
            </div>
          </div>
        </section>

        <section className="col col-right" aria-label="Live readout and audience">
          <ReadoutCard mode={shownMode} pet={creation?.mode === "pet" ? state?.pet ?? null : null} circuit={state?.circuit?.result ?? null} switchClosed={state?.circuit?.switchClosed} petName={creation?.pet?.name} />
          {shownMode === 'pet' && <AskCard state={state} petName={petName} />}
          <AudienceCard state={state} />
          <ApiStatusCard state={state} />
        </section>
      </main>
    </div>
  );
}
