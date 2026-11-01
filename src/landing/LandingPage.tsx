/** The VDraw marketing page. Every model and number on it comes from a real, validated Blueprint. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CircuitTest } from './CircuitTest';
import { Examples } from './Examples';
import { Hero } from './Hero';
import { Inputs } from './Inputs';
import { Story } from './Story';
import { TRY_HREF, Wordmark } from './shared';
import './landing.css';

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@400;500&family=Reenie+Beanie&family=Young+Serif&display=swap';

function useFonts() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
}

/** Sections rise in once as they scroll into view. Without an observer, or with reduced motion, they just stay visible. */
function useReveal(root: React.RefObject<HTMLElement>, reducedMotion: boolean) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('lp-reveal-on');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    el.querySelectorAll('[data-rv]').forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      el.classList.remove('lp-reveal-on');
    };
  }, [root, reducedMotion]);
}

/** The drafting grid drifts slower than the page behind the hero. Only a transform changes, so it stays cheap. */
function useParallax(target: React.RefObject<HTMLElement>, reducedMotion: boolean) {
  useEffect(() => {
    const el = target.current;
    if (!el || reducedMotion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.transform = `translate3d(0, ${(window.scrollY * 0.12).toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      el.style.transform = '';
    };
  }, [target, reducedMotion]);
}

export function LandingPage() {
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useFonts();
  // styles.css turns on smooth scrolling for the whole document, which anchor links shouldn't do here with reduced motion.
  useEffect(() => {
    if (!reducedMotion) return;
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    return () => { html.style.scrollBehavior = previous; };
  }, [reducedMotion]);
  useReveal(root, reducedMotion);
  useParallax(grid, reducedMotion);

  return (
    <div ref={root} className="landing">
      <a className="lp-skip" href="#lp-main">Skip to content</a>
      <div ref={grid} className="lp-grid" aria-hidden="true" />
      <header className="lp-nav">
        <a className="lp-brand" href="#lp-main" aria-label="VDraw, top of the page"><Wordmark /></a>
        <nav aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#examples">Examples</a>
          <a href="#follow">Files</a>
          <a href="#test">Live test</a>
        </nav>
        <a className="lp-cta lp-cta--small" href={TRY_HREF}>Try it out</a>
      </header>

      <main id="lp-main">
        <Hero reducedMotion={reducedMotion} />
        <Inputs reducedMotion={reducedMotion} />
        <Examples reducedMotion={reducedMotion} />
        <Story reducedMotion={reducedMotion} />
        <CircuitTest />

        <section className="lp-section lp-close" aria-labelledby="lp-close-title">
          <div className="lp-wrap lp-close-grid">
            <div className="lp-limits" data-rv>
              <h2 className="lp-h3">What to expect from a result</h2>
              <p>
                VDraw builds designs from simple solids, namely boxes, cylinders, cones, spheres, ellipsoids, and open-top boxes and cups.
                It can't make rounded fillets or boolean cut-outs, and free-form meshes are out as well, so a result is best treated as a starting point that you can open in CAD and keep working on.
              </p>
            </div>
            <div className="lp-close-main" data-rv>
              <p className="lp-close-hand" aria-hidden="true">got something in mind?</p>
              <h2 id="lp-close-title" className="lp-close-title">Draw it and see what comes back<span className="lp-accent">.</span></h2>
              <a className="lp-cta lp-cta--large" href={TRY_HREF}>Try it out</a>
              <p className="lp-close-note">The built-in examples work with no AI and no API key, so you can open one and start changing it straight away.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <Wordmark />
        <p>A hackathon project. Sketch it. Describe it. Bring it to life.</p>
      </footer>
    </div>
  );
}
