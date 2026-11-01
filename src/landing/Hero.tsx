/** The opening: a pencil drawing of a real design draws itself, then the real model grows out of it. */
import { useEffect, useRef, useState } from 'react';
import { hasWebGL } from '../scene/World';
import { DESIGNS, LandingViewport, SketchLines, TRY_HREF, designById, formatSize, useInView, type LandingDesign } from './shared';

const HERO_ORDER = ['bedside_table', 'desk_organiser', 'electronics_case', 'planter', 'led_circuit'];
const SKETCH_MS = 2300;
const LINES_FADE_MS = 4000;
const NEXT_MS = 12500;

type Phase = 'sketch' | 'solid' | 'live';

const designs: LandingDesign[] = HERO_ORDER.flatMap((id) => designById(id) ?? []);

const ANNOTATION: Record<Phase, string> = {
  sketch: 'first, the idea',
  solid: 'then, the real parts',
  live: '',
};

export function Hero({ reducedMotion }: { reducedMotion: boolean }) {
  const [sheet, inView] = useInView<HTMLDivElement>('0px');
  const webgl = useRef(hasWebGL()).current;
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>(reducedMotion || !webgl ? 'live' : 'sketch');
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [built, setBuilt] = useState(0);

  const design = designs[index] ?? DESIGNS[0];
  const model = designs[shown] ?? DESIGNS[0];
  const clip = model.blueprint.animations[0] ?? null;
  const still = reducedMotion || paused;

  // One pass of the drawing. It waits for the sheet to be on screen, so the first drawing is never missed.
  useEffect(() => {
    if (!inView) return;
    if (reducedMotion || !webgl) {
      setShown(index);
      setPhase('live');
      return;
    }
    setPhase('sketch');
    const timers = [
      window.setTimeout(() => {
        setShown(index);
        setBuilt((b) => b + 1);
        setPhase('solid');
      }, SKETCH_MS),
      window.setTimeout(() => setPhase('live'), LINES_FADE_MS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [index, run, inView, reducedMotion, webgl]);

  // Moves on to the next design, unless the visitor paused or the sheet has scrolled away.
  useEffect(() => {
    if (reducedMotion || paused || !inView) return;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % designs.length);
      setRun((r) => r + 1);
    }, NEXT_MS);
    return () => window.clearTimeout(t);
  }, [index, run, paused, inView, reducedMotion]);

  const pick = (i: number) => {
    setIndex(i);
    setRun((r) => r + 1);
  };

  const moving = phase === 'live' && !still;
  const note = phase === 'live' ? (clip?.name ?? 'Turntable').toLowerCase() : ANNOTATION[phase];

  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-copy">
        <h1 id="lp-hero-title" className="lp-tagline">
          <span className="lp-tag-sketch">Sketch it.</span>{' '}
          <span className="lp-tag-describe"><span>Describe it.</span></span>{' '}
          <span className="lp-tag-life">Bring it to life<span className="lp-accent">.</span></span>
        </h1>
        <p className="lp-hero-lede">
          Draw something rough, upload a photo, type a sentence or say it out loud, and VDraw builds it as a 3D model you can keep changing.
          When it looks right, you download real files that a 3D printer or a CAD program can open.
        </p>
        <div className="lp-hero-actions">
          <a className="lp-cta" href={TRY_HREF}>Try it out</a>
          <a className="lp-textlink" href="#examples">See what it can make</a>
        </div>
      </div>

      <div className="lp-hero-work">
        <div className="lp-sheet-under" aria-hidden="true" />
        <div ref={sheet} className="lp-sheet">
          <span className="lp-tape lp-tape--left" aria-hidden="true" />
          <span className="lp-tape lp-tape--right" aria-hidden="true" />
          <div className="lp-sheet-stage">
            <div className="lp-frame">
              <LandingViewport
                blueprint={model.blueprint}
                revealKey={`hero:${built}`}
                clip={moving ? clip : null}
                spin={moving}
                reducedMotion={reducedMotion}
                hidden={phase === 'sketch'}
              />
              {(!webgl || (!reducedMotion && phase !== 'live')) && (
                <SketchLines blueprint={design.blueprint} drawKey={`${design.id}:${run}`} animate={webgl && !reducedMotion} className={phase === 'solid' ? 'is-fading' : ''} />
              )}
            </div>
            {note && !reducedMotion && webgl && <span className="lp-note" key={note} aria-hidden="true">{note}</span>}
          </div>
          <dl className="lp-titleblock">
            <div className="lp-tb-name"><dt>Design</dt><dd>{design.title}</dd></div>
            <div className="lp-tb-use"><dt>Use</dt><dd>{design.scenario}</dd></div>
            <div><dt>Size</dt><dd>{formatSize(design.blueprint)}</dd></div>
            <div><dt>Parts</dt><dd>{design.blueprint.components.length}</dd></div>
          </dl>
        </div>
        <div className="lp-hero-picker">
          <div role="group" aria-label="Choose the design on the sheet" className="lp-hero-names">
            {designs.map((d, i) => (
              <button key={d.id} type="button" aria-pressed={i === index} onClick={() => pick(i)}>{d.title}</button>
            ))}
          </div>
          {!reducedMotion && webgl && (
            <button type="button" className="lp-hero-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
        </div>
        <p className="lp-hero-source">Each drawing is traced from the built-in example it turns into, so the model you see is the real thing.</p>
      </div>
    </section>
  );
}
