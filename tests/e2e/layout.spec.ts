/**
 * Layout, accessibility and resilience checks. Runs in both projects (desktop 1365x768 and
 * mobile 390x844); screenshots go to test-results/screens/.
 */
import { chromium, expect, test, type Page } from '@playwright/test';
import {
  getState,
  openLiveTest,
  horizontalOverflow,
  pixelStats,
  qrEncodes,
  resetSession,
  saveScreenshot,
  trackErrors,
} from './helpers';
import { DEFAULT_PET } from '../../shared/creations';

const METRICS = ['pet-hunger', 'pet-happiness', 'pet-energy'];

/** Opens the example character's Live test, with its world on screen (3D canvas or the text fallback). */
async function hostReady(page: Page) {
  await openLiveTest(page, 'pixel_pet');
  await expect(page.getByTestId('build-world')).toBeVisible();
  await expect(page.getByTestId('world-canvas').or(page.getByTestId('webgl-fallback')).first()).toBeVisible();
}

test.describe('layout', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'example' } });
  });

  test('host: no horizontal overflow, readable metrics, screenshot', async ({ page, request }, info) => {
    const errors = trackErrors(page);
    // Some activity so the screenshot shows a queue.
    await hostReady(page);
    await page.waitForTimeout(1500); // let the scene settle (reveal animation)
    const ov = await horizontalOverflow(page);
    expect(ov.overflow, `scrollWidth ${ov.scrollWidth} > innerWidth ${ov.innerWidth}: ${ov.offenders.join(', ')}`).toBe(false);

    const sizes = await page.evaluate((names) => {
      const out: Record<string, number> = {};
      for (const n of names) {
        const el = document.querySelector(`[data-testid="${n}"]`);
        if (!el) continue;
        const scope = (el.parentElement ?? el) as HTMLElement;
        let min = Infinity;
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!t.textContent?.trim()) continue;
          const parent = t.parentElement!;
          const cs = getComputedStyle(parent);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (parent.closest('.sr-only, .visually-hidden')) continue;
          min = Math.min(min, parseFloat(cs.fontSize));
        }
        out[n] = min;
      }
      return out;
    }, METRICS);
    for (const n of METRICS) {
      expect(sizes[n], `${n} present`).toBeDefined();
      expect(sizes[n], `${n} smallest font-size`).toBeGreaterThanOrEqual(12);
    }
    await saveScreenshot(page, `host-${info.project.name}`);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('guest /join: no horizontal overflow, screenshot', async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto('/join');
    await expect(page.getByTestId('guest-feed')).toBeVisible();
    const ov = await horizontalOverflow(page);
    expect(ov.overflow, `scrollWidth ${ov.scrollWidth} > innerWidth ${ov.innerWidth}: ${ov.offenders.join(', ')}`).toBe(false);
    const fs = await page.getByTestId('guest-feed').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fs).toBeGreaterThanOrEqual(14);
    const box = await page.getByTestId('guest-feed').boundingBox();
    expect(box?.height ?? 0, 'send button is a comfortable touch target').toBeGreaterThanOrEqual(40);
    await saveScreenshot(page, `guest-${info.project.name}`);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('QR code encodes the guest URL shown on screen', async ({ page }) => {
    await hostReady(page);
    const urlText = (await page.getByTestId('guest-url').innerText()).trim();
    expect(urlText).toMatch(/^https?:\/\/.+\/join$/);
    // With no PUBLIC_BASE_URL the page origin is used.
    expect(urlText).toBe(`${new URL(page.url()).origin}/join`);
    const qr = page.getByTestId('qr-code');
    await expect(qr).toBeVisible();
    const inner = qr.locator('img, svg, canvas');
    const target = (await inner.count()) > 0 ? inner.first() : qr;
    const name = (await target.getAttribute('alt')) ?? (await target.getAttribute('aria-label')) ?? (await target.getAttribute('title')) ?? '';
    expect(name, 'QR has an accessible name containing the URL').toContain(urlText);
    const decoded = await qrEncodes(page, target, urlText);
    test.info().annotations.push({ type: 'qr', description: decoded.reason });
    expect(decoded.ok, decoded.reason).toBe(true);
  });

  test('Tab reaches the main controls with a visible focus indicator', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'keyboard navigation is checked on desktop');
    await hostReady(page);
    const wanted = new Set(['template-pixel_pet', 'idea-text', 'blueprint-import', 'build-world']);
    const found: Record<string, { outline: string; shadow: string }> = {};
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 150 && Object.keys(found).length < wanted.size; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          id: el.getAttribute('data-testid'),
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          outlineStyle: cs.outlineStyle,
          outlineWidth: parseFloat(cs.outlineWidth),
          shadow: cs.boxShadow,
        };
      });
      if (f?.id && wanted.has(f.id) && !found[f.id]) {
        found[f.id] = { outline: f.outline, shadow: f.shadow };
        const visible = (f.outlineStyle !== 'none' && f.outlineWidth > 0) || (f.shadow && f.shadow !== 'none');
        expect(visible, `${f.id} focus indicator: outline=${f.outline} box-shadow=${f.shadow}`).toBeTruthy();
      }
    }
    expect(Object.keys(found).sort()).toEqual([...wanted].sort());
  });

  test('reduced motion: loads and builds without errors', async ({ page, request }) => {
    const errors = trackErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await hostReady(page);
    await page.getByTestId('build-world').click();
    await expect(page.getByTestId('world-canvas').or(page.getByTestId('webgl-fallback')).first()).toBeVisible();
    await expect(page.getByTestId('pet-hunger')).toBeVisible();
    expect((await getState(request)).creation?.mode).toBe('pet');
    await page.waitForTimeout(500);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('3D world renders (canvas is not blank)', async ({ page }, info) => {
    const errors = trackErrors(page);
    await hostReady(page);
    const canvas = page.getByTestId('world-canvas').locator('canvas').first();
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(2500);
    const stats = await pixelStats(page, canvas);
    test.info().annotations.push({
      type: 'canvas',
      description: `${info.project.name}: ${stats.width}x${stats.height}, luminance mean ${stats.mean.toFixed(1)} std ${stats.std.toFixed(1)}, ${stats.colours} colours`,
    });
    console.log(`[canvas ${info.project.name}] ${JSON.stringify(stats)}`);
    expect(stats.std, 'canvas luminance spread').toBeGreaterThan(6);
    expect(stats.colours, 'distinct colours in canvas').toBeGreaterThan(20);
    await canvas.screenshot({ path: `test-results/screens/canvas-${info.project.name}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('camera buttons and station inspect work without errors', async ({ page }, info) => {
    const errors = trackErrors(page);
    await hostReady(page);
    for (const name of [/zoom in/i, /zoom out/i, /rotate left/i, /rotate right/i, /reset view/i]) {
      const btn = page.getByRole('button', { name }).first();
      await expect(btn, `camera button ${name}`).toBeVisible();
      await btn.click();
      await page.waitForTimeout(150);
    }
    await saveScreenshot(page, `host-inspect-${info.project.name}`);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('WebGL unavailable', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'example' } });
  });

  test('getContext(webgl) returns null -> text fallback, app still works', async ({ page, request }, info) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl|experimental-webgl/i.test(type)) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...rest);
      };
    });
    const errors = trackErrors(page);
    await openLiveTest(page, 'pixel_pet');
    await expect(page.getByTestId('webgl-fallback')).toBeVisible();
    await expect(page.getByTestId('pet-hunger')).toBeVisible();
    expect((await getState(request)).creation?.mode).toBe('pet');
    await saveScreenshot(page, `host-webgl-fallback-${info.project.name}`);
    // Errors that only describe the missing WebGL context are expected; anything else is not.
    const unexpected = errors.filter((e) => !/webgl|context|three|WebGLRenderer/i.test(e));
    expect(unexpected, unexpected.join('\n')).toEqual([]);
  });

  test('browser launched with WebGL disabled shows the fallback', async ({ request }, info) => {
    test.skip(info.project.name === 'mobile', 'one launch is enough');
    const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
    try {
      const page = await browser.newPage({ baseURL: test.info().project.use.baseURL, viewport: { width: 1365, height: 768 } });
      await openLiveTest(page, 'pixel_pet');
      await expect(page.getByTestId('webgl-fallback')).toBeVisible();
      await expect(page.getByTestId('pet-hunger')).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
