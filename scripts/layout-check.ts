/**
 * Quick visual/layout check against a running server.
 *
 *   npx tsx scripts/layout-check.ts http://127.0.0.1:4501
 *
 * Screenshots the host page (/) and the guest page (/join) at desktop (1365x768) and mobile
 * (390x844) sizes into test-results/screens/check-*.png and prints horizontal overflow,
 * console errors and whether the 3D canvas or the WebGL fallback is showing.
 * Exit code 1 when any page overflows horizontally or logs errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:4501').replace(/\/+$/, '');
const outDir = path.join('test-results', 'screens');

const sizes = [
  { name: 'desktop', viewport: { width: 1365, height: 768 }, isMobile: false, deviceScaleFactor: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
];
const pages = [
  { name: 'host', path: '/' },
  { name: 'guest', path: '/join' },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  let problems = 0;
  try {
    for (const size of sizes) {
      const context = await browser.newContext({
        viewport: size.viewport,
        isMobile: size.isMobile,
        hasTouch: size.isMobile,
        deviceScaleFactor: size.deviceScaleFactor,
      });
      for (const p of pages) {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push(e.message));
        const url = `${base}${p.path}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        } catch (e) {
          errors.push(`navigation: ${(e as Error).message.split('\n')[0]}`);
        }
        await page.waitForTimeout(2000);
        const info = await page.evaluate(() => {
          const doc = document.documentElement;
          const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
          const offenders: string[] = [];
          if (scrollWidth > window.innerWidth + 1) {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
              const r = el.getBoundingClientRect();
              if (r.right > window.innerWidth + 1 && r.width > 0) {
                const tag = el.getAttribute('data-testid') || el.className?.toString().slice(0, 30) || '';
                offenders.push(`${el.tagName.toLowerCase()}${tag ? `[${tag}]` : ''}`);
                if (offenders.length >= 5) break;
              }
            }
          }
          return {
            scrollWidth,
            innerWidth: window.innerWidth,
            scrollHeight: doc.scrollHeight,
            offenders,
            canvas: !!document.querySelector('[data-testid="world-canvas"] canvas'),
            fallback: !!document.querySelector('[data-testid="webgl-fallback"]'),
            title: document.title,
          };
        });
        const file = path.join(outDir, `check-${p.name}-${size.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const overflow = info.scrollWidth > info.innerWidth + 1;
        if (overflow || errors.length) problems++;
        console.log(
          [
            `${p.name.padEnd(5)} ${size.name.padEnd(7)} ${url}`,
            `  overflow: ${overflow ? `YES (${info.scrollWidth} > ${info.innerWidth}) ${info.offenders.join(', ')}` : 'no'}`,
            `  page height: ${info.scrollHeight}px`,
            p.name === 'host' ? `  3D canvas: ${info.canvas ? 'yes' : 'no'}   WebGL fallback: ${info.fallback ? 'yes' : 'no'}` : '',
            `  console errors: ${errors.length ? `\n    - ${errors.join('\n    - ')}` : 'none'}`,
            `  screenshot: ${file}`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(problems ? `\n${problems} page(s) with problems.` : '\nAll pages OK.');
  process.exitCode = problems ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
