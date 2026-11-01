/** Pieces used by more than one landing page section: real designs, viewport wrapper, pencil lines and hooks. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { AnimationClip, DesignBlueprint } from '../../shared/blueprint/types';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import { validateBlueprint } from '../../shared/blueprint/validate';
import { BlueprintViewport } from '../studio/BlueprintViewport';
import { SKETCH_HALF_HEIGHT, traceSketch } from './sketch';

export interface LandingDesign {
  id: string;
  title: string;
  scenario: string;
  blueprint: DesignBlueprint;
}

/** Each built-in template, run through the same validation as a design from the AI. */
export const DESIGNS: LandingDesign[] = DESIGN_TEMPLATES.flatMap((t) => {
  const result = validateBlueprint(t.build());
  return result.ok ? [{ id: t.id, title: t.title, scenario: t.scenario, blueprint: result.blueprint }] : [];
});

export const designById = (id: string): LandingDesign | undefined => DESIGNS.find((d) => d.id === id);

export const formatSize = (bp: DesignBlueprint): string => {
  const { width, depth, height } = bp.dimensions;
  return `${Math.round(width)} × ${Math.round(depth)} × ${Math.round(height)} mm`;
};

/** True while the element is near the viewport, so 3D can unmount when it is out of sight. */
export function useInView<T extends Element>(rootMargin = '200px'): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}

/** Eases a clip in and out by scaling its tracks, because a clip's phase follows the clock and would otherwise jump. */
function useEasedClip(clip: AnimationClip | null): AnimationClip | null {
  const held = useRef<AnimationClip | null>(clip);
  if (clip) held.current = clip;
  const [amount, setAmount] = useState(clip ? 1 : 0);
  const shown = useRef(amount);
  const on = Boolean(clip);
  useEffect(() => {
    const target = on ? 1 : 0;
    const from = shown.current;
    if (from === target) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const u = Math.min(1, (now - started) / 500);
      shown.current = from + (target - from) * (u * u * (3 - 2 * u));
      setAmount(shown.current);
      if (u < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  const base = held.current;
  return useMemo(() => {
    if (!base || amount === 0) return null;
    if (amount === 1) return base;
    return { ...base, tracks: base.tracks.map((t) => ({ ...t, from: t.from * amount, to: t.to * amount })) };
  }, [base, amount]);
}

interface SketchProps {
  blueprint: DesignBlueprint;
  /** Replays the drawing when it changes. */
  drawKey?: string;
  animate: boolean;
  className?: string;
}

/** The pencil drawing of a design, sized to line up with a BlueprintViewport filling the same box. */
export function SketchLines({ blueprint, drawKey, animate, className = '' }: SketchProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1);
  const paths = useMemo(() => traceSketch(blueprint), [blueprint]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      if (box.height > 0) setAspect(box.width / box.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const halfWidth = SKETCH_HALF_HEIGHT * aspect;
  return (
    <svg ref={ref} key={drawKey} className={`lp-sketch ${animate ? 'lp-sketch--draw' : ''} ${className}`} aria-hidden="true"
      viewBox={`${-halfWidth} ${-SKETCH_HALF_HEIGHT} ${halfWidth * 2} ${SKETCH_HALF_HEIGHT * 2}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} pathLength={1} className={p.light ? 'is-light' : undefined}
          style={{ animationDelay: `${(p.order * 1.35 + (p.light ? 0.45 : 0) + (i % 7) * 0.02).toFixed(2)}s` }} />
      ))}
    </svg>
  );
}

interface ViewportProps {
  blueprint: DesignBlueprint;
  revealKey: string;
  clip?: AnimationClip | null;
  explode?: number;
  spin?: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  resetNonce?: number;
  reducedMotion: boolean;
  hidden?: boolean;
}

/**
 * BlueprintViewport, mounted only while near the screen. Wheel events stop here so that scrolling
 * over a model scrolls the page; the stylesheet lets vertical swipes do the same on touch screens.
 */
export function LandingViewport({ blueprint, revealKey, clip = null, explode = 0, spin = false, selected = null, onSelect, resetNonce = 0, reducedMotion, hidden = false }: ViewportProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const eased = useEasedClip(clip);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('wheel', stop, { capture: true, passive: true });
    return () => el.removeEventListener('wheel', stop, { capture: true });
  }, [ref]);
  return (
    <div ref={ref} className={`lp-canvas ${hidden ? 'is-hidden' : ''}`}>
      {inView && (
        <BlueprintViewport
          blueprint={blueprint}
          revealKey={revealKey}
          selected={selected}
          onSelect={onSelect ?? (() => undefined)}
          clip={eased}
          explode={explode}
          spin={spin}
          resetNonce={resetNonce}
          reducedMotion={reducedMotion}
          fallback={<SketchLines blueprint={blueprint} animate={false} />}
        />
      )}
    </div>
  );
}

export function Wordmark() {
  return <span className="lp-wordmark">VDraw<span className="lp-wordmark-dot">.</span></span>;
}

export const TRY_HREF = '/app';
