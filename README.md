# VDraw

**Sketch it. Describe it. Bring it to life.**

VDraw turns rough sketches, reference photos and plain descriptions into designs you can actually use. You give it an idea in whatever form you have it, and it works out the parts, sizes and materials, shows you a 3D model you can change, and hands you real files for 3D printing, CAD and the web.

## 1. Overview

### The problem

Getting from an idea to something usable normally means learning CAD, a 3D modelling package, some animation software and probably a bit of frontend development, which is a lot to ask of someone who only wants to build a better pen holder.

### Our solution

VDraw puts all of that behind a single workspace. Whatever you sketch, upload or describe becomes a Design Blueprint, a structured specification that every output is generated from, so the 3D model, the CAD file and the web page can never disagree with each other.

### Who is it for?

We built it for designers and product prototypers, makers and hobbyists, indie game developers, frontend developers, teachers, and anyone else who would rather make the thing than learn the software first.

## 2. How it works

You start by drawing a sketch, uploading an image, or typing or speaking your idea. The AI reads that input and fills in a Blueprint, which the app validates before anything is drawn. You then get an interactive 3D model that you can refine by asking for changes in plain language or by editing the real parameters in the inspector. If the design does something, like a circuit, you can try it in the live test and let people join from their phones, and when you're happy you can download it in whichever format you need.

## 3. Features and supported outputs

| Capability | What it does | Status |
|---|---|---|
| Sketch interpretation | Reads rough drawings and works out what you meant | Working, needs an API key |
| Image and text input | Combines reference images with a description | Working; without a key, text can only pick a built-in design |
| Voice input | Lets you speak a description or a change | Working; we've confirmed model access but haven't yet tested it with real speech |
| Design Blueprint | The validated specification behind every output | Working |
| Interactive 3D preview | Lets you rotate a design, spin it, pull it apart and select its parts | Working |
| Design refinement | Changes dimensions, parts and materials | Working with AI, with simple rules when there's no key, and in the inspector |
| CAD export | Editable parametric source | Working, as an OpenSCAD `.scad` file |
| 3D export | Downloadable models | Working, as STL and GLB |
| Web output | Components and interactive product previews | Working, as a `<vdraw-model>` element and a product page |
| Animation | Motion on generated objects | Working in the viewport and in the GLB and web exports |
| Live test | Lets you and an audience try designs that do something | Working for circuits and the pet example, with phones joining by QR code |
| Save and reopen | Keeps a design as a file | Working, as a Blueprint `.json` |

We only mark something as working once it works in the actual application.

### Examples you can open straight away

The app comes with a modular desk organiser, a case for a Raspberry Pi sized board, a bedside table with a drawer that slides out, a planter with a drain and saucer, and an LED circuit teaching board. These load instantly and use no AI, and the app labels them that way. Just for fun there's also Pixel the pet, a little desk toy you can print and also feed and play with in the live test.

### Known limits

Designs are built from primitive shapes (boxes, cylinders, cones, spheres, ellipsoids, open-top boxes and cups), so there are no boolean cut-outs, fillets or free-form surfaces, and an opening has to be made by building the wall around it in pieces. An STL contains one closed shell per part, which slicers merge when printing, and that's why the material volume we show is an upper estimate rather than an exact figure.

Circuits are limited to a single series DC loop, which is good enough for teaching but isn't a general electronics simulator, and their 3D model is a layout board with placeholder blocks rather than realistic components. A character's printable version is also a simplified take on its animated one, so the two differ slightly.

The live test runs as one shared session in the server's memory, so restarting the server clears it and you should save a Blueprint if you want to keep a design. There are no accounts, which means anyone who can reach the server can change the live test, so it's best kept to an audience you trust. 3D needs WebGL, although without it the app tells you so and the inspector, readouts and exports all keep working.

## 4. Backend architecture and APIs

### Architecture overview

