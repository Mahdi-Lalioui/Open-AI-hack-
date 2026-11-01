# VDraw demo design

User intent: make the existing hackathon app impressive, reliable, tested, pushed, and ready to submit before 15:00 Europe/London on 2026-11-01. The user delegated design choices and selected example mode for now.

Build on the existing React, Three.js, Express and Socket.IO studio. One validated pet/circuit blueprint remains the source of truth. Retain honest example/AI labels and do not imply free-form mesh generation or unimplemented CAD capabilities.

Chosen approach: a polished paper creation studio with a prominent interactive stage, direct drawing, editable starter creations, real blueprint JSON save/load, host interaction controls, and presentation mode. Keep the existing upload-to-vision path available. Broad CAD expansion and independent export geometry are outside this demo scope.

Reliability: preserve confirmed designs after reload, prevent recognition from overwriting newer edits, reject stale AI completions, clear creation-specific portrait/decision state on rebuild, and let separate guest browsers behind one Wi-Fi IP interact independently with bounded rate limits. Pet decisions must have meaningful bounded effects.

Visual direction: warm cream paper, dark ink, teal/coral accents, generous spacing, deliberate typography, a large dotted stage, clear section hierarchy and consistent line icons. Mobile must expose creation controls before secondary diagnostics. Support keyboard focus, reduced motion and WebGL fallback.

Exports are real validated JSON blueprints that can be imported through the normal creation build API. All download/import errors must be visible. The drawing pad supports pointer pen/eraser, undo and clear, and feeds a real PNG into existing image analysis. Without a key it explains the limitation and offers editable examples.

Verification: baseline and final unit/API suites, production build, Playwright desktop/mobile flows, actual browser visual inspection, export/import round trips, audience sync and stale async regressions. README/submission/demo docs describe the implemented product and remaining limitations. Push only verified changes; check remote changes before updating main.
