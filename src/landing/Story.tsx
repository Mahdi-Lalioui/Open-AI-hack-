/**
 * One design followed from a change to its files. Scrolling edits a real Blueprint, and the OpenSCAD panel
 * and downloads are generated from that same Blueprint by the real exporters.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { EXPORT_FORMATS, exportScad, exportWebComponent, exportWebPage, fileBaseName, type ExportFormat } from '../../shared/blueprint/export';
import { scaleBlueprint } from '../../shared/blueprint/edit';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import { validateBlueprint } from '../../shared/blueprint/validate';
import { designById, LandingViewport, formatSize } from './shared';

const original = designById('desk_organiser')?.blueprint as DesignBlueprint;
const STEPS = 4;
const BIN_DEFAULT = 110;

function edited(wider: boolean, binHeight: number): DesignBlueprint {
  let next = original;
  if (wider) {
    next = scaleBlueprint(next, 1.2, 1, 1);
    next = {
      ...next,
      materials: [...next.materials, { id: 'blue', name: 'Blue PLA', color: '#2F6FB5', roughness: 0.55, metalness: 0 }],
      components: next.components.map((c) => (c.id === 'tray' ? { ...c, materialId: 'blue' } : c)),
    };
  }
  next = { ...next, components: next.components.map((c) => (c.id === 'pen_bin' ? { ...c, params: { ...c.params, height: binHeight } } : c)) };
  const result = validateBlueprint(next);
  return result.ok ? result.blueprint : original;
}

/** Real lines from the generated file: the overall size, the variables of three parts and the tray's call. */
function scadExcerpt(bp: DesignBlueprint): string[] {
  const lines = exportScad(bp).split('\n');
  const block = (name: string) => {
    const start = lines.indexOf(`/* [${name}] */`);
    if (start < 0) return [];
    const end = lines.indexOf('', start);
    return lines.slice(start, end);
  };
  const tray = lines.findIndex((l) => l.trim() === '// Phone tray');
  return [
    lines.find((l) => l.startsWith('// Overall')) ?? '',
    '',
    ...block('Base plate'),
    '',
    ...block('Pen bin'),
    '',
    ...block('Phone tray'),
    '',
    '// ...',
    ...(tray >= 0 ? lines.slice(tray, tray + 2).map((l) => l.trim()) : []),
  ];
}

function ScadPanel({ blueprint }: { blueprint: DesignBlueprint }) {
  const excerpt = useMemo(() => scadExcerpt(blueprint), [blueprint]);
  const previous = useRef(excerpt);
  const changed = useMemo(() => new Set(excerpt.filter((l) => !previous.current.includes(l))), [excerpt]);
  useEffect(() => { previous.current = excerpt; }, [excerpt]);
  return (
    <figure className="lp-scad">
      <figcaption>{fileBaseName(blueprint)}.scad, generated in your browser just now</figcaption>
      <pre tabIndex={0}><code>
        {excerpt.map((line, i) => (
          <span key={`${i}:${line}`} className={changed.has(line) && line ? 'is-changed' : undefined}>{line || ' '}{'\n'}</span>
        ))}
      </code></pre>
    </figure>
  );
}

function fileFor(bp: DesignBlueprint, format: ExportFormat): string {
  switch (format) {
    case 'webComponent': return exportWebComponent(bp);
    case 'webPage': return exportWebPage(bp);
    case 'blueprint': return `${JSON.stringify(bp, null, 2)}\n`;
    default: return exportScad(bp);
  }
}

