/** Left column: Pet | Circuit mode, sketch upload / example, editor, Build in 3D. */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  BodyShape, CircuitComponent, CircuitSpec, ComponentType, CreationConfig, EarStyle, EyeStyle, PetExtra, PetSpec, SketchMode, TailStyle,
} from '../../shared/creations';
import { EXAMPLE_LABEL } from '../../shared/example';
import { ApiClientError } from '../lib/api';
import { analyzeCreation, buildCreation } from '../lib/creationApi';
import { checkImageFile } from '../lib/format';
import { Card } from '../components/Card';
import { exampleCircuit, examplePet, PET_STARTERS } from './examples';
import { SketchPad } from './SketchPad';

type Source = 'example' | 'vision' | 'manual';
type Read =
  | { s: 'idle' } | { s: 'reading' } | { s: 'read'; model: string; unsure: string[] }
  | { s: 'rejected'; model: string; unsure: string[] } | { s: 'not_configured' } | { s: 'error'; message: string };

const SHAPES: BodyShape[] = ['round', 'oval', 'bean', 'blob', 'tall'];
const EARS: EarStyle[] = ['none', 'pointy', 'round', 'floppy', 'antenna'];
const TAILS: TailStyle[] = ['none', 'short', 'long', 'curly'];
const EYES: EyeStyle[] = ['round', 'big', 'sleepy'];
const EXTRAS: PetExtra[] = ['wings', 'horn', 'spots', 'hat', 'whiskers'];
const TYPES: ComponentType[] = ['battery', 'resistor', 'led', 'bulb', 'switch'];
const UNIT: Record<ComponentType, string> = { battery: 'V', resistor: 'Ω', led: 'V fwd', bulb: 'Ω', switch: '' };
const HEX = /^#[0-9a-fA-F]{6}$/;

function petErrors(p: PetSpec): string[] {
  const e: string[] = [];
  if (!p.name.trim()) e.push('Give the pet a name.');
  if (p.name.length > 20) e.push('Name must be at most 20 characters.');
  if (!HEX.test(p.bodyColor) || !HEX.test(p.accentColor)) e.push('Colors must be #rrggbb.');
  return e;
}

function circuitErrors(c: CircuitSpec): string[] {
  const e: string[] = [];
  if (!c.components.length) e.push('Add at least one component.');
  if (!c.components.some((x) => x.type === 'battery')) e.push('A circuit needs a battery.');
  const ids = new Set(c.components.map((x) => x.id));
  if (c.wires.some((w) => !ids.has(w.from) || !ids.has(w.to))) e.push('A wire points to a missing component.');
  if (c.components.some((x) => !x.label.trim())) e.push('Every component needs a label.');
  return e;
}

interface Props { mode: SketchMode; onMode: (m: SketchMode) => void; connected: boolean; reducedMotion: boolean; onBuilt: () => void; creation?: CreationConfig | null; visionReady?: boolean; onBusyChange?: (busy: boolean) => void; externalBusy?: boolean }

