# Living Paper submission copy

Use the sections below as submission text. Replace the explicit metadata fields at the end before submitting; no event-specific judging rubric was supplied.

## One-line pitch

Turn a sketch into an editable pet or circuit, then let an audience test it together in a live 3D world.

## The problem

A drawing is easy to share, but testing what it means usually requires another specialist tool. A playful creature has no behaviour on paper, and a circuit drawing does not immediately show how a switch or resistor changes its current. We wanted a short path from an idea to an interactive experiment that people can understand and change.

## What we built

Living Paper is a browser studio for two deliberately bounded creation types: virtual pets and simple series circuits. A user can draw on a canvas, start with an example, edit the parts, or request interpretation of a sketch when API credentials are configured. The resulting Design Blueprint is validated before the app builds a procedural 3D scene.

The creation remains editable, and validated JSON blueprint files can be saved and reopened. Pets have hunger, happiness and energy, with actions that affect their state. Circuits show current, switch state, LED state and warnings from a deterministic series DC solver. An audience joins through a QR code and interacts from phones; Socket.IO keeps the host and guest screens connected to the same server state. Host interaction and presentation controls support a live demonstration.

Our demonstration runs in clearly labelled example mode without an API key. Drawing, rendering, editing, blueprint files, simulation and audience synchronisation work in that mode. We do not describe built-in examples or rule-based choices as live AI output.

## Architecture and technical approach

The application uses React and TypeScript for the studio, Three.js with React Three Fiber and Drei for preset 3D geometry, Express for the API, Socket.IO for shared state, and Zod for validation. A single blueprint describes the confirmed pet or circuit rather than asking each subsystem to reinterpret the original image independently.

The server owns the in-memory session and mutations. The browser receives state updates and renders the creation. Model responses are parsed and checked; application code applies only supported actions. The app does not execute generated code. The circuit solver is an educational series-loop approximation rather than a general electronics simulator.

## Where AI is used

The repository includes three optional server-side OpenAI adapters:

- **Vision:** a drawing PNG or uploaded image goes to the Responses API with a structured pet or circuit schema. The returned specification is validated and shown for correction before building.
- **Decisions:** current pet needs and recent interactions are supplied to the Decisions API, which chooses from allowed actions. The app validates the choice and applies a bounded effect.
- **Images:** an optional pet portrait is requested through the image adapter and displayed as a 2D picture on a stand.

Without credentials, the application uses editable examples and an explicitly labelled rule-based pet decision. It does not silently fabricate successful vision or image calls. Each integration has a visible status, and a successful live request is distinguished from merely configuring a key.

**Live OpenAI requests were not verified for this delivery because credentials were unavailable.** Automated adapter tests use controlled responses. We can demonstrate the local creation, interaction and simulation flow, but do not claim measured live model accuracy or latency.

## How Codex contributed

The repository already contained the pet/circuit studio, procedural renderers, example artwork, simulation, and optional API adapters before the final demo preparation. Codex was used as a development collaborator to inspect those paths, coordinate focused implementation, improve the demo experience, identify race conditions, write regression coverage, run checks and prepare accurate documentation.

The demo preparation work adds direct drawing, editable starter creations, validated JSON blueprint files, host interaction controls and presentation controls. Reliability work covers rebuilding and asynchronous requests so older results cannot replace a newer creation, as well as bounded audience interactions. The [verification record](VERIFICATION.md) is the evidence for completed checks and known gaps. Codex assistance is not a claim that all pre-existing code or assets were created during this final preparation session.

## What makes the approach useful

The model's interpretation becomes a small, inspectable specification rather than an opaque final image. That makes correction possible before the world is built and gives rendering and behaviour the same source of truth. Shared audience interaction then makes the result easy to test in front of a room: feed a pet, open a switch, and see the outcome on both screens.

## Verification and limits

The project includes Vitest unit and API coverage plus Playwright desktop/mobile flows. CI is configured to run dependency installation, type checking, tests, the production build and Chromium browser checks, retaining failure artifacts. See [VERIFICATION.md](VERIFICATION.md) for the actual local command results; a workflow definition alone is not a claim that a remote CI run passed.

Current limits: preset pet geometry rather than free-form mesh generation; one series circuit rather than arbitrary networks; one shared in-memory server session; no accounts or authenticated host controls; and no CAD, STL/GLB, voice or general web-component export. The portable design format is a structured JSON blueprint; sketches can also be saved as PNGs. Restarting the server clears session state. The demo should run with a trusted audience on a network that allows the guest connection.

## Credits

- Application libraries: React, TypeScript, Three.js, React Three Fiber, Drei, Vite, Express, Socket.IO, Zod and qrcode.
- Verification tools: Vitest, Supertest, Testing Library and Playwright.
- Optional AI services: OpenAI Responses, Decisions and image adapters, as implemented in this repository.
- Existing repository code and example artwork are retained. Team authorship and any additional asset acknowledgements should be confirmed by the submitting team.
- Exact packages and versions are recorded in `package.json` and `package-lock.json`.

## Submission metadata to complete

| Field | Value |
| --- | --- |
| Project name | Living Paper |
| Source repository | [Mahdi-Lalioui/Open-AI-hack-](https://github.com/Mahdi-Lalioui/Open-AI-hack-) |
| Team name and members | **Add confirmed names and roles** |
| Hackathon and track | **Add the event and eligible track** |
| Demo video | **Add an existing, reviewed video URL** |
| Hosted demo | **Add an existing, tested URL, or state that the demo runs locally** |
| Submitted commit | **Add the final verified commit SHA** |
| Event-specific disclosures | **Check the actual rules for pre-existing work, AI assistance and asset credits** |