function download(bp: DesignBlueprint, format: ExportFormat) {
  const { extension, mime } = EXPORT_FORMATS[format];
  const url = URL.createObjectURL(new Blob([fileFor(bp, format)], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBaseName(bp)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const FILES: { format: ExportFormat; name: string; use: string }[] = [
  { format: 'scad', name: 'OpenSCAD .scad', use: 'Editable CAD, with every size as a named variable' },
  { format: 'blueprint', name: 'Blueprint .json', use: 'The design itself, which you can reopen in VDraw' },
  { format: 'webPage', name: 'Product page .html', use: 'A standalone page you can host anywhere' },
  { format: 'webComponent', name: 'Web component .js', use: 'Adds a <vdraw-model> tag to any site, with no dependencies' },
];

export function Story({ reducedMotion }: { reducedMotion: boolean }) {
  const [step, setStep] = useState(0);
  const [wider, setWider] = useState(false);
  const [binHeight, setBinHeight] = useState(BIN_DEFAULT);
  const steps = useRef<(HTMLElement | null)[]>([]);
  const applied = useRef(false);
  const bp = useMemo(() => edited(wider, binHeight), [wider, binHeight]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const at = steps.current.indexOf(entry.target as HTMLElement);
        if (at >= 0) setStep(at);
        if (!applied.current) {
          applied.current = true;
          window.setTimeout(() => setWider(true), reducedMotion ? 0 : 900);
        }
      }
    }, { rootMargin: '-48% 0px -48% 0px' });
    steps.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [reducedMotion]);

  const ref = (i: number) => (el: HTMLElement | null) => { steps.current[i] = el; };
  const clip = step === 2 ? bp.animations[0] ?? null : null;

  return (
    <section id="follow" className="lp-section lp-story" aria-labelledby="lp-story-title">
      <div className="lp-wrap">
        <h2 id="lp-story-title" className="lp-h2" data-rv>Follow one desk organiser all the way to its files</h2>
        <div className="lp-story-grid">
          <div className="lp-story-stage">
            <div className="lp-sheet lp-sheet--story">
              <div className="lp-sheet-stage">
                <div className="lp-frame">
                  <LandingViewport blueprint={bp} revealKey="story" clip={clip} explode={step === 1 ? 1 : 0} spin={step >= 2 && step < STEPS} reducedMotion={reducedMotion} />
                </div>
                <span className="lp-size-chip">{formatSize(bp)}</span>
              </div>
            </div>
            <div className="lp-story-code"><ScadPanel blueprint={bp} /></div>
          </div>

          <div className="lp-steps">
            <article ref={ref(0)} className={`lp-step ${step === 0 ? 'is-active' : ''}`}>
              <h3 className="lp-h3">Ask for a change in plain words</h3>
              <p className="lp-ask">make it 20% wider and make the tray blue</p>
              <p>
                You don't have to hunt for the right menu, because VDraw works out which parts your request touches and updates the Blueprint.
                The base here went from 240 to 288 mm while the walls stayed 2.4 mm thick, and the OpenSCAD file changed along with it.
                This page applies that edit directly so it doesn't have to call an AI, whereas the studio works it out from what you typed.
              </p>
              <button type="button" className="lp-btn" onClick={() => setWider((w) => !w)}>{wider ? 'Undo this change' : 'Redo this change'}</button>

              <label className="lp-slider">
                <span>The inspector gives you exact numbers too. Try the pen bin's height: <strong>{binHeight} mm</strong></span>
                <input type="range" min={70} max={160} step={5} value={binHeight} onChange={(e) => setBinHeight(Number(e.target.value))} />
              </label>
            </article>

            <article ref={ref(1)} className={`lp-step ${step === 1 ? 'is-active' : ''}`}>
              <h3 className="lp-h3">Pull it apart to see what sits where</h3>
              <p>
                The exploded view moves every part away from the middle, which is the quickest way to check how a design goes together.
                It's also handy for spotting a part you'd like to remove or resize, since you can select each one on its own.
              </p>
            </article>

            <article ref={ref(2)} className={`lp-step ${step === 2 ? 'is-active' : ''}`}>
              <h3 className="lp-h3">Watch the parts do their job</h3>
              <p>
                A design can carry animations of its own, like these modules lifting off their pegs, a drawer sliding out or a lid coming up.
                They are part of the Blueprint, so they travel with the model when you export it as a GLB for other 3D apps.
              </p>
            </article>

            <article ref={ref(3)} className={`lp-step ${step === 3 ? 'is-active' : ''}`}>
              <h3 className="lp-h3">Take it away as real files</h3>
              <p>
                All the formats come from the same Blueprint. Four of them are simple enough to build right here in your browser, so these buttons give you
                the actual files for the organiser above, with your changes included.
              </p>
              <div className="lp-story-code lp-story-code--inline"><ScadPanel blueprint={bp} /></div>
              <ul className="lp-files">
                {FILES.map((f) => (
                  <li key={f.format}>
                    <div><strong>{f.name}</strong><span>{f.use}</span></div>
                    <button type="button" className="lp-btn" onClick={() => download(bp, f.format)} aria-label={`Download ${f.name}`}>Download</button>
                  </li>
                ))}
                <li className="lp-files-studio">
                  <div><strong>STL and GLB</strong><span>For 3D printing and for 3D apps. These are binary files that the studio builds for you, so you'll find them on its Export menu.</span></div>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
