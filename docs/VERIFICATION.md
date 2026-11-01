# Verification

Run on 2026-11-01 in example mode (no OpenAI key).

## Results
| Command | Result |
| --- | --- |
| `npx vitest run` | 12 files, 185 tests passed |
| `npx playwright test` | 19 passed, 2 skipped (keyboard-Tab and second-browser WebGL launch are desktop only), 4.5 min |
| `npm run build` | typecheck and vite build OK. One JS chunk is 1.19 MB (336 kB gzip). |

Some Playwright runs failed during development because other agents' edits killed or reloaded the dev server on 4599 (ECONNREFUSED, HMR reloads). The suite passes on a quiet tree.

## What the tests cover
- `tests/api/realtime.test.ts`: a real HTTP and Socket.IO server with two clients.
  - Both clients get identical state after a guest order.
  - Adding a worker shows 2 on both clients. The worker cap is enforced.
  - A reset reaches both clients (epoch goes up by 1).
  - Clients that disconnect and reconnect five times get the current state, add no duplicate orders and start no second timer. Measured: about 10 simulated seconds per real second before and after.
  - Re-POSTing the same order id does not create a duplicate.
  - These tests cover the old queue API, which is still on the server.
- `tests/e2e/host-guest.spec.ts`:
  - Pet example → Build in 3D → guest Feed. Hunger goes down and "Fed N" goes up on the host, and the guest's live line updates. Reloading the guest page does not resend.
  - Circuit example → guest Flip switch. The host shows LED On and a current above 0 mA.
  - API badges show "Not configured" and the example is labelled.
- `tests/e2e/layout.spec.ts`, at 1365×768 and 390×844:
  - No horizontal overflow on the host page or `/join`.
  - The pet need bars use fonts of at least 12 px. The guest buttons use at least 14 px and are at least 40 px tall.
  - QR code: the module grid of the `<img>` data URL matches the `qrcode` symbol for the exact `guest-url` text, with 0 module mismatches. Its alt text contains the URL.
  - Tab reaches try-example, upload and Build world, and each shows a visible outline or box-shadow.
  - Reduced motion loads with no errors.
  - Camera buttons (Reset view, Zoom in/out, Rotate left/right) work with no errors.
  - WebGL fallback: forcing `getContext` to return null, and launching chromium with `--disable-webgl`, both show `webgl-fallback`, and the page still works.
- 3D rendered for real, not a blank canvas. Canvas pixels have luminance std about 32 and about 190–200 distinct colours on both sizes.

## Visual review (`test-results/screens/`)
- Host pet page: a clean three-column paper look. The teal pet has ears, eyes, legs and a name tag on a gridded paper sheet. The needs bars, QR code, localhost warning and AI badges all read well.
- Circuit page: the 3D board shows the battery, switch, resistor and LED with labels and an "LED on: 31.8 mA through 220 Ω" banner. Nit: the 3D LED looks pale or unlit even though the readout says On.
- Guest on mobile: large Feed, Pet and Play buttons with a clear live line.

## Bugs and observations for routing
1. The circuit example (`src/host/examples.ts:10`) uses 220 Ω at 9 V. That gives 31.8 mA, so the demo shows the warning "31.8 mA is above a typical LED's 30 mA: it would burn out". Use 470 Ω (about 14.9 mA) for a clean demo.
2. The 3D LED does not look lit when `ledOn` is true (`src/scene/CircuitBoard.tsx`, visual only).
3. Earlier type drift on `PublicState.circuit` is fixed: the host now reads `state.circuit.result`.
4. The engine and session reviews against the queue spec found no defects. The 5-minute checks (10/6/3/1, average wait 50; and 10/9/0/1, average wait 0) are covered by `tests/unit/engine.test.ts`. That queue code is now legacy.
