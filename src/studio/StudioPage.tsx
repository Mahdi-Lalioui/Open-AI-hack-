/** VDraw: sketch, image, text or voice -> validated Blueprint -> 3D, CAD, web, animation and live test. */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { StudioDesign, StudioStatus } from '../../shared/blueprint/api';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import type { SketchMode } from '../../shared/creations';
import { Card } from '../components/Card';
import { ConnectionPill } from '../components/ConnectionPill';
import { Icon } from '../components/Icon';
import { ApiClientError } from '../lib/api';
import { buildCreation } from '../lib/creationApi';
import { useLiveState } from '../lib/useLiveState';
import { checkImageFile } from '../lib/format';
import { useReducedMotion } from '../lib/useReducedMotion';
import { BlueprintViewport } from './BlueprintViewport';
import { Inspector } from './Inspector';
import { LiveCards, LiveStage } from './LiveTest';
import { SketchPad, type SketchPadHandle } from './SketchPad';
import { blobToBase64, exportFile, getDesign, getStatus, interpret, refine, saveEdit, saveFile, transcribe, undo } from './studioApi';
import './studio.css';

type InputMode = 'sketch' | 'image';
type View = '3d' | 'cad' | 'web' | 'live';
type Problem = { message: string; canTryRules: boolean; retry?: () => void };

const AI_FAILURES = new Set(['invalid_key', 'model_access', 'model_not_found', 'rate_limited', 'quota_exceeded', 'bad_request', 'upstream_error', 'timeout', 'network', 'invalid_model_output']);

