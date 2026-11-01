import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { downloadFile } from '../lib/blueprintFile';

interface Point { x: number; y: number }
interface Stroke { color: string; width: number; points: Point[] }
const COLORS = ['#25342E', '#1F8A84', '#E8735A', '#8B6AC5', '#E8B449'];
const WIDTH = 560, HEIGHT = 360;

/** A small vector-backed canvas. The vision API receives an actual PNG of the drawing. */
export function SketchPad({ busy, onRead }: { busy: boolean; onRead: (file: File) => void }) {
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
    setCount(strokes.current.length);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function undo() { strokes.current.pop(); setCount(strokes.current.length); redraw(); }
  function clear() { strokes.current = []; active.current = null; pointer.current = null; setCount(0); redraw(); }
  function png(read: boolean) {
    try {
      canvas.current?.toBlob((blob) => {
        if (!blob) { setError('Your browser could not save the drawing. Try uploading a photo instead.'); return; }
        try {
          if (read) onRead(new File([blob], 'my-living-paper-sketch.png', { type: 'image/png' }));
          else downloadFile(blob, 'my-living-paper-sketch.png');
        } catch { setError('The drawing could not be saved. Try uploading a photo instead.'); }
      }, 'image/png');
    } catch { setError('The drawing could not be saved. Try uploading a photo instead.'); }
  }

  return (
    <div className="sketch-pad">
      <div className="sketch-tools" role="group" aria-label="Drawing tools">
        <div className="sketch-colors">
          {COLORS.map((c, i) => <button key={c} type="button" className={`sketch-color ${!eraser && color === c ? 'is-active' : ''}`} style={{ background: c }} aria-label={`${['Ink', 'Teal', 'Coral', 'Lilac', 'Gold'][i]} pen`} aria-pressed={!eraser && color === c} disabled={busy} onClick={() => { setColor(c); setEraser(false); }} />)}
        </div>
        <button type="button" className={`btn btn-ghost btn-small ${eraser ? 'is-active' : ''}`} aria-pressed={eraser} disabled={busy} onClick={() => setEraser((v) => !v)}>Eraser</button>
      </div>
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="drawing-canvas" data-testid="sketch-canvas" aria-label="Draw your pet or circuit here with a mouse, touch or pen" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
      <p className="sketch-help">Your imagination, a few lines. Draw with your mouse, finger or pen.</p>
      <div className="sketch-tools">
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-undo" onClick={undo}>Undo</button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-clear" onClick={clear}>Clear</button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!count || busy} data-testid="sketch-download" onClick={() => png(false)}>Save PNG</button>
      </div>
      <button type="button" className="btn btn-secondary sketch-read" data-testid="sketch-read" disabled={!count || busy} onClick={() => png(true)}>{busy ? 'Reading sketch…' : 'Read this sketch'}</button>
      {error && <p className="msg msg-error" role="alert">{error}</p>}
    </div>
  );
}