```text
User input
  ├── Sketch or canvas
  ├── Reference image
  └── Text or voice
         |
         v
Backend API  --->  OpenAI Responses API (Structured Outputs)
         |
         v
Structured Design Blueprint
         |
         v
Validation and normalisation
         |
         +----------+----------+----------+----------+
         |          |          |          |          |
         v          v          v          v          v
        3D         CAD        Web      Animation   Live test
      renderer   exporter   exporter   renderer    (simulation)
         |          |          |          |          |
         +----------+----------+----------+----------+
                    |
                    v
              User outputs
```

### AI integration

Sketches, images and descriptions go to the OpenAI Responses API with Structured Outputs, which fills in the Blueprint and recognises circuits and characters by itself. We use audio transcription for voice instructions and, in the pet example, the Decisions API to choose from a list of allowed actions and the image API for an optional 2D portrait.

The model can only return data that fits our schema, and it never writes code that we run. If its answer fails validation we send it back once with the list of what went wrong, and if it fails again the user gets an error and keeps their current design, so invalid output never reaches a renderer or exporter. Anything produced without AI, such as an example or a rule-based edit, says so on screen.

### Design Blueprint

The Blueprint (`shared/blueprint/types.ts`) records a design's name, description, use case and style, along with its dimensions in millimetres, which are always recomputed from the geometry rather than trusted. It lists each part with its shape, parameters, position, rotation and material, how the parts relate to each other, any animation clips, and whatever the interpreter had to assume. Circuits and characters also carry a structured `circuit` or `pet` specification, which drives both their 3D model and their live test.

Renderers and exporters only ever read the Blueprint, never the original prompt. One generator (`shared/blueprint/geometry.ts`) produces the geometry for all of them, so the viewport and the downloaded files contain the same triangles.

### Backend endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/design/status` | Reports AI availability, the built-in examples and the export formats |
| `POST /api/design/interpret` | Turns text or an image into a Blueprint, loads an example (`templateId`), or opens a saved file (`blueprint`) |
| `POST /api/design/refine` | Applies an `instruction` in plain language, or validates and saves an edited `blueprint` |
| `POST /api/design/export` | Generates `scad`, `stl`, `glb`, `webComponent`, `webPage` or `blueprint` as a download |
| `POST /api/design/transcribe` | Turns recorded audio into text |
| `POST /api/design/:id/undo` | Goes back one version |
| `GET /api/design/:id` | Fetches a design from the current server session |
| `POST /api/creation` | Starts the live test for a design |
| `POST /api/interactions` | Handles live test actions such as flipping a switch or feeding the pet |
| `GET /api/state` | Returns the live test state, which is also broadcast over Socket.IO |
| `POST /api/bean/ask`, `POST /api/bean/image` | Power "Ask the pet" and the optional portrait |

Some older routes from an earlier queue simulation (`/api/sim/*`, `/api/orders`, `/api/workers`, `/api/world`) are still on the server, but the app no longer uses them.

## 5. Frontend and UI/UX

The app is laid out as a workspace rather than a chat window. The landing page at `/` explains what VDraw does using real designs, and the app itself lives at `/app`. On the left you have the sketch canvas, image upload, description box, voice input and the built-in examples. The centre holds the viewport, with tabs for the 3D model, the CAD source and the generated web page, plus a Live test tab on designs that do something, and the refine box sits underneath. The right side has the export panel and the inspector, where you can change overall size, parts, materials and individual parameters. There's also a Present mode that enlarges the stage for a room, and pressing Escape brings the studio back.

## 6. Demo

Our demo follows someone who wants a modular desk organiser but has never touched CAD. They sketch it, describe what it's for, and end up with an editable design and a file they can print. The [demo script](docs/DEMO.md) has the full run of show and what to do if something goes wrong on stage.

## 7. Use of Codex

Codex worked with us during the hackathon as a development collaborator, and [docs/SUBMISSION.md](docs/SUBMISSION.md) describes what it contributed. The Blueprint, the exporters and the unified app were built with Claude Code.

