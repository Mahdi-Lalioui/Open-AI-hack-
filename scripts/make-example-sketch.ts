/**
 * Renders hand-drawn-looking example sketches with headless Chromium:
 *   public/example-pet.png, a cute creature
 *   public/example-circuit.png, battery, switch, resistor, LED in one loop
 *   public/example-sketch.png, Customers → Barista → Pickup (legacy)
 * Run: npx tsx scripts/make-example-sketch.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200;
const H = 800;
const FONT = "'Comic Sans MS', 'Marker Felt', 'Chalkboard SE', 'Bradley Hand', cursive";

function page(svgBody: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6efe1">
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/>
      <feDisplacementMap in="SourceGraphic" scale="5"/></filter>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="3"/>
      <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.07 0"/></filter>
    <marker id="head" viewBox="0 0 20 20" refX="16" refY="10" markerWidth="16" markerHeight="16" orient="auto">
      <path d="M2 3 L17 10 L3 17" fill="none" stroke="#2b2622" stroke-width="2.6" stroke-linecap="round"/></marker>
  </defs>
  <rect width="100%" height="100%" fill="#f6efe1"/>
  <rect width="100%" height="100%" filter="url(#paper)"/>
  <g filter="url(#ink)" stroke="#2b2622" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"
     font-family="${FONT}" font-size="48">${svgBody}</g>
</svg></body></html>`;
}

const label = (x: number, y: number, t: string, size = 48, rot = 0) =>
  `<text x="${x}" y="${y}" text-anchor="middle" fill="#2b2622" stroke="none" font-size="${size}" transform="rotate(${rot} ${x} ${y})">${t}</text>`;

const PET = `
  <g transform="rotate(-2 600 420)">
    <!-- ears -->
    <path d="M455 250 L430 120 L540 215" fill="#f2a490"/>
    <path d="M745 250 L780 118 L660 212" fill="#f2a490"/>
    <!-- body -->
    <path d="M600 200 C800 195 850 360 835 470 C820 600 700 640 600 638 C470 640 370 590 362 470 C350 330 420 205 600 200 Z" fill="#7cc4bd"/>
    <!-- spots -->
    <circle cx="460" cy="480" r="22" fill="#f2a490"/><circle cx="750" cy="520" r="18" fill="#f2a490"/><circle cx="720" cy="300" r="14" fill="#f2a490"/>
    <!-- eyes -->
    <circle cx="530" cy="380" r="42" fill="#fffaf0"/><circle cx="542" cy="390" r="18" fill="#2b2622"/>
    <circle cx="670" cy="380" r="42" fill="#fffaf0"/><circle cx="682" cy="390" r="18" fill="#2b2622"/>
    <!-- smile -->
    <path d="M550 470 Q600 520 655 468"/>
    <!-- legs -->
    <path d="M470 620 L462 690 M540 636 L538 705 M660 636 L662 705 M735 615 L748 688"/>
    <!-- curly tail -->
    <path d="M832 500 C900 500 925 440 885 420 C850 405 840 450 870 458"/>
  </g>
  ${label(600, 760, 'Pixel', 60, -3)}`;

const CIRCUIT = `
  <!-- loop wire -->
  <path d="M250 220 L520 214 M640 214 L950 222 L955 400 M955 560 L950 640 L700 646 M560 646 L250 640 L248 470 M248 330 L250 220"/>
  <!-- battery (left) -->
  <path d="M200 345 L298 345" stroke-width="7"/><path d="M222 380 L276 380" stroke-width="7"/>
  <path d="M200 415 L298 415" stroke-width="7"/><path d="M222 450 L276 450" stroke-width="7"/>
  ${label(150, 410, '9V', 46, -4)}
  <!-- switch (top) -->
  <circle cx="525" cy="214" r="9" fill="#2b2622"/><circle cx="640" cy="214" r="9" fill="#2b2622"/>
  <path d="M525 214 L630 165"/>
  ${label(585, 130, 'switch', 40, 2)}
  <!-- resistor (right) -->
  <path d="M955 400 L930 415 L980 440 L930 465 L980 490 L930 515 L980 540 L955 560"/>
  ${label(1060, 492, '220Ω', 44, 3)}
  <!-- LED (bottom) -->
  <path d="M700 646 L700 600 L700 692 M700 646 L590 600 L590 692 Z" fill="#f6efe1"/>
  <path d="M560 646 L590 646"/>
  <path d="M620 585 L645 545 M650 595 L680 560"/>
  ${label(640, 750, 'LED', 46, -2)}`;

const CAFE = `
  <g transform="rotate(-1.5 600 400)">
    <rect x="80" y="320" width="250" height="150" rx="34"/>${label(205, 410, 'Customers')}
    <rect x="475" y="290" width="250" height="150" rx="34"/>${label(600, 380, 'Barista')}
    <rect x="870" y="335" width="250" height="150" rx="34"/>${label(995, 425, 'Pickup')}
    <path d="M338 395 C390 380 420 372 466 368" marker-end="url(#head)"/>
    <path d="M733 368 C780 380 820 392 862 405" marker-end="url(#head)"/>
  </g>`;

async function main() {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    for (const [file, body] of [
      ['example-pet.png', PET],
      ['example-circuit.png', CIRCUIT],
      ['example-sketch.png', CAFE],
    ] as const) {
      await p.setContent(page(body));
      await p.screenshot({ path: path.join(root, 'public', file), clip: { x: 0, y: 0, width: W, height: H } });
      console.log(`wrote public/${file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
