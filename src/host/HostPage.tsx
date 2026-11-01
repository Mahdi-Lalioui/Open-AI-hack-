/** The studio shell: one confirmed blueprint, a living stage, and hands-on controls. */
import { useEffect, useRef, useState } from 'react';
import type { SketchMode } from '../../shared/creations';
import { useLiveState } from '../lib/useLiveState';
import { useReducedMotion } from '../lib/useReducedMotion';
import { isLiveAiAvailable } from '../lib/format';
import { World } from '../scene/World';
import type { CameraCommand, CameraCommandType, StationId } from '../scene/types';
import { ConnectionPill } from '../components/ConnectionPill';
import { Icon, type IconName } from '../components/Icon';
import { CreationColumn } from './CreationColumn';
import { BlueprintPanel } from './BlueprintPanel';
import { ReadoutCard } from './ReadoutCard';
import { AskCard } from './AskCard';
import { ApiStatusCard } from './ApiStatusCard';
import { AudienceCard } from './AudienceCard';

const CAMERA: { type: CameraCommandType; label: string; icon: IconName }[] = [
  { type: 'reset', label: 'Reset view', icon: 'reset' },
  { type: 'zoomIn', label: 'Zoom in', icon: 'plus' },
  { type: 'zoomOut', label: 'Zoom out', icon: 'minus' },
  { type: 'orbitLeft', label: 'Rotate left', icon: 'rotateLeft' },
  { type: 'orbitRight', label: 'Rotate right', icon: 'rotateRight' },
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
  const [presenting, setPresenting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const presentRef = useRef<HTMLButtonElement>(null);
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
    setSelected(null);
    setCaption(true);
    const timer = setTimeout(() => setCaption(false), 4500);
    return () => clearTimeout(timer);
  }, [version]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSelected(null);
      if (presenting) {
        setPresenting(false);
        presentRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [presenting]);

  const petName = creation?.pet?.name || 'your pet';
  const liveAi = isLiveAiAvailable(state?.api);
  const shownMode = creation?.mode ?? mode;
  const stageTitle = creation ? creation.mode === 'pet' ? creation.pet?.name || 'Your paper pet' : 'A little spark of possibility' : 'A world waiting to happen';

  return (
    <div className={`app host ${presenting ? 'is-presenting' : ''}`}>
      <a className="skip-link" href="#studio-main">Skip to the studio</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Living Paper home">
          <span className="brand-icon"><Icon name="paper" size={25} /></span>
          <span className="wordmark">Living Paper<span className="brand-period">.</span></span>
        </a>
        <span className="studio-label">A small idea. A living world.</span>
        <div className="topbar-status">
          {presenting && state && <span className={`pill presentation-source ${liveAi ? 'pill-live' : 'pill-example'}`}>{liveAi ? 'Live AI available' : 'Example mode'}</span>}
          <ConnectionPill connection={connection} />
          <button ref={presentRef} type="button" className={`btn btn-present ${presenting ? 'is-active' : ''}`} data-testid="presentation-toggle" aria-pressed={presenting}
            onClick={() => { setPresenting((value) => !value); window.scrollTo({ top: 0, behavior: 'instant' }); }}>
            <Icon name={presenting ? 'close' : 'present'} size={18} />
            {presenting ? 'Back to studio' : 'Present'}
          </button>
        </div>
      </header>

      <div className="studio-intro">
        <div>
          <p className="eyebrow"><Icon name="spark" size={16} /> The imagination playground</p>
          <h1>Made of paper.<br className="mobile-break" /> <em>Full of life.</em></h1>
        </div>
        <div className="intro-aside">
          <p>Draw something small.<br />Make something wonderful.</p>
          {state && <span className={`pill ${liveAi ? 'pill-live' : 'pill-example'}`} data-testid="mode-pill"><span className="status-dot" />{liveAi ? 'Live AI available' : 'Example mode · no API key'}</span>}
        </div>
      </div>

      <main className="host-grid" id="studio-main">
        <section className="col col-left" aria-label="Sketch to creation">
          <div className="column-heading"><span className="step-number">01</span><h2>Make your mark</h2><Icon name="pencil" size={18} /></div>
          <CreationColumn mode={mode} onMode={setMode} connected={Boolean(state)} creation={creation} visionReady={Boolean(state && state.api.vision.state !== 'not_configured')} reducedMotion={reducedMotion} onBusyChange={setCreating} externalBusy={importing}
            onBuilt={() => {
              if (window.innerWidth < 1100) stageRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            }} />
          <BlueprintPanel creation={creation} connected={Boolean(state)} creating={creating} onBusyChange={setImporting} />
        </section>

        <section className="col col-center" aria-label="3D stage">
          <div className="column-heading stage-heading"><span className="step-number">02</span><h2>Meet your creation</h2><span className="mini-label">3D PLAYGROUND</span></div>
          <div className="stage-frame" ref={stageRef} tabIndex={-1}>
            <div className="stage-topline">
              <span className="stage-live"><span className="status-dot" />{creation ? 'LIVE PREVIEW' : 'YOUR PAPER STAGE'}</span>
              <span className="stage-version">{creation ? `No. ${String(creation.version).padStart(3, '0')}` : 'A blank page, endless possibility'}</span>
            </div>
            <div className="stage-canvas">
              {state ? <World state={state} selected={selected} onSelect={setSelected} cameraCommand={camera} reducedMotion={reducedMotion}
                onWebGLUnavailable={(reason) => setWebgl(reason || 'unknown')}
                fallback={<div className="webgl-fallback" data-testid="webgl-fallback"><Icon name="cube" size={40} /><h3>The world is still alive.</h3><p>This browser can’t show the 3D stage. Your creation, live readout and interaction controls are ready to use.</p></div>} />
                : <div className="stage-empty"><Icon name="paper" size={40} /><p>Unfolding your studio…</p></div>}
            </div>
            {state && !creation && !webgl && <div className="stage-hint">
              <span className="empty-stage-icon"><Icon name="spark" size={35} /></span>
              <h3>Every world starts<br />with a little scribble.</h3>
              <p>Try a starter, draw a character, or upload<br className="desktop-break" /> a sketch. Then bring it into 3D.</p>
              <a className="btn btn-primary" href="#sketch"><Icon name="pencil" size={17} />Start creating<Icon name="arrow" size={17} /></a>
            </div>}
            {caption && <p className={`stage-caption ${reducedMotion ? '' : 'animate-rise'}`} role="status"><Icon name="check" size={17} />Your blueprint is now a living 3D creation.</p>}
            {webgl && <span className="visually-hidden">3D unavailable: {webgl}</span>}
            <div className="stage-bottomline">
              <div className="stage-identity"><span className="stage-title">{stageTitle}</span><span>{creation ? `${creation.mode === 'pet' ? 'Procedural paper pet' : 'Series DC circuit'} · built from your blueprint` : 'Sketch → blueprint → living world'}</span></div>
              <div className="stage-camera" role="group" aria-label="Camera">
                {CAMERA.map((control) => <button key={control.type} type="button" className="btn btn-icon-only" aria-label={control.label} title={control.label} disabled={!state || Boolean(webgl)}
                  data-testid={`camera-${control.type}`} onClick={() => setCamera((previous) => ({ type: control.type, nonce: (previous?.nonce ?? 0) + 1 }))}><Icon name={control.icon} size={18} /></button>)}
              </div>
            </div>
          </div>
          <div className="stage-note"><span><Icon name="cube" size={15} />{creation ? 'Drag to orbit · scroll to explore' : 'Your imagination, assembled in three dimensions'}</span><span>Designed to be played with.</span></div>
          {presenting && <p className="presentation-hint">Presentation mode <kbd>Esc</kbd> to return to the studio</p>}
        </section>

        <section className="col col-right" aria-label="Live readout and audience">
          <div className="column-heading"><span className="step-number">03</span><h2>Bring it to life</h2><Icon name="spark" size={18} /></div>
          <ReadoutCard key={`readout-${creation?.version ?? 'empty'}`} mode={shownMode} pet={creation?.mode === 'pet' ? state?.pet ?? null : null} circuit={state?.circuit?.result ?? null} switchClosed={state?.circuit?.switchClosed} petName={creation?.pet?.name} connected={connection === 'online'} />
          {shownMode === 'pet' && <AskCard key={`ask-${creation?.version ?? 'empty'}`} state={state} petName={petName} />}
          <AudienceCard state={state} />
          <ApiStatusCard state={state} />
        </section>
      </main>
      <footer className="studio-footer"><span><Icon name="paper" size={15} />Small sketches. Real possibilities.</span><span>Structured blueprints. Deterministic 3D. A little bit of wonder.</span></footer>
    </div>
  );
}