## 8. Running the project

You'll need Node.js 20 or later.

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY here; the examples and rule-based edits work without it
npm run dev
```

The landing page is then at http://localhost:5173/, the app at http://localhost:5173/app and the audience page at http://localhost:5173/join.

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API, websocket and UI in one process, on port `PORT` (5173 by default) |
| `npm run build`, then `npm start` | Builds and serves the production version; the Node server is required because the client files alone aren't the whole app |
| `npm test` | Runs the unit and API tests, with OpenAI faked at the network boundary |
| `npm run test:e2e` | Runs the browser tests on desktop and mobile sizes, after a first `npx playwright install chromium` |
| `npm run typecheck` | Checks the TypeScript |
| `npm run smoke:design` | Makes real, billed OpenAI calls to interpret, refine and export a design |
| `npm run smoke:live` | Makes real, billed OpenAI calls for sketch reading and decisions; add `-- --image` to request a portrait as well |

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Unset | Stays on the server; without it the app says so and offers examples and rule-based edits |
| `OPENAI_VISION_MODEL` | `gpt-6-astra` | Interprets and refines designs |
| `OPENAI_DECISIONS_MODEL` | `gpt-6-luna` | Powers "Ask the pet" |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Generates the optional portrait |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe` | Handles voice input |
| `OPENAI_DESIGN_TIMEOUT_MS` | `180000` | Limits how long a design request can run |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Overrides the API address if you need to |
| `HOST` / `PORT` | `0.0.0.0` / `5173` | Sets the listen address |
| `PUBLIC_BASE_URL` | Unset | Sets the address phones use for the QR code |

If the API says a model isn't available on your account, change the matching setting. Please never commit `.env` or a real key.

### Audience phones

Phones can't open `localhost`, so set `PUBLIC_BASE_URL` to this computer's address on the same Wi-Fi (for example `http://192.168.1.20:5173`) or to an HTTPS tunnel, then restart the server. Some venue networks block devices from reaching each other, so it's worth keeping a second browser tab open at `/join` as a backup. The [deployment guide](docs/DEPLOYMENT.md) covers hosting it publicly.

### Using the exports

A `.scad` file opens in [OpenSCAD](https://openscad.org), where each part's sizes are named variables that also appear under Window > Customizer. An `.stl` goes into a slicer such as PrusaSlicer or Cura, with units in millimetres, although you'll want to remove any part marked as a fit check or scale reference first. A `.glb` opens with its animation in Blender, online glTF viewers and game engines.

The `.js` file has no dependencies: load it with a script tag and write `<vdraw-model style="height:480px"></vdraw-model>` wherever you want the model to appear. The `.html` file is a standalone product page you can host as it is, and the `.json` file is the Blueprint itself, which **Open a saved Blueprint** brings back into the app.

### What has been verified

[docs/VERIFICATION.md](docs/VERIFICATION.md) records the actual test results and the gaps that remain. We check exports with tools other than our own code, namely the Khronos glTF validator, the three.js STL parser and the real OpenSCAD compiler, which has to build each design at the same size as its Blueprint.

## 9. Credits and acknowledgements

The app is built on React, three.js, React Three Fiber and Drei, with Express and Socket.IO on the server, Zod for validation and qrcode for the audience link. Our tooling is Vite, Vitest, Supertest, Testing Library and Playwright, and we use `gltf-validator` and `openscad-wasm` only in tests. Exact versions are in `package-lock.json`. On the AI side we use the OpenAI Responses, Decisions, Image and Audio Transcriptions APIs.

We built the Design Blueprint and its validation, the geometry generator, all of the exporters (including the GLB writer and the WebGL viewer), the app and landing page, the examples, the circuit simulation and the live test during the hackathon.

## 10. Future direction

The next things we'd add are boolean cut-outs and rounded edges in the Blueprint, followed by more circuit types. Beyond that, the same approach could stretch to game and AR assets, interior design, furniture prototyping and laser cutting.