export function CreationColumn({ mode, onMode, connected, reducedMotion, onBuilt, creation, visionReady = true, onBusyChange, externalBusy = false }: Props) {
  const [inputMethod, setInputMethod] = useState<'draw' | 'upload'>('upload');
  const [preview, setPreview] = useState<{ kind: 'none' } | { kind: 'example' } | { kind: 'upload'; url: string }>({ kind: 'none' });
  const [read, setRead] = useState<Read>({ s: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [pet, setPet] = useState<PetSpec>(examplePet);
  const [circuit, setCircuit] = useState<CircuitSpec>(exampleCircuit);
  const [origin, setOrigin] = useState<Record<SketchMode, Source>>({ pet: 'manual', circuit: 'manual' });
  const [building, setBuilding] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [stamp, setStamp] = useState(false);
  const [buildMsg, setBuildMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const seq = useRef(0);
  const urlRef = useRef<string | null>(null);
  const readLock = useRef(false);
  const buildLock = useRef(false);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => { onBusyChange?.(building || recognizing); }, [building, recognizing, onBusyChange]);
  useEffect(() => {
    if (!stamp) return;
    const timer = setTimeout(() => setStamp(false), 1800);
    return () => clearTimeout(timer);
  }, [stamp]);

  // Socket ticks keep the same version. Only a newly confirmed blueprint replaces a draft.
  useEffect(() => {
    if (!creation) return;
    seq.current++;
    if (creation.pet) setPet(structuredClone(creation.pet));
    if (creation.circuit) setCircuit(structuredClone(creation.circuit));
    setOrigin((o) => ({ ...o, [creation.mode]: creation.source }));
    onMode(creation.mode);
    setRead({ s: 'idle' });
  }, [creation?.version]);

  const errors = mode === 'pet' ? petErrors(pet) : circuitErrors(circuit);
  const source = origin[mode];
  const edit = () => { seq.current++; setStamp(false); setRead({ s: 'idle' }); setBuildMsg(null); setOrigin((o) => ({ ...o, [mode]: 'manual' })); };
  const setUrl = (u: string | null) => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = u; };

  function switchMode(m: SketchMode) {
    if (m === mode || building || readLock.current || externalBusy) return;
    seq.current++;
    setRead({ s: 'idle' }); setFileError(null); setBuildMsg(null); setUrl(null); setPreview({ kind: 'none' });
    onMode(m);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await readFile(file);
  }

  async function readFile(file: File) {
    if (readLock.current || buildLock.current || externalBusy) return;
    const bad = checkImageFile(file);
    if (bad) { setFileError(bad); return; }
    setFileError(null);
    const u = URL.createObjectURL(file); setUrl(u); setPreview({ kind: 'upload', url: u });
    if (!visionReady) { setRead({ s: 'not_configured' }); return; }
    readLock.current = true;
    setRecognizing(true);
    setRead({ s: 'reading' });
    const my = ++seq.current;
    try {
      const res = await analyzeCreation(file, mode);
      if (my !== seq.current) return;
      const c = res.creation;
      const unsure = c.uncertainties ?? [];
      if (c.inScope && mode === 'pet' && c.pet) { setPet(c.pet); setOrigin((o) => ({ ...o, pet: 'vision' })); setRead({ s: 'read', model: res.model, unsure }); }
      else if (c.inScope && mode === 'circuit' && c.circuit) { setCircuit(c.circuit); setOrigin((o) => ({ ...o, circuit: 'vision' })); setRead({ s: 'read', model: res.model, unsure }); }
      else setRead({ s: 'rejected', model: res.model, unsure });
    } catch (err) {
      if (my !== seq.current) return;
      if (err instanceof ApiClientError && err.code === 'not_configured') setRead({ s: 'not_configured' });
      else setRead({ s: 'error', message: (err as Error).message });
    } finally { readLock.current = false; setRecognizing(false); }
  }

  function tryExample() {
    if (building || readLock.current || externalBusy) return;
    seq.current++; setStamp(false); setUrl(null); setPreview({ kind: 'example' }); setRead({ s: 'idle' }); setFileError(null); setBuildMsg(null);
    if (mode === 'pet') setPet(examplePet()); else setCircuit(exampleCircuit());
    setOrigin((o) => ({ ...o, [mode]: 'example' }));
  }

  function starter(id: string) {
    if (building || readLock.current || externalBusy) return;
    const choice = PET_STARTERS.find((p) => p.id === id);
    if (!choice) return;
    seq.current++; setStamp(false); setPet(structuredClone(choice.pet)); setRead({ s: 'idle' }); setFileError(null); setBuildMsg(null);
    setUrl(null); setPreview({ kind: 'none' }); setOrigin((o) => ({ ...o, pet: 'example' }));
  }

  async function build() {
    if (errors.length || buildLock.current || readLock.current || externalBusy) return;
    buildLock.current = true;
    setBuilding(true); setStamp(false); setBuildMsg(null);
    try {
      if (!reducedMotion) await new Promise((r) => setTimeout(r, 600));
      await buildCreation(mode === 'pet' ? { mode, pet, source } : { mode, circuit, source });
      setStamp(true);
      setBuildMsg({ ok: true, text: 'Built. Watch it rise on the stage.' });
      onBuilt();
    } catch (err) {
      setBuildMsg({ ok: false, text: `${(err as Error).message} The last confirmed creation was kept.` });
    } finally { buildLock.current = false; setBuilding(false); }
  }

  const unsure = read.s === 'read' || read.s === 'rejected' ? read.unsure : [];

  return (
    <>
      <div className="mode-switch" role="radiogroup" aria-label="What did you draw?" data-testid="mode-switch">
        {(['pet', 'circuit'] as const).map((m) => (
          <label key={m} className={`seg ${mode === m ? 'seg-on' : ''}`}>
            <input type="radio" name="mode" value={m} checked={mode === m} disabled={building || recognizing || externalBusy} onChange={() => switchMode(m)} data-testid={`mode-${m}`} />
            {m === 'pet' ? 'Pet' : 'Circuit'}
          </label>
        ))}
      </div>

      <Card id="sketch" title={mode === 'pet' ? 'Pet sketch' : 'Circuit sketch'} className={`sketch-card ${stamp ? 'is-stamping' : ''}`}>
        {mode === 'pet' && <div className="starter-list" role="group" aria-label="Pet starters">
          {PET_STARTERS.map((p) => <button type="button" key={p.id} className="starter" disabled={building || recognizing || externalBusy} onClick={() => starter(p.id)} title={p.note} data-testid={`starter-${p.id}`}><span className="starter-swatch" style={{ background: p.pet.bodyColor }} aria-hidden="true" />{p.label}</button>)}
        </div>}
        <button type="button" className="btn btn-primary quick-build" data-testid="quick-build" disabled={!connected || building || recognizing || externalBusy || errors.length > 0} onClick={build}>{building ? 'Building…' : mode === 'pet' ? `Bring ${pet.name || 'your pet'} to life` : 'Bring your circuit to life'}</button>
        <div className="input-tabs" role="group" aria-label="Sketch input">
          <button type="button" className={`btn btn-ghost btn-small ${inputMethod === 'draw' ? 'is-active' : ''}`} aria-pressed={inputMethod === 'draw'} data-testid="input-draw" onClick={() => setInputMethod('draw')}>Draw</button>
          <button type="button" className={`btn btn-ghost btn-small ${inputMethod === 'upload' ? 'is-active' : ''}`} aria-pressed={inputMethod === 'upload'} onClick={() => setInputMethod('upload')}>Upload</button>
        </div>
        <div hidden={inputMethod !== 'draw'}><SketchPad busy={building || recognizing || externalBusy} onRead={readFile} /></div>
        {inputMethod === 'upload' && <>
        <div className="sketch-preview" data-testid="sketch-preview">
          {preview.kind === 'none' && <p className="sketch-empty">Photograph your drawing, or try the example.</p>}
          {preview.kind === 'example' && (
            <img src={mode === 'pet' ? '/example-pet.png' : '/example-circuit.png'} alt={mode === 'pet' ? 'Example pet drawing: Pixel, a round teal critter' : 'Example circuit drawing: battery, switch, resistor and LED in a loop'} />
          )}
          {preview.kind === 'upload' && <img src={preview.url} alt="Your uploaded sketch" />}
          {stamp && <span className="stamp stamp-in" aria-hidden="true">Confirmed</span>}
        </div>
        {preview.kind === 'example' && <p className="example-badge" data-testid="example-badge">{EXAMPLE_LABEL}</p>}
        <div className="button-row">
          <label className="btn btn-secondary file-btn">
            <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" disabled={building || recognizing || externalBusy} data-testid="upload-input" onChange={onFile} className="file-input" />
            Upload or take photo
          </label>
          <button type="button" className="btn btn-secondary" data-testid="try-example" disabled={building || recognizing || externalBusy} onClick={tryExample}>Try example</button>
        </div>
        </>}
        {!visionReady && <p className="sketch-help">Example mode: try a starter and edit every part below. Photo and drawing interpretation need a server API key.</p>}
        <div aria-live="polite" data-testid="sketch-status">
          {fileError && <p className="msg msg-error">{fileError}</p>}
          {read.s === 'reading' && <p className="msg msg-info">Reading your sketch…</p>}
          {read.s === 'read' && <p className="msg msg-ok">Read by {read.model}. Check the details below.</p>}
          {read.s === 'rejected' && <p className="msg msg-warn">Read by {read.model}, but it doesn’t look like a {mode}. Your current creation was kept.</p>}
          {read.s === 'not_configured' && <p className="msg msg-warn">Live image reading needs an OPENAI_API_KEY on the server. You can still fill in the details by hand below.</p>}
          {read.s === 'error' && <p className="msg msg-error">Couldn’t read the sketch: {read.message} Your current creation was kept.</p>}
          {unsure.length > 0 && (
            <div className="uncertain"><p className="uncertain-title">Not sure about:</p><ul>{unsure.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
          )}
        </div>
      </Card>

      <Card id="editor" title={mode === 'pet' ? 'Your pet' : 'Your circuit'}>
        <p className="flow-origin">{source === 'example' ? EXAMPLE_LABEL : source === 'vision' ? 'Read from your sketch' : 'Edited by hand'}</p>
        <fieldset className="editor-fields" disabled={building || recognizing || externalBusy}>
        {mode === 'pet' ? (
          <PetEditor pet={pet} onChange={(p) => { setPet(p); edit(); }} />
        ) : (
          <CircuitEditor circuit={circuit} onChange={(c) => { setCircuit(c); edit(); }} />
        )}
        </fieldset>
        {errors.length > 0 && <ul className="field-error">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" className="btn btn-primary btn-build" data-testid="build-world" onClick={build} disabled={!connected || building || recognizing || externalBusy || errors.length > 0}>
          {building ? 'Building…' : 'Build in 3D'}
        </button>
        <div aria-live="polite">{buildMsg && <p className={`msg ${buildMsg.ok ? 'msg-ok' : 'msg-error'}`}>{buildMsg.text}</p>}</div>
      </Card>
    </>
  );
}

function Select<T extends string | number>({ label, value, options, onChange, testId, show }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; testId?: string; show?: (v: T) => string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value)} data-testid={testId} onChange={(e) => onChange(options.find((o) => String(o) === e.target.value)!)}>
        {options.map((o) => <option key={String(o)} value={String(o)}>{show ? show(o) : String(o)}</option>)}
      </select>
    </label>
  );
}

