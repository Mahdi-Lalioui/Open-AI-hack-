# VDraw submission copy

The sections below are ready to use as submission text once you've filled in the details at the end. We weren't given an event-specific judging rubric, so check it against the rules before you submit.

## One-line pitch

Sketch or describe an idea and VDraw gives you an editable design that you can 3D print, open in CAD, put on the web and test live.

## The problem

Getting from an idea to a usable design usually takes CAD software, 3D modelling tools and some frontend development, and most people with a good idea have none of those skills, so the idea tends to stop at the drawing.

## What we built

VDraw is a creation studio that runs in the browser. You sketch on a canvas, upload an image, type or speak, and the AI turns that into a Design Blueprint, a validated specification with real dimensions, parts, materials and animation. The Blueprint then drives everything else: an interactive 3D model, editable OpenSCAD source, STL and GLB files, a web component and a product page. You can change a design by describing what you want or by editing its parameters in the inspector, and every format follows along.

Designs that do something can be tried out as well. A circuit runs a real series DC calculation that you can switch on and off while an audience joins by QR code and does the same from their phones. For fun, the same system runs Pixel, a character you can print as a desk toy and also feed and play with.

The built-in examples (a desk organiser, an electronics case, a bedside table, a planter and an LED teaching board) work without an API key, and the app labels them as using no AI.

## Architecture and technical approach

The app uses React and TypeScript, with Three.js, React Three Fiber and Drei for 3D, Express for the API, Socket.IO for the shared live test and Zod for validation.

A single Blueprint describes each design, so no part of the system has to reinterpret the original input for itself. One deterministic geometry generator feeds both the viewport and the exporters, which means they draw the same triangles. Validation checks the structure, references and physical limits, recomputes dimensions from the geometry, and warns about floating parts and walls too thin to print. The app never executes generated code.

## Where AI is used

Sketches, images and text go to the Responses API with a strict Blueprint schema, which handles both interpretation and refinement and recognises circuits and characters by itself. We validate each result and give the model one chance to fix anything that failed. Recorded audio is transcribed into a description or a change. In the pet example, the Decisions API chooses from a list of allowed actions, which application code checks before applying, and an optional 2D portrait comes from the image API.

Without credentials the app falls back on labelled examples and rule-based edits, and it won't pretend to have read a sketch. We've confirmed live calls for interpretation, refinement, sketch reading, decisions and transcription with a real key (see [VERIFICATION.md](VERIFICATION.md)), but we haven't measured model accuracy and make no claims about it.

## How Codex contributed

We used Codex as a development collaborator on the live experience. It inspected code paths, implemented the drawing pad, starter characters, host controls and presentation mode, found race conditions, wrote regression tests, ran checks and helped prepare documentation. The Blueprint, the exporters and the unified app were built with Claude Code.

**Team: please review this section and add concrete examples before submitting.**

## Why this approach is useful

The model's interpretation ends up as a small specification that a person can read and correct, rather than an opaque image. Every format shares that one source of truth, and the files are real, which we check using the Khronos glTF validator and the actual OpenSCAD compiler.

## Verification and limits

The project has Vitest unit and API tests along with Playwright flows at desktop and mobile sizes, and CI is configured to run them, although having a workflow file doesn't mean a remote run has passed. [VERIFICATION.md](VERIFICATION.md) has the actual results.

Designs are built from primitive shapes, so there are no boolean cut-outs, fillets or free-form surfaces. Circuits are limited to one series loop. The live test is a single shared session held in memory with no accounts or authentication, so it's meant for an audience you trust.

## Credits

The application uses React, TypeScript, Three.js, React Three Fiber, Drei, Vite, Express, Socket.IO, Zod and qrcode, and we test it with Vitest, Supertest, Testing Library, Playwright, gltf-validator and openscad-wasm. The AI services are the OpenAI Responses, Decisions, Image and Audio Transcriptions APIs. The submitting team should confirm authorship and any further asset acknowledgements.

## Details to fill in

| Field | Value |
|---|---|
| Project name | VDraw |
| Source repository | [Mahdi-Lalioui/Open-AI-hack-](https://github.com/Mahdi-Lalioui/Open-AI-hack-) |
| Team name and members | **Add confirmed names and roles** |
| Hackathon and track | **Add the event and eligible track** |
| Demo video | **Add an existing, reviewed video URL** |
| Hosted demo | **Add an existing, tested URL, or say that the demo runs locally** |
| Submitted commit | **Add the final verified commit SHA** |
| Event-specific disclosures | **Check the actual rules on pre-existing work, AI assistance and asset credits** |
