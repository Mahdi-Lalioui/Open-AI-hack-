/** Every built-in example, live, in one shared viewport. Tabs only swap the Blueprint it shows. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hasWebGL } from '../scene/World';
import { DESIGNS, LandingViewport, formatSize } from './shared';

const JUST_FOR_FUN = 'pixel_pet';

export function Examples({ reducedMotion }: { reducedMotion: boolean }) {
  const [id, setId] = useState(DESIGNS.find((d) => d.id === 'electronics_case')?.id ?? DESIGNS[0].id);
  const [play, setPlay] = useState(false);
  const [explode, setExplode] = useState(false);
  const [spin, setSpin] = useState(!reducedMotion);
  const [selected, setSelected] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const webgl = useRef(hasWebGL()).current;

  const design = DESIGNS.find((d) => d.id === id) ?? DESIGNS[0];
  const bp = design.blueprint;
  const clip = bp.animations[0] ?? null;
  const part = bp.components.find((c) => c.id === selected) ?? null;

  // A new design builds itself first, then plays its own animation.
  useEffect(() => {
    setSelected(null);
    setExplode(false);
    setPlay(false);
    if (reducedMotion) return;
    const t = window.setTimeout(() => setPlay(true), 1600);
    return () => window.clearTimeout(t);
  }, [id, reducedMotion]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = DESIGNS.findIndex((d) => d.id === id);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = DESIGNS[(at + step + DESIGNS.length) % DESIGNS.length];
    setId(next.id);
    tabs.current[next.id]?.focus();
  };

  return (
    <section id="examples" className="lp-section lp-examples" aria-labelledby="lp-examples-title">
      <div className="lp-wrap">
        <header className="lp-examples-head">
          <h2 id="lp-examples-title" className="lp-h2" data-rv>Pick one up and turn it around</h2>
          <p data-rv>
            These are the examples that come with VDraw, and each one is a real Blueprint running live on this page rather than a picture of one.
            Drag a model to turn it, click a part to find out what it's for, or pull the whole thing apart to see how it fits together.
          </p>
        </header>

        <div className="lp-tabs" role="tablist" aria-label="Example designs" onKeyDown={onKey} data-rv>
          {DESIGNS.map((d) => (
            <button
              key={d.id}
              ref={(el) => { tabs.current[d.id] = el; }}
              id={`lp-tab-${d.id}`}
              type="button"
              role="tab"
              aria-selected={d.id === id}
              aria-controls="lp-example-panel"
              tabIndex={d.id === id ? 0 : -1}
              className={`lp-tab ${d.id === JUST_FOR_FUN ? 'lp-tab--fun' : ''}`}
              onClick={() => setId(d.id)}
            >
              <span className="lp-tab-title">{d.title}</span>
              <span className="lp-tab-note">{d.id === JUST_FOR_FUN ? 'Just for fun' : d.scenario.split(',')[0]}</span>
            </button>
          ))}
        </div>

        <div id="lp-example-panel" className="lp-example" role="tabpanel" aria-labelledby={`lp-tab-${id}`}>
          <div className="lp-example-stage">
            <div className="lp-frame lp-frame--wide">
              <LandingViewport
                blueprint={bp}
                revealKey={`examples:${id}`}
                clip={play ? clip : null}
                explode={explode ? 1 : 0}
                spin={spin}
                selected={selected}
                onSelect={setSelected}
                resetNonce={resetNonce}
                reducedMotion={reducedMotion}
              />
            </div>
            {webgl && (
              <div className="lp-controls" role="group" aria-label="Model controls">
                {clip && <button type="button" aria-pressed={play} onClick={() => setPlay((p) => !p)}>{clip.name}</button>}
                <button type="button" aria-pressed={explode} onClick={() => setExplode((x) => !x)}>Exploded view</button>
                {!reducedMotion && <button type="button" aria-pressed={spin} onClick={() => setSpin((s) => !s)}>Turntable</button>}
                <button type="button" onClick={() => setResetNonce((n) => n + 1)}>Reset view</button>
              </div>
            )}
          </div>

          <div className="lp-example-facts">
            <p className="lp-example-scenario">{design.scenario}</p>
            <h3 className="lp-h3">{bp.name}</h3>
            <p>{bp.useCase}</p>
            <dl className="lp-facts">
              <div><dt>Overall size</dt><dd>{formatSize(bp)}</dd></div>
              <div><dt>Parts</dt><dd>{bp.components.length}</dd></div>
            </dl>
            <ul className="lp-swatches" aria-label="Materials">
              {bp.materials.map((m) => <li key={m.id}><span style={{ background: m.color }} aria-hidden="true" />{m.name}</li>)}
            </ul>
            <p className="lp-part" aria-live="polite">
              {part
                ? <><strong>{part.name}.</strong> {part.purpose}</>
                : webgl ? 'Click any part of the model to read what it does.' : 'This browser can’t show live 3D, so you’re seeing the details without the model.'}
            </p>
            {bp.circuit && <a className="lp-textlink lp-textlink--ink" href="#test">Flip this circuit's switch</a>}
          </div>
        </div>
      </div>
    </section>
  );
}
