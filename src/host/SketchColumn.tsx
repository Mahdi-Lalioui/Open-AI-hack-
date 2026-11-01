/** Left column: sketch preview (upload / example) → editable flow + assumptions → Build world. */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { NodeKind, PublicState } from '../../shared/types';
import { EXAMPLE_IMAGE_URL, EXAMPLE_LABEL } from '../../shared/example';
import { LABEL_MAX } from '../../shared/validation';
import { api, ApiClientError } from '../lib/api';
import { checkImageFile } from '../lib/format';
import { Card } from '../components/Card';
import {
  ARRIVAL_RANGE,
  KINDS,
  SERVICE_RANGE,
  checkDraft,
  draftFromExample,
  draftFromSketch,
  draftFromWorld,
  draftMatchesWorld,
  draftSource,
  emptyDraft,
  type Draft,
  type ValueMark,
} from './draft';

type SketchView = { kind: 'none' } | { kind: 'example' } | { kind: 'upload'; url: string; name: string };

type ReadStatus =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'read'; model: string; uncertainties: string[] }
  | { status: 'rejected'; model: string; messages: string[]; uncertainties: string[] }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

const STEP_TEXT: Record<NodeKind, { tag: string; label: string; hint: string; placeholder: string }> = {
  source: { tag: 'Start', label: 'Start step', hint: 'where orders come from', placeholder: 'e.g. Customers' },
  service: { tag: 'Service', label: 'Service step', hint: 'where the work happens', placeholder: 'e.g. Barista' },
  sink: { tag: 'End', label: 'End step', hint: 'where orders finish', placeholder: 'e.g. Pickup' },
};

const MARK_TEXT: Record<ValueMark, string> = {
  sketch: 'from sketch',
  default: 'default',
  edited: 'edited',
  world: 'current world',
};

const SOURCE_TEXT = {
  example: 'Built-in example (no image analysis)',
  vision: 'Read from your sketch',
  manual: 'Typed or edited by hand',
} as const;

const STAMP_MS = 600;

interface Props {
  state: PublicState | null;
  reducedMotion: boolean;
  onBuilt: () => void;
}

