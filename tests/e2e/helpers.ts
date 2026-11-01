/** Shared helpers for the end-to-end specs (no app imports beyond shared contracts). */
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import type { QRCodeMaskPattern } from 'qrcode';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { exampleBuildInput } from '../../shared/example';
import type { PublicState } from '../../shared/types';

export const SCREENS_DIR = path.join('test-results', 'screens');

export async function getState(request: APIRequestContext): Promise<PublicState> {
  const res = await request.get('/api/state');
  expect(res.ok(), `GET /api/state -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as PublicState;
}

export async function post(request: APIRequestContext, url: string, data: unknown = {}) {
  const res = await request.post(url, { data });
  const body = await res.json().catch(() => null);
  return { status: res.status(), ok: res.ok(), body };
}

/**
 * Puts the single shared session into a known state: AI management off, sim reset.
 * With `buildWorld`, the example world is (re)built through the API.
 */
export async function resetSession(request: APIRequestContext, opts: { buildWorld?: boolean } = {}) {
  await post(request, '/api/sim/pause');
  await post(request, '/api/bean/management', { enabled: false });
  if (opts.buildWorld) {
    const r = await post(request, '/api/world', exampleBuildInput());
    expect(r.ok, `POST /api/world -> ${r.status} ${JSON.stringify(r.body)}`).toBeTruthy();
  }
  const r = await post(request, '/api/sim/reset');
  expect(r.ok, `POST /api/sim/reset -> ${r.status} ${JSON.stringify(r.body)}`).toBeTruthy();
  await post(request, '/api/sim/speed', { speed: 10 });
}

/** Collects console errors / page errors so a test can assert "no errors". */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Socket.IO reconnect noise after a server-side close is not an app error.
    if (/WebSocket connection to .* failed/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Reads a metric's raw value from its data-value attribute ("" means null). */
export async function metricValue(page: Page, name: string): Promise<number | null> {
  const v = await page.getByTestId(`metric-${name}`).getAttribute('data-value');
  if (v === null || v === '') return null;
  return Number(v);
}

export async function expectMetric(page: Page, name: string, value: number, timeout = 15_000) {
  await expect
    .poll(() => metricValue(page, name), { timeout, message: `metric-${name} should be ${value}` })
    .toBe(value);
}

export async function saveScreenshot(page: Page, name: string) {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  const file = path.join(SCREENS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** Decodes a PNG inside the page (no Node image deps) and returns RGBA pixels. */
async function decodePngInPage(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { width: d.width, height: d.height, data: Array.from(d.data) };
  }, png.toString('base64'));
}

/** Luminance spread and colour count of an element's pixels — a blank canvas scores ~0. */
export async function pixelStats(page: Page, target: Locator) {
  const png = await target.screenshot();
  const { width, height, data } = await decodePngInPage(page, png);
  let sum = 0;
  let sumSq = 0;
  const colours = new Set<number>();
  const n = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += l;
    sumSq += l * l;
    colours.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return { width, height, mean, std, colours: colours.size };
}

/**
 * Verifies that a rendered QR code (img / svg / canvas) encodes `text`: samples the module grid
 * from a screenshot and compares it with the symbol the `qrcode` package produces for `text`
 * (every error-correction level and mask pattern is tried, so render options don't matter).
 */
export async function qrEncodes(page: Page, target: Locator, text: string) {
  // Prefer the image's own pixels (data URL) over a screenshot, which can be clipped or scaled.
  const src = await target.getAttribute('src');
  const png = src?.startsWith('data:image/png;base64,')
    ? Buffer.from(src.slice('data:image/png;base64,'.length), 'base64')
    : await target.screenshot();
  const { width, height, data } = await decodePngInPage(page, png);
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return data[i + 3] > 128 && l < 128;
  };
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (dark(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return { ok: false, reason: 'no dark pixels found in QR element' };
  const levels = ['L', 'M', 'Q', 'H'] as const;
  let best = { mismatches: Infinity, level: '', mask: -1, size: 0 };
  for (const level of levels) {
    for (let mask = 0; mask < 8; mask++) {
      const sym = QRCode.create(text, { errorCorrectionLevel: level, maskPattern: mask as QRCodeMaskPattern });
      const size = sym.modules.size;
      const mw = (maxX - minX + 1) / size;
      const mh = (maxY - minY + 1) / size;
      let mismatches = 0;
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
          const px = Math.min(width - 1, Math.floor(minX + (c + 0.5) * mw));
          const py = Math.min(height - 1, Math.floor(minY + (r + 0.5) * mh));
          if (dark(px, py) !== Boolean(sym.modules.get(r, c))) mismatches++;
        }
      if (mismatches < best.mismatches) best = { mismatches, level, mask, size };
    }
  }
  return {
    ok: best.mismatches === 0,
    reason: `best match ECL ${best.level} mask ${best.mask} (${best.size}x${best.size}): ${best.mismatches} module mismatches`,
  };
}

/** True when the document is wider than the viewport (horizontal scrolling). */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const sw = Math.max(doc.scrollWidth, document.body.scrollWidth);
    const offenders: string[] = [];
    if (sw > window.innerWidth + 1) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 0) {
          const id = el.getAttribute('data-testid') || el.id || el.className?.toString().slice(0, 40) || '';
          offenders.push(`${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} right=${Math.round(r.right)}`);
          if (offenders.length >= 8) break;
        }
      }
    }
    return { scrollWidth: sw, innerWidth: window.innerWidth, overflow: sw > window.innerWidth + 1, offenders };
  });
}