function PetEditor({ pet, onChange }: { pet: PetSpec; onChange: (p: PetSpec) => void }) {
  const set = <K extends keyof PetSpec>(k: K, v: PetSpec[K]) => onChange({ ...pet, [k]: v });
  return (
    <div className="editor-grid">
      <label className="field field-wide"><span>Name</span>
        <input type="text" maxLength={20} value={pet.name} data-testid="pet-name" onChange={(e) => set('name', e.target.value)} /></label>
      <Select label="Body shape" value={pet.bodyShape} options={SHAPES} onChange={(v) => set('bodyShape', v)} testId="pet-body" />
      <label className="field"><span>Body color</span><input type="color" value={pet.bodyColor} onChange={(e) => set('bodyColor', e.target.value)} /></label>
      <label className="field"><span>Accent color</span><input type="color" value={pet.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></label>
      <Select label="Eyes" value={pet.eyeCount} options={[1, 2, 3] as const} onChange={(v) => set('eyeCount', v)} />
      <Select label="Eye style" value={pet.eyeStyle} options={EYES} onChange={(v) => set('eyeStyle', v)} />
      <Select label="Ears" value={pet.ears} options={EARS} onChange={(v) => set('ears', v)} />
      <Select label="Legs" value={pet.legs} options={[0, 2, 4] as const} onChange={(v) => set('legs', v)} />
      <Select label="Tail" value={pet.tail} options={TAILS} onChange={(v) => set('tail', v)} />
      <Select label="Mouth" value={pet.mouth} options={['smile', 'open', 'none'] as const} onChange={(v) => set('mouth', v)} />
      <fieldset className="field-wide extras"><legend>Extras</legend>
        {EXTRAS.map((x) => (
          <label key={x} className="check"><input type="checkbox" checked={pet.extras.includes(x)}
            onChange={(e) => set('extras', e.target.checked ? [...pet.extras, x] : pet.extras.filter((y) => y !== x))} /> {x}</label>
        ))}
      </fieldset>
    </div>
  );
}

function CircuitEditor({ circuit, onChange }: { circuit: CircuitSpec; onChange: (c: CircuitSpec) => void }) {
  const upd = (i: number, patch: Partial<CircuitComponent>) =>
    onChange({ ...circuit, components: circuit.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => {
    let n = circuit.components.length + 1;
    while (circuit.components.some((c) => c.id === `c${n}`)) n++;
    onChange({ ...circuit, components: [...circuit.components, { id: `c${n}`, type: 'resistor', label: 'Resistor', value: 470, x: 0.2 + ((n - 1) % 4) * 0.2, y: 0.25 + (Math.floor((n - 1) / 4) % 3) * 0.25 }] });
  };
  const remove = (id: string) => onChange({ components: circuit.components.filter((c) => c.id !== id), wires: circuit.wires.filter((w) => w.from !== id && w.to !== id) });
  const ids = circuit.components.map((c) => c.id);
  const name = (id: string) => circuit.components.find((c) => c.id === id)?.label ?? id;
  return (
    <div>
      <ol className="comp-list">
        {circuit.components.map((c, i) => (
          <li key={c.id} className="comp-row">
            <Select label="Type" value={c.type} options={TYPES} onChange={(v) => upd(i, { type: v, value: v === 'switch' ? null : c.value })} />
            <label className="field"><span>Label</span><input type="text" maxLength={24} value={c.label} onChange={(e) => upd(i, { label: e.target.value })} /></label>
            {c.type !== 'switch' && (
              <label className="field"><span>Value ({UNIT[c.type]})</span>
                <input type="number" min={0} step="any" value={c.value ?? ''} placeholder="default"
                  onChange={(e) => upd(i, { value: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            )}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => remove(c.id)} aria-label={`Remove ${c.label}`}>Remove</button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-secondary btn-small" onClick={add}>Add component</button>
      <h3 className="sub">Wires</h3>
      <ul className="wire-list">
        {circuit.wires.map((w, i) => (
          <li key={i} className="wire-row">
            <Select label="From" value={w.from} options={ids} show={name} onChange={(v) => onChange({ ...circuit, wires: circuit.wires.map((x, j) => (j === i ? { ...x, from: v } : x)) })} />
            <span aria-hidden="true">→</span>
            <Select label="To" value={w.to} options={ids} show={name} onChange={(v) => onChange({ ...circuit, wires: circuit.wires.map((x, j) => (j === i ? { ...x, to: v } : x)) })} />
            <button type="button" className="btn btn-ghost btn-small" aria-label={`Remove wire ${name(w.from)} to ${name(w.to)}`}
              onClick={() => onChange({ ...circuit, wires: circuit.wires.filter((_, j) => j !== i) })}>Remove</button>
          </li>
        ))}
      </ul>
      {ids.length >= 2 && (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange({ ...circuit, wires: [...circuit.wires, { from: ids[0], to: ids[1] }] })}>Add wire</button>
      )}
    </div>
  );
}
