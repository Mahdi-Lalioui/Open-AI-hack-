/** A small vector-backed canvas. The AI receives an actual PNG of the drawing. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { saveFile } from './studioApi';

interface Point { x: number; y: number }
interface Stroke { color: string; width: number; points: Point[] }
const COLORS = ['#25342E', '#1F8A84', '#E8735A', '#8B6AC5', '#E8B449'];
const WIDTH = 560, HEIGHT = 360;

export interface SketchPadHandle {
  toBlob(): Promise<Blob | null>;
  isEmpty(): boolean;
}

/** A rough hand-drawn desk organiser, so the sketch flow can be shown without drawing live. */
function sampleStrokes(): Stroke[] {
  const line = (points: Point[]): Stroke => ({ color: COLORS[0], width: 5, points });
  const wobble = (a: Point, b: Point, seed: number) => {
    const out: Point[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const n = Math.sin(u * 7 + seed) * 2.4;
      out.push({ x: a.x + (b.x - a.x) * u + n, y: a.y + (b.y - a.y) * u - n });
    }
    return line(out);
  };
  const rect = (x: number, y: number, w: number, h: number, seed: number) => [
    wobble({ x, y }, { x: x + w, y }, seed), wobble({ x: x + w, y }, { x: x + w, y: y + h }, seed + 1),
    wobble({ x: x + w, y: y + h }, { x, y: y + h }, seed + 2), wobble({ x, y: y + h }, { x, y }, seed + 3),
  ];
  const circle = (cx: number, cy: number, r: number, seed: number) => {
    const out: Point[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wiggle = r + Math.sin(a * 3 + seed) * 2;
      out.push({ x: cx + Math.cos(a) * wiggle, y: cy + Math.sin(a) * wiggle });
    }
    return line(out);
  };
  return [
    ...rect(45, 260, 470, 44, 1), // base
    ...rect(72, 72, 124, 188, 3), // tall bin
    circle(280, 208, 42, 2), circle(280, 132, 34, 5), // cups
    ...rect(370, 195, 124, 65, 7), // low tray
  ];
}

interface Props { busy: boolean; onChange?: (hasInk: boolean) => void }

export const SketchPad = forwardRef<SketchPadHandle, Props>(function SketchPad({ busy, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const [count, setCount] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [eraser, setEraser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function paint(stroke: Stroke) {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) ctx.lineTo(first.x + .01, first.y + .01);
    ctx.stroke();
  }

  function redraw() {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const stroke of strokes.current) paint(stroke);
  }
  useEffect(() => { redraw(); }, []);

  const changed = () => {
    setCount(strokes.current.length);
    onChange?.(strokes.current.length > 0);
    redraw();
  };

  const toBlob = () => new Promise<Blob | null>((resolve) => {
    if (!canvas.current || !strokes.current.length) resolve(null);
    else canvas.current.toBlob(resolve, 'image/png');
  });

  useImperativeHandle(ref, () => ({ isEmpty: () => strokes.current.length === 0, toBlob }));

  function point(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(WIDTH, (e.clientX - rect.left) / rect.width * WIDTH)), y: Math.max(0, Math.min(HEIGHT, (e.clientY - rect.top) / rect.height * HEIGHT)) };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (busy || pointer.current !== null || e.button !== 0) return;
    if (strokes.current.length >= 200) { setError('This page is full. Save your sketch, or undo a stroke to keep drawing.'); return; }
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    active.current = { color: eraser ? '#FFFFFF' : color, width: eraser ? 24 : 5, points: [point(e)] };
    paint(active.current); setError(null);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    if (!stroke || pointer.current !== e.pointerId || stroke.points.length >= 1500) return;
    const next = point(e), prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(next);
    paint({ ...stroke, points: [prev, next] });
  }
  function finish(e: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== e.pointerId || !active.current) return;
    strokes.current.push(active.current);
    active.current = null; pointer.current = null;
    changed();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  async function savePng() {
    const blob = await toBlob();
    if (blob) saveFile({ blob, filename: 'my-vdraw-sketch.png' });
    else setError('Your browser could not save the drawing. Try uploading a photo instead.');
  }

  return (
    <div className="sketch-pad">
      <div className="sketch-tools" role="group" aria-label="Drawing tools">
        <div className="sketch-colors">
          {COLORS.map((c, i) => <button key={c} type="button" className={`sketch-color ${!eraser && color === c ? 'is-active' : ''}`} style={{ background: c }} aria-label={`${['Ink', 'Teal', 'Coral', 'Lilac', 'Gold'][i]} pen`} aria-pressed={!eraser && color === c} disabled={busy} onClick={() => { setColor(c); setEraser(false); }} />)}
        </div>
        <button type="button" className={`btn btn-ghost btn-small ${eraser ? 'is-active' : ''}`} aria-pressed={eraser} disabled={busy} onClick={() => setEraser((v) => !v)}>Eraser</button>
      </div>
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="drawing-canvas" data-testid="sketch-canvas" aria-label="Sketch your idea here with a mouse, finger or pen" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
      <div className="sketch-tools">
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-undo" onClick={() => { strokes.current.pop(); changed(); }}>Undo</button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-clear" onClick={() => { strokes.current = []; active.current = null; pointer.current = null; changed(); }}>Clear</button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-download" onClick={savePng}>Save PNG</button>
        <button type="button" className="btn btn-ghost btn-small" disabled={busy} data-testid="sample-sketch" onClick={() => { strokes.current = sampleStrokes(); changed(); }}>Sample sketch</button>
      </div>
      {error && <p className="msg msg-error" role="alert">{error}</p>}
    </div>
  );
});