export function SketchColumn({ state, reducedMotion, onBuilt }: Props) {
  const [sketch, setSketch] = useState<SketchView>({ kind: 'none' });
  const [imgFailed, setImgFailed] = useState(false);
  const [read, setRead] = useState<ReadStatus>({ status: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [stamping, setStamping] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const readSeq = useRef(0);
  const uploadUrl = useRef<string | null>(null);
  const loadedFromWorld = useRef(false);

  const world = state?.world ?? null;

  // On first load, show the world that is already live (e.g. after a page refresh).
  useEffect(() => {
    if (loadedFromWorld.current || !world) return;
    loadedFromWorld.current = true;
    setDraft((d) => {
      if (d.origin !== 'none' || d.edited) return d;
      return draftFromWorld(world);
    });
    if (world.source === 'example') setSketch((s) => (s.kind === 'none' ? { kind: 'example' } : s));
  }, [world]);

  useEffect(
    () => () => {
      if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
    },
    [],
  );

  const check = useMemo(() => checkDraft(draft), [draft]);
  const confirmed = useMemo(() => draftMatchesWorld(draft, world), [draft, world]);
  const source = draftSource(draft);

  function setUpload(url: string | null, name = '') {
    if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
    uploadUrl.current = url;
    setImgFailed(false);
    setSketch(url ? { kind: 'upload', url, name } : { kind: 'none' });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setBuildError(null);
    setUpload(URL.createObjectURL(file), file.name);
    setRead({ status: 'reading' });
    const seq = ++readSeq.current;
    try {
      const res = await api.analyzeImage(file);
      if (seq !== readSeq.current) return;
      const next = draftFromSketch(res.sketch);
      if (next.ok) {
        setDraft(next.draft);
        setTouched({});
        setRead({ status: 'read', model: res.model, uncertainties: res.sketch.uncertainties ?? [] });
      } else {
        setRead({ status: 'rejected', model: res.model, messages: next.errors, uncertainties: res.sketch.uncertainties ?? [] });
      }
    } catch (err) {
      if (seq !== readSeq.current) return;
      if (err instanceof ApiClientError && err.code === 'not_configured') setRead({ status: 'not_configured' });
      else setRead({ status: 'error', message: (err as Error).message || 'The sketch could not be read.' });
    }
  }

  function tryExample() {
    readSeq.current++;
    setUpload(null);
    setSketch({ kind: 'example' });
    setRead({ status: 'idle' });
    setFileError(null);
    setBuildError(null);
    setDraft(draftFromExample());
    setTouched({});
  }

  function editLabel(kind: NodeKind, value: string) {
    setDraft((d) => ({ ...d, edited: true, labels: { ...d.labels, [kind]: value } }));
    setTouched((t) => ({ ...t, [kind]: true }));
  }

  function editNumber(field: 'arrival' | 'service', value: string) {
    setDraft((d) => ({ ...d, edited: true, [field]: value, marks: { ...d.marks, [field]: 'edited' } }));
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function editWorkers(value: 1 | 2) {
    setDraft((d) => ({ ...d, edited: true, workers: value, marks: { ...d.marks, workers: 'edited' } }));
  }

  async function build() {
    if (!check.ok || building) return;
    setBuildError(null);
    setBuilding(true);
    setStamping(true);
    const input = check.input;
    try {
      if (!reducedMotion) await new Promise((r) => setTimeout(r, STAMP_MS));
      await api.buildWorld(input);
      // The draft now describes the live world: future edits count as manual.
      setDraft((d) => ({ ...d, origin: d.edited ? 'world' : d.origin, worldSource: input.source, edited: false }));
      onBuilt();
    } catch (err) {
      const details = err instanceof ApiClientError && Array.isArray(err.details) ? (err.details as string[]).join(' ') : '';
      setBuildError(`${(err as Error).message}${details ? ` ${details}` : ''} The last confirmed world was kept.`);
    } finally {
      setBuilding(false);
      setStamping(false);
    }
  }

  const showErr = (key: string) => touched[key] || draft.origin !== 'none';
  const uncertainties = read.status === 'read' || read.status === 'rejected' ? read.uncertainties : [];
  const emptyLabels = KINDS.every((k) => !draft.labels[k].trim());

  return (
    <>
      <Card
        id="sketch"
        title="Sketch"
        className={`sketch-card ${stamping ? 'is-stamping' : ''}`}
        aside={sketch.kind === 'example' ? <span className="tag tag-example">Example</span> : null}
      >
        <div className="sketch-preview" data-testid="sketch-preview">
          {sketch.kind === 'none' && (
            <div className="sketch-empty">
              <SketchDoodle />
              <p>Photograph a 3-step drawing, or try the example.</p>
            </div>
          )}
          {sketch.kind === 'example' &&
            (imgFailed ? (
              <SketchDoodle labelled />
            ) : (
              <img
                src={EXAMPLE_IMAGE_URL}
                alt="Example sketch: Customers, arrow to Barista, arrow to Pickup"
                onError={() => setImgFailed(true)}
              />
            ))}
          {sketch.kind === 'upload' &&
            (imgFailed ? (
              <p className="sketch-empty">Preview not available for {sketch.name}.</p>
            ) : (
              <img src={sketch.url} alt={`Your uploaded sketch (${sketch.name})`} onError={() => setImgFailed(true)} />
            ))}
          {(confirmed || stamping) && (
            <span className={`stamp ${stamping ? 'stamp-in' : ''}`} aria-hidden="true">
              Confirmed
            </span>
          )}
        </div>

        {sketch.kind === 'example' && (
          <p className="example-badge" data-testid="example-badge">
            {EXAMPLE_LABEL}
          </p>
        )}

        <div className="button-row">
          <label className="btn btn-secondary file-btn">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              data-testid="upload-input"
              onChange={onFile}
              className="file-input"
            />
            Upload or take photo
          </label>
          <button type="button" className="btn btn-secondary" data-testid="try-example" onClick={tryExample}>
            Try example
          </button>
        </div>

        <div className="sketch-status" aria-live="polite" data-testid="sketch-status">
          {fileError && <p className="msg msg-error">{fileError}</p>}
          {read.status === 'reading' && <p className="msg msg-info">Reading your sketch…</p>}
          {read.status === 'read' && <p className="msg msg-ok">Read by {read.model}. Check the steps below.</p>}
          {read.status === 'not_configured' && (
            <p className="msg msg-warn">
              Live image reading needs an OPENAI_API_KEY on the server. You can still type the three steps by hand
              below.
            </p>
          )}
          {read.status === 'rejected' && (
            <div className="msg msg-warn">
              <p>
                {read.model ? `Read by ${read.model}, but ` : ''}this sketch can't be used as is:
              </p>
              <ul>
                {read.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p>{world ? 'Your current world was kept.' : 'Type the steps by hand or try the example.'}</p>
            </div>
          )}
          {read.status === 'error' && (
            <p className="msg msg-error">
              Couldn't read the sketch: {read.message} {world ? 'Your current world was kept.' : ''}
            </p>
          )}
          {uncertainties.length > 0 && (
            <div className="uncertain" data-testid="uncertainties">
              <p className="uncertain-title">Not sure about:</p>
              <ul>
                {uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card id="flow" title="Flow" className="flow-card">
        <p className="flow-origin">
          {emptyLabels && draft.origin === 'none' ? 'Name the three steps, or start from the example.' : SOURCE_TEXT[source]}
        </p>
        <ol className="flow-chain">
          {KINDS.map((kind, i) => {
            const t = STEP_TEXT[kind];
            const err = showErr(kind) ? check.errors.labels[kind] : undefined;
            const id = `label-${kind}`;
            return (
              <li key={kind} className="flow-step">
                {i > 0 && <ArrowDown />}
                <div className={`chip ${err ? 'chip-invalid' : ''}`}>
                  <label htmlFor={id} className="chip-label">
                    <span className="chip-tag">{t.tag}</span> {t.hint}
                  </label>
                  <input
                    id={id}
                    type="text"
                    className="chip-input"
                    data-testid={`label-input-${kind}`}
                    maxLength={LABEL_MAX}
                    value={draft.labels[kind]}
                    placeholder={t.placeholder}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${id}-err` : undefined}
                    onChange={(e) => editLabel(kind, e.target.value)}
                    autoComplete="off"
                  />
                </div>
                {err && (
                  <p className="field-error" id={`${id}-err`}>
                    {err}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <fieldset className="assumptions">
          <legend>Assumptions (adjustable, not facts)</legend>
          <NumberRow
            id="assumption-arrival"
            label="New customer every"
            value={draft.arrival}
            min={ARRIVAL_RANGE[0]}
            max={ARRIVAL_RANGE[1]}
            mark={draft.marks.arrival}
            error={showErr('arrival') ? check.errors.arrival : undefined}
            onChange={(v) => editNumber('arrival', v)}
          />
          <NumberRow
            id="assumption-service"
            label="Service time per order"
            value={draft.service}
            min={SERVICE_RANGE[0]}
            max={SERVICE_RANGE[1]}
            mark={draft.marks.service}
            error={showErr('service') ? check.errors.service : undefined}
            onChange={(v) => editNumber('service', v)}
          />
          <div className="assume-row" role="radiogroup" aria-labelledby="workers-label" data-testid="assumption-workers">
            <span id="workers-label" className="assume-label">
              Workers at start <Mark mark={draft.marks.workers} />
            </span>
            <div className="segmented">
              {([1, 2] as const).map((n) => (
                <label key={n} className={`seg ${draft.workers === n ? 'seg-on' : ''}`}>
                  <input
                    type="radio"
                    name="workers"
                    value={n}
                    checked={draft.workers === n}
                    onChange={() => editWorkers(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>
          {draft.notes.length > 0 && (
            <ul className="draft-notes">
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </fieldset>

        {check.errors.chain.length > 0 && showErr('chain') && (
          <ul className="field-error chain-errors">
            {check.errors.chain.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn btn-primary btn-build"
          data-testid="build-world"
          onClick={build}
          disabled={!check.ok || building || !state}
          aria-describedby="build-hint"
        >
          {building ? 'Building…' : confirmed ? 'Rebuild world' : 'Build world'}
        </button>
        <div id="build-hint" className="build-hint" aria-live="polite">
          {buildError ? (
            <p className="msg msg-error" role="alert">
              {buildError}
            </p>
          ) : !state ? (
            <p>Waiting for the server…</p>
          ) : !check.ok ? (
            <p>{emptyLabels ? 'Name all three steps to build.' : check.messages[0]}</p>
          ) : confirmed ? (
            <p>This flow is the live world. Rebuilding restarts the simulation.</p>
          ) : (
            <p>Building replaces the current world and restarts the simulation.</p>
          )}
        </div>
      </Card>
    </>
  );
}

function Mark({ mark }: { mark: ValueMark }) {
  return <span className={`mark mark-${mark}`}>{MARK_TEXT[mark]}</span>;
}

interface NumberRowProps {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  mark: ValueMark;
  error?: string;
  onChange: (v: string) => void;
}

function NumberRow({ id, label, value, min, max, mark, error, onChange }: NumberRowProps) {
  return (
    <div className="assume-row">
      <label htmlFor={id} className="assume-label">
        {label} <Mark mark={mark} />
      </label>
      <div className="num-field">
        <input
          id={id}
          data-testid={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="unit" aria-hidden="true">
          s
        </span>
      </div>
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

function ArrowDown() {
  return (
    <svg className="flow-arrow" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 2 C 10 8, 12 12, 11 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 13 L11 19 L16 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Hand-drawn style placeholder: three boxes joined by arrows. */
function SketchDoodle({ labelled = false }: { labelled?: boolean }) {
  const boxes = [
    { x: 8, label: 'Customers' },
    { x: 108, label: 'Barista' },
    { x: 208, label: 'Pickup' },
  ];
  return (
    <svg className="doodle" viewBox="0 0 300 110" role={labelled ? 'img' : undefined} aria-hidden={labelled ? undefined : true} aria-label={labelled ? 'Example sketch: Customers → Barista → Pickup' : undefined}>
      {boxes.map((b, i) => (
        <g key={b.label}>
          <path
            d={`M${b.x + 2} 32 Q ${b.x + 40} 28 ${b.x + 82} 33 L ${b.x + 80} 78 Q ${b.x + 42} 82 ${b.x + 3} 77 Z`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {labelled && (
            <text x={b.x + 42} y={60} textAnchor="middle" fontSize="13" fill="currentColor" fontFamily="'Comic Sans MS','Marker Felt',cursive">
              {b.label}
            </text>
          )}
          {i < 2 && (
            <path
              d={`M${b.x + 86} 55 Q ${b.x + 95} 52 ${b.x + 104} 55 M${b.x + 98} 49 L ${b.x + 104} 55 L ${b.x + 97} 61`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
