# Living Paper

**Turn a sketch into a world you can test.**

Living Paper turns a simple hand-drawn process (for example `Customers → Barista → Pickup`)
into a miniature interactive 3D café that a whole room can experiment with. The audience
scans a QR code and sends orders from their phones; customers join a visible queue; a small
AI pet called **Bean** watches the queue and can decide to call a simulated backup worker.
The queue and its measurements change live on every screen.

> Status: **work in progress (hackathon MVP)**. This README is updated as features land.
> Sections marked _(planned)_ are not finished yet.

## For teammates — how the project is organised

| Area | Folder | What lives there |
| --- | --- | --- |
| Shared contracts | `shared/` | TypeScript types + zod validation used by both server and browser |
| Queue engine | `server/sim/` | Pure, deterministic FIFO queue simulation (no timers, no I/O) |
| Live session | `server/session.ts`, `server/routes.ts` | One in-memory session, REST mutations, Socket.IO state broadcast |
| OpenAI adapters | `server/openai/` | Vision (Responses API), Decisions API, image generation — server-side only |
| Host + guest UI | `src/host/`, `src/guest/` | React screens (host dashboard, `/join` phone page) |
| 3D world | `src/scene/` | React Three Fiber "Paper Theatre" café diorama and Bean |
| Tests | `tests/` | Vitest unit/API tests, Playwright end-to-end tests |

Stack: TypeScript, React + Vite, Node/Express, Socket.IO, Three.js via React Three Fiber,
Vitest, Playwright. One `npm run dev` process serves the API, the websocket and the UI.

## Quick start _(planned commands — finalised at the end of the build)_

```bash
npm install
cp .env.example .env   # optional: add OPENAI_API_KEY for live AI features
npm run dev            # http://localhost:5173 (host)  ·  /join (guest)
```

```bash
npm test               # unit + API tests
npm run test:e2e       # Playwright host/guest flow (example mode, no API key needed)
npm run build          # typecheck + production build
npm start              # serve the production build
```

## What is real and what is example

- **Example mode works with no API key.** It uses a built-in example drawing and graph and is
  always labelled “Example: no image analysis used”. Example pet actions are labelled
  “Example action”, never “AI”.
- **Live mode** (with `OPENAI_API_KEY`) reads the uploaded photo with a vision model, asks the
  OpenAI Decisions API which pet action to take, and can generate a custom 2D Bean picture.
  Every integration shows its own honest status: Live, Ready, Waiting, Not configured or
  Unavailable.
- The queue numbers are **simulated** from the assumptions you enter (arrival interval,
  service time, workers). They are not predictions about a real business.

## Demo script _(draft)_

1. Draw `Customers → Barista → Pickup` and upload a photo, or click **Try example**.
2. Check the recognised flow, edit labels/assumptions, click **Build world**.
3. Ask the audience to scan the QR code and send orders (or add **Presenter orders**).
4. Start the simulation at 10× and point out the growing queue and live metrics.
5. Click **Ask Bean**. If a real `call_backup` decision arrives with AI management on, the
   second simulated barista appears; otherwise use **Add worker** and explain why.
6. Watch the queue and metrics respond. Results depend on the chosen assumptions.
