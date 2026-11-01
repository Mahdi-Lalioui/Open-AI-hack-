# Living Paper

**Turn a sketch into a world you can test.**

Draw a **pet** or a simple **circuit** on paper, photograph it, and Living Paper reads the
drawing into structured parts and builds a live, interactive 3D version on a "paper theatre"
stage. The audience scans a QR code and plays with it from their phones: feed / pet / play
with the pet, or flip the circuit's switch and watch the LED light up with a real current
calculation.

> The 3D model is **interpreted**: the vision model extracts parts (body shape, ears, eyes,
> colours… or battery, switch, resistor, LED, wires) and the app assembles them from preset
> 3D pieces. It is not free-form 3D mesh generation.

## Quick start

Requires Node.js ≥ 20.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Host screen: http://localhost:5173 · Guest page: http://localhost:5173/join

| Command | What it does |
| --- | --- |
| `npm run dev` | API + websocket + UI in one process (port `PORT`, default 5173) |
| `npm test` | Vitest unit + API tests (no network, OpenAI mocked in tests only) |
| `npm run test:e2e` | Playwright host/guest flow in example mode (no API key needed) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck + production client build |
| `npm start` | Serve the production build |
| `npm run smoke:live` | Minimal real API calls (only if `OPENAI_API_KEY` is set) |

## Configuration (`.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | – | Server-side only. Without it the app runs in labelled example mode. |
| `OPENAI_VISION_MODEL` | `gpt-6-astra` | Reads the sketch (Responses API + structured outputs) |
| `OPENAI_DECISIONS_MODEL` | `gpt-6-luna` | "Ask the pet" (Decisions API, choice question) |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Optional 2D pet portrait |
| `HOST` / `PORT` | `0.0.0.0` / `5173` | Listen address |
| `PUBLIC_BASE_URL` | – | URL phones open (QR code). Defaults to the host page origin. |

## What is real and what is example

- **Example mode works with no key.** "Try example" loads a built-in pet or circuit and is
  labelled "Example: no image analysis used". Without a key, "Ask the pet" uses a
  deterministic rule labelled "Example action (rule-based, no AI)".
- **With a key:** uploaded photos are read by the vision model (validated server-side; you can
  edit every part before building), "Ask the pet" calls the Decisions API with the pet's
  needs as evidence and only the actions that make sense, and "Customize skin" generates a
  2D portrait shown on a stand (not a 3D model).
- Each integration shows its own status: Live, Ready, Waiting, Not configured, Unavailable.
- Circuit numbers are a real series DC calculation (I = (V − LED drop) / R) using the values on
  the drawing, or defaults (9 V, 220 Ω, LED 2 V) when none are written.
- **Not verified here:** no live OpenAI call has been made from this repo yet (no key was
  available during the build). Run `npm run smoke:live` with a key to check.

## Supported drawings

- **Pet:** one creature; body, eyes, ears, legs, tail, mouth and simple extras (wings, horn,
  spots, hat, whiskers).
- **Circuit:** one series loop with battery, switch, resistor, LED and/or bulb, connected by
  wires. Write values (e.g. `9V`, `220Ω`) next to parts if you want them used.

## Audience phones / networking

Phones cannot open `localhost`. Set `PUBLIC_BASE_URL` to a reachable address, e.g. this
computer's LAN IP on the same Wi-Fi (`http://192.168.1.20:5173`, networks with client
isolation will block it) or an HTTPS tunnel you already have. The host screen warns when
the guest URL is localhost; the host can still interact from the main screen. Live camera
capture needs HTTPS or localhost; file upload works everywhere.

State is in memory: restarting the server clears it.

## Troubleshooting

- **401** invalid key · **403** model access / organization verification · **404** model not
  found → change the matching `OPENAI_*_MODEL`. The status card shows the reason.
- **3D view blank:** if WebGL is unavailable the page shows a notice and the text readouts
  keep working.

## Demo script

1. Draw a pet (or a battery → switch → resistor → LED loop) and upload it, or press **Try example**.
2. Check the recognised parts, edit anything, press **Build in 3D** and watch it rise.
3. Ask the audience to scan the QR code and Feed / Pet / Play (or Flip switch).
4. Watch the needs bars (or current and LED) change live on every screen.
5. Press **Ask the pet**: a real AI decision is labelled with its model; without a key it is
   clearly labelled as an example rule.
6. Switch to **Circuit**, change the resistor value, rebuild, and show the current change.

## Project layout

`shared/` contracts and validation · `server/` Express + Socket.IO session, pet sim, circuit
solver, OpenAI adapters · `src/host`, `src/guest` React screens · `src/scene` React Three
Fiber world · `tests/` Vitest and Playwright.
