/** The four ways to start, and the Blueprint they all turn into. */
import { designById, SketchLines, useInView } from './shared';

const planter = designById('planter')?.blueprint;
const table = designById('bedside_table')?.blueprint;

/** A real part from the bedside table's Blueprint, without the size fields that its shape doesn't use. */
function blueprintExcerpt(): string {
  const part = table?.components.find((c) => c.id === 'drawer');
  const clip = table?.animations[0];
  if (!part || !clip) return '';
  const params = Object.fromEntries(Object.entries(part.params).filter(([, v]) => v !== null));
  const track = clip.tracks.find((t) => t.componentId === 'drawer');
  return JSON.stringify({ id: part.id, name: part.name, primitive: part.primitive, params, materialId: part.materialId, moves: { clip: clip.name, ...track } }, null, 2);
}

const WAVE = [12, 26, 44, 30, 56, 38, 20, 48, 62, 34, 24, 52, 40, 18, 32, 46, 22, 14];

export function Inputs({ reducedMotion }: { reducedMotion: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>('-15% 0px');
  const live = inView && !reducedMotion;
  return (
    <section id="how" className="lp-section lp-inputs" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <h2 id="lp-how-title" className="lp-h2" data-rv>Start with whatever you have in front of you</h2>
        <div ref={ref} className={`lp-inputs-grid ${live ? 'is-live' : ''}`}>
          <ul className="lp-ways">
            <li className="lp-way" data-rv>
              <div className="lp-way-art lp-way-paper">{planter && live && <SketchLines blueprint={planter} animate />}{planter && !live && <SketchLines blueprint={planter} animate={false} />}</div>
              <h3>Draw it</h3>
              <p>Sketch on the canvas with a mouse, a finger or a pen. Wobbly lines are welcome, and so are arrows and scribbled notes.</p>
            </li>
            <li className="lp-way" data-rv>
              <div className="lp-way-art lp-way-photos" aria-hidden="true">
                <span className="lp-photo lp-photo--back" />
                <span className="lp-photo">{table && <SketchLines blueprint={table} animate={false} />}</span>
              </div>
              <h3>Upload it</h3>
              <p>Drop in a photo of a napkin drawing or of something you want to make your own version of, as a PNG, JPEG or WebP.</p>
            </li>
            <li className="lp-way" data-rv>
              <div className="lp-way-art lp-way-type" aria-hidden="true">
                <span className="lp-typed">a planter with a saucer<br />for a windowsill herb</span>
              </div>
              <h3>Type it</h3>
              <p>Write a sentence or two, the way you would explain it to a friend who owns a workshop.</p>
            </li>
            <li className="lp-way" data-rv>
              <div className="lp-way-art lp-way-wave" aria-hidden="true">
                {WAVE.map((h, i) => <span key={i} style={{ height: `${h}px`, animationDelay: `${(i % 6) * -0.17}s` }} />)}
              </div>
              <h3>Say it</h3>
              <p>Press record and talk it through if your hands are busy or you think better out loud.</p>
            </li>
          </ul>
          <div className="lp-blueprint" data-rv>
            <h3 className="lp-h3">All of it becomes one Blueprint</h3>
            <p>
              Whichever way you start, the AI fills in a structured description of the object that lists every part with its size, its material and how it moves.
              That description is the Blueprint, and it gets checked against real limits before anything is drawn. The AI only ever supplies this data, so nothing it writes runs as code.
            </p>
            <figure className="lp-json">
              <figcaption>Part of the bedside table's Blueprint</figcaption>
              <pre tabIndex={0}><code>{blueprintExcerpt()}</code></pre>
            </figure>
            <p>The 3D view and every file you export are generated from this one record, which is why they always agree with each other.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