const DESIGN_KEY = 'vdraw.design';
const MAX_BLUEPRINT_FILE_BYTES = 2 * 1024 * 1024;

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function StudioPage() {
  const reducedMotion = useReducedMotion();
  const { state: liveState, connection } = useLiveState();
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [design, setDesign] = useState<StudioDesign | null>(null);
  const [revealKey, setRevealKey] = useState('none');
  const [inputMode, setInputMode] = useState<InputMode>('sketch');
  const [text, setText] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [upload, setUpload] = useState<{ file: File; url: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [instruction, setInstruction] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('3d');
  const [clipName, setClipName] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [spin, setSpin] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [cadSource, setCadSource] = useState<string | null>(null);
  const [webPage, setWebPage] = useState<string | null>(null);
  const [exported, setExported] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const sketch = useRef<SketchPadHandle>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));
  }, []);
  useEffect(() => () => { if (upload) URL.revokeObjectURL(upload.url); }, [upload]);

  const ai = status?.ai.configured ?? false;
  const liveMode: SketchMode | null = design?.blueprint.circuit ? 'circuit' : design?.blueprint.pet ? 'pet' : null;
  const liveReady = Boolean(liveState);
  const clip = design?.blueprint.animations.find((c) => c.name === clipName) ?? null;

  /** Applies a server result. The CAD and web tabs reload from the export API, so they can't drift from it. */
  const accept = useCallback((next: StudioDesign, isNewDesign: boolean) => {
    setDesign(next);
    try { localStorage.setItem(DESIGN_KEY, next.id); } catch { /* private window: only refresh recovery is lost */ }
    setProblem(null);
    setExported({});
    setCadSource(null);
    setWebPage(null);
    if (isNewDesign) {
      setRevealKey(`${next.id}`);
      setSelected(null);
      setClipName(null);
      setExploded(false);
      setSpin(next.blueprint.interaction.turntable);
      setView('3d');
    } else {
      setSelected((s) => (next.blueprint.components.some((c) => c.id === s) ? s : null));
      setClipName((c) => (next.blueprint.animations.some((a) => a.name === c) ? c : null));
      if (!next.blueprint.circuit && !next.blueprint.pet) setView((v) => (v === 'live' ? '3d' : v));
    }
  }, []);

  // A refresh keeps the current design while the server is still running.
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(DESIGN_KEY); } catch { /* unavailable: start empty */ }
    if (!id) return;
    getDesign(id).then((saved) => accept(saved, true)).catch(() => {
      try { localStorage.removeItem(DESIGN_KEY); } catch { /* nothing to clear */ }
    });
  }, [accept]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPresenting(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The live test always runs the design on screen. It rebuilds only if the server has something else.
  useEffect(() => {
    if (view !== 'live' || !design || !liveMode || !liveReady) return;
    const spec = liveMode === 'pet' ? design.blueprint.pet : design.blueprint.circuit;
    const current = liveState?.creation?.mode === liveMode ? liveState.creation[liveMode] : null;
    if (JSON.stringify(current) === JSON.stringify(spec)) return;
    const source: 'example' | 'vision' | 'manual' = design.source.kind === 'example' ? 'example' : design.source.kind === 'ai' ? 'vision' : 'manual';
    const input = design.blueprint.pet
      ? { mode: 'pet' as const, pet: design.blueprint.pet, source }
      : { mode: 'circuit' as const, circuit: design.blueprint.circuit ?? undefined, source };
    buildCreation(input).catch((err: Error) => setProblem({ message: err.message, canTryRules: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, design?.id, design?.version, liveMode, liveReady]);

  const run = useCallback(async (label: string, work: () => Promise<void>, retry?: () => void) => {
    setBusy(label);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      setProblem({ message: (err as Error).message, canTryRules: AI_FAILURES.has(code), retry });
    } finally {
      setBusy(null);
    }
  }, []);

  const imageForRequest = async (): Promise<{ base64: string } | undefined> => {
    if (inputMode === 'image' && upload) return { base64: await blobToBase64(upload.file) };
    if (inputMode === 'sketch') {
      const blob = await sketch.current?.toBlob();
      if (blob) return { base64: await blobToBase64(blob) };
    }
    return undefined;
  };

  const generate = (engine?: 'rules') => run(
    engine === 'rules' || !ai ? 'Matching a built-in design…' : (inputMode === 'sketch' ? hasInk : Boolean(upload)) ? 'Designing it and checking it against your drawing, which can take a couple of minutes…' : 'Designing it, which can take up to a minute…',
    async () => accept(await interpret({ text: text.trim() || undefined, image: await imageForRequest(), engine }), true),
  );

  const loadTemplate = (templateId: string) => run('Loading the example…', async () => accept(await interpret({ templateId }), true));

  async function openBlueprint(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run('Opening your Blueprint…', async () => {
      if (file.size > MAX_BLUEPRINT_FILE_BYTES) throw new Error('That file is too large to be a VDraw Blueprint.');
      let blueprint: unknown;
      try { blueprint = JSON.parse(await file.text()); } catch { throw new Error('Choose a VDraw Blueprint (.json) saved from the Export panel.'); }
      accept(await interpret({ blueprint }), true);
    });
  }

  const applyRefine = (engine?: 'rules') => {
    if (!design || !instruction.trim()) return;
    void run(engine === 'rules' || !ai ? 'Applying your change…' : 'Refining the design: about 30 seconds…', async () => {
      accept(await refine(design.id, instruction.trim(), engine), false);
      setInstruction('');
    });
  };

  const onEdit = (next: DesignBlueprint, summary: string) => {
    if (!design) return;
    void run('Saving…', async () => accept(await saveEdit(design.id, next, summary), false));
  };

  const onUndo = () => {
    if (!design) return;
    void run('Undoing…', async () => accept(await undo(design.id), false));
  };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = checkImageFile(file);
    if (bad) {
      setFileError(bad);
      return;
    }
    setFileError(null);
    setUpload({ file, url: URL.createObjectURL(file) });
  }

  async function toggleVoice() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const audio = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        void run('Transcribing…', async () => {
          const said = await transcribe(audio);
          if (design) setInstruction((v) => `${v} ${said}`.trim());
          else setText((v) => `${v} ${said}`.trim());
        });
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setProblem({ message: 'Could not use the microphone. Allow access, and use localhost or HTTPS.', canTryRules: false });
    }
  }

  const openView = (next: View) => {
    setView(next);
    if (!design) return;
    if (next === 'cad' && cadSource === null) {
      void run('Generating CAD source…', async () => setCadSource(await (await exportFile(design.id, 'scad')).blob.text()));
    }
    if (next === 'web' && webPage === null) {
      void run('Generating the web page…', async () => setWebPage(await (await exportFile(design.id, 'webPage')).blob.text()));
    }
  };

  const download = (format: string) => {
    if (!design) return;
    void run('Preparing your file…', async () => {
      const file = await exportFile(design.id, format);
      saveFile(file);
      setExported((m) => ({ ...m, [format]: `${file.filename} · ${formatBytes(file.blob.size)}` }));
    });
  };

  const voiceOk = ai && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices);
  const canGenerate = !busy && (text.trim() !== '' || (inputMode === 'sketch' ? hasInk : Boolean(upload)));
  const bp = design?.blueprint ?? null;

  const voiceButton = voiceOk && (
    <button type="button" className={`btn btn-small ${recording ? 'btn-coral' : 'btn-ghost'}`} data-testid="voice" disabled={Boolean(busy)} onClick={toggleVoice}>
      {recording ? 'Stop recording' : 'Speak'}
    </button>
  );

  return (
    <div className={`app studio ${presenting ? 'is-presenting-studio' : ''}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="VDraw home">
          <span className="brand-icon"><Icon name="paper" size={25} /></span>
          <span className="wordmark">VDraw<span className="brand-period">.</span></span>
        </a>
        <span className="studio-label">Sketch it. Describe it. Bring it to life.</span>
        <div className="topbar-status">
          {status && (
            <span className={`pill ${ai ? 'pill-live' : 'pill-example'}`} data-testid="ai-pill">
              {ai ? `AI ready · ${status.ai.model}` : 'No API key: examples and rule-based edits only'}
            </span>
          )}
          <ConnectionPill connection={connection} />
          <button type="button" className={`btn btn-present ${presenting ? 'is-active' : ''}`} data-testid="presentation-toggle" aria-pressed={presenting} onClick={() => setPresenting((v) => !v)}>
            <Icon name={presenting ? 'close' : 'present'} size={18} />
            {presenting ? 'Back to studio' : 'Present'}
          </button>
        </div>
      </header>
      {statusError && <p className="banner">{statusError}</p>}

      <main className="studio-grid">
        <section className="col studio-side" aria-label="Your idea">
          <Card id="idea" title="Your idea">
            <div className="mode-switch" role="radiogroup" aria-label="Input type">
              {(['sketch', 'image'] as const).map((m) => (
                <label key={m} className={`seg ${inputMode === m ? 'seg-on' : ''}`}>
                  <input type="radio" name="input" checked={inputMode === m} onChange={() => setInputMode(m)} data-testid={`input-${m}`} />
                  {m === 'sketch' ? 'Sketch' : 'Upload image'}
                </label>
              ))}
            </div>
            <div className="studio-input">
              <div hidden={inputMode !== 'sketch'}>
                <SketchPad ref={sketch} onChange={setHasInk} busy={Boolean(busy)} />
              </div>
              {inputMode === 'image' && (
                <div className="sketch-preview upload-preview">
                  {upload ? <img src={upload.url} alt="Your reference" /> : <p className="sketch-empty">A photo of a sketch or a reference object.</p>}
                  <label className="btn btn-secondary btn-small file-btn upload-btn">
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="file-input" data-testid="image-input" onChange={onFile} />
                    {upload ? 'Change image' : 'Choose image'}
                  </label>
                </div>
              )}
              {fileError && <p className="msg msg-error">{fileError}</p>}
            </div>
            <label className="field">
              <span>Describe it (size, purpose, style)</span>
              <textarea
                className="studio-text"
                rows={3}
                maxLength={2000}
                value={text}
                data-testid="idea-text"
                placeholder="A modular desk organiser with a tall pen bin, two cups and a phone tray, about 24 cm wide"
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div className="button-row">
              {voiceButton}
              <button type="button" className="btn btn-primary studio-go" data-testid="generate" disabled={!canGenerate} onClick={() => generate()}>
                {ai ? 'Create design' : 'Create from words'}
              </button>
            </div>
            {!ai && status && (
              <p className="msg msg-warn small" data-testid="no-ai-note">
                Sketches and images need AI. Without a key, your words pick from the built-in designs below.
              </p>
            )}
          </Card>

          <Card id="scenarios" title="Real-life examples">
            <ul className="scenario-list">
              {status?.templates.map((t) => (
                <li key={t.id}>
                  <button type="button" className="scenario" data-testid={`template-${t.id}`} disabled={Boolean(busy)} onClick={() => loadTemplate(t.id)}>
                    <strong>{t.title}</strong>
                    <span>{t.scenario}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="footnote">Examples are built-in designs and use no AI.</p>
            <label className={`btn btn-ghost btn-small file-btn open-blueprint ${busy ? 'is-disabled' : ''}`}>
              <input type="file" accept=".json,application/json" className="file-input" data-testid="blueprint-import" disabled={Boolean(busy)} onChange={openBlueprint} />
              Open a saved Blueprint
            </label>
          </Card>
        </section>

        <section className="col studio-center" aria-label="Creation viewport">
          <div className="studio-tabs" role="tablist" aria-label="Output">
            {([['3d', '3D model'], ['cad', 'CAD source'], ['web', 'Web page'], ...(liveMode ? [['live', 'Live test']] as const : [])] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={`studio-tab ${view === id ? 'studio-tab-on' : ''}`} data-testid={`view-${id}`} disabled={!design} onClick={() => openView(id)}>
                {label}
              </button>
            ))}
            {design && <span className={`source-badge ${design.source.kind === 'ai' ? 'source-ai' : 'source-example'} studio-source`} data-testid="design-source">{design.source.label}</span>}
          </div>

          <div className="studio-stage stage-frame" data-testid="studio-stage">
            {bp && view === '3d' && (
              <div className="stage-canvas">
                <BlueprintViewport
                  blueprint={bp}
                  revealKey={revealKey}
                  selected={selected}
                  onSelect={setSelected}
                  clip={clip}
                  explode={exploded ? 1 : 0}
                  spin={spin}
                  resetNonce={resetNonce}
                  reducedMotion={reducedMotion}
                  fallback={<div className="webgl-fallback" data-testid="webgl-fallback"><p className="msg msg-warn">The 3D view isn't available in this browser. The inspector and every export still work.</p></div>}
                />
              </div>
            )}
            {bp && view === 'cad' && (
              <pre className="cad-source" data-testid="cad-source" tabIndex={0}>{cadSource ?? 'Generating…'}</pre>
            )}
            {bp && view === 'web' && (
              webPage
                ? <iframe className="web-preview" data-testid="web-preview" title={`Generated web page for ${bp.name}`} sandbox="allow-scripts" srcDoc={webPage} />
                : <div className="stage-empty"><p>Generating…</p></div>
            )}
            {bp && view === 'live' && <LiveStage blueprint={bp} state={liveState} reducedMotion={reducedMotion} />}
            {!bp && (
              <div className="stage-hint studio-empty">
                <p>One idea. Multiple outputs. Real, usable creations.</p>
                <p className="muted">Sketch or describe something, or start from a real-life example.</p>
              </div>
            )}
            {busy && <div className="studio-busy" role="status" data-testid="busy"><span className="studio-spinner" aria-hidden="true" />{busy}</div>}
            {bp && view === '3d' && (
              <p className="studio-dims num" data-testid="dimensions">{bp.dimensions.width} × {bp.dimensions.depth} × {bp.dimensions.height} mm</p>
            )}
            {bp && view === '3d' && (
              <div className="studio-toolbar" role="group" aria-label="View controls">
                {bp.interaction.turntable && <button type="button" className={`btn btn-small ${spin ? 'studio-on' : ''}`} aria-pressed={spin} onClick={() => setSpin((s) => !s)}>Spin</button>}
                {bp.interaction.explodedView && <button type="button" className={`btn btn-small ${exploded ? 'studio-on' : ''}`} aria-pressed={exploded} data-testid="exploded" onClick={() => setExploded((v) => !v)}>Exploded view</button>}
                {bp.animations.map((a) => (
                  <button key={a.name} type="button" className={`btn btn-small ${clipName === a.name ? 'studio-on' : ''}`} aria-pressed={clipName === a.name} data-testid="play-animation" onClick={() => setClipName((c) => (c === a.name ? null : a.name))}>{a.name}</button>
                ))}
                <button type="button" className="btn btn-small" onClick={() => setResetNonce((n) => n + 1)}>Reset view</button>
              </div>
            )}
          </div>

          {problem && (
            <div className="msg msg-error" role="alert" data-testid="problem">
              {problem.message} {design && 'Your current design was kept.'}
              {problem.canTryRules && (
                <div className="button-row">
                  <button type="button" className="btn btn-small" data-testid="try-rules" onClick={() => (design && instruction.trim() ? applyRefine('rules') : generate('rules'))}>
                    Try without AI
                  </button>
                </div>
              )}
            </div>
          )}

          {design && liveMode && view === 'live' && (
            <LiveCards blueprint={design.blueprint} version={design.version} state={liveState} connected={connection === 'online'} busy={Boolean(busy)} onApply={onEdit} />
          )}

          {design && (
            <Card id="refine" title="Refine it" className="studio-refine">
              <form
                className="refine-form"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  applyRefine();
                }}
              >
                <input
                  type="text"
                  className="refine-input"
                  maxLength={1000}
                  aria-label="Describe a change"
                  data-testid="refine-input"
                  value={instruction}
                  placeholder={ai ? 'Make it 20% wider and add a third cup' : 'Make it 20% wider, or make the tray blue'}
                  onChange={(e) => setInstruction(e.target.value)}
                />
                {voiceButton}
                <button type="submit" className="btn btn-primary" data-testid="refine-go" disabled={Boolean(busy) || !instruction.trim()}>Apply</button>
                <button type="button" className="btn btn-ghost" data-testid="undo" disabled={Boolean(busy) || design.history.length < 2} onClick={onUndo}>Undo</button>
              </form>
              {!ai && status && <p className="footnote">{status.ruleHelp}</p>}
              {design.notes.length > 0 && <ul className="msg msg-ok studio-notes" data-testid="notes">{design.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              {design.warnings.length > 0 && <ul className="msg msg-warn studio-notes" data-testid="warnings">{design.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              {design.blueprint.assumptions.length > 0 && (
                <div className="uncertain" data-testid="assumptions"><p className="uncertain-title">Assumed:</p><ul>{design.blueprint.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
              )}
            </Card>
          )}
        </section>

        <section className="col studio-side" aria-label="Inspector and export">
          {bp ? (
            <>
              <Card id="summary" title={bp.name}>
                <p className="studio-description">{bp.description}</p>
                <p className="muted small studio-usecase"><strong>Use:</strong> {bp.useCase}</p>
              </Card>
              <Card id="export" title="Export" testId="export-panel">
                <ul className="export-list">
                  {status?.formats.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="btn btn-secondary export-btn" data-testid={`export-${f.id}`} disabled={Boolean(busy)} onClick={() => download(f.id)}>{f.label}</button>
                      {exported[f.id] && <span className="muted small" data-testid={`exported-${f.id}`}>Saved {exported[f.id]}</span>}
                    </li>
                  ))}
                </ul>
                <p className="footnote">All formats come from version {design?.version} of this Blueprint.</p>
              </Card>
              <Inspector blueprint={bp} selectedId={selected} onSelect={setSelected} onEdit={onEdit} busy={Boolean(busy)} />
            </>
          ) : (
            <Card id="what" title="What you'll get">
              <ul className="studio-promise">
                <li>An interactive 3D model you can rotate, animate and take apart</li>
                <li>Editable CAD source for OpenSCAD</li>
                <li>STL for 3D printing and GLB for any 3D app</li>
                <li>A web component and a product page</li>
                <li>A live test for circuits and other designs that do something</li>
              </ul>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
