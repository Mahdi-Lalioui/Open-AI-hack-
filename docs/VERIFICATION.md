# Verification — 2026-11-01

Verified locally in example mode. No live OpenAI request was made from this checkout; the user selected example mode and the teammate's credentialed environment is separate.

## Final results

| Check | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Locked dependencies installed successfully |
| `npm test` | 15 files, **207 tests passed**, zero failures |
| `npm run build` | TypeScript and production Vite build passed |
| `npx playwright test` | **35 passed, 2 expected mobile skips**, zero failures, 1.4 minutes |
| Production browser smoke | Health, built UI, starter build, guest-to-host WebSocket feed, example decision, presentation, screenshots and no page errors passed |
| `git diff --check` | Passed |
| Independent source review | No material findings; numerical solver edge case separately fixed with failing-then-passing regressions |

There is no lint script in this repository. The build runs the configured TypeScript check. CI has been configured but remote CI results are separate from these local results.

## Exercised behavior

- Desktop 1365×768 and mobile 390×844 layouts, readable metrics, touch controls, keyboard focus, reduced motion and usable WebGL fallback.
- Real 3D canvas pixels have a nonzero luminance spread and hundreds of distinct sampled colors; the canvas is not blank.
- Pet and circuit host/guest flows, host Feed/Pet/Play, phone interactions, reconnection, idempotent retries, shared-IP audience identities and bounded rate limits.
- Presentation mode and Escape restore the studio, with example mode visibly labelled.
- Editor hydration after reload preserves custom parts; same-version socket updates preserve local drafts.
- Drawing produces actual ink pixels. Switching input tabs preserves strokes. Undo/clear and a real PNG download work; downloaded bytes have a PNG signature and 560×360 dimensions.
- Downloaded JSON parses and contains the confirmed specification. Valid pet/circuit files round trip through shared validation; invalid/versioned/oversized imports are rejected without replacing the confirmed creation.
- Imports wait for pending builds. Recognition is serialized and stale results cannot replace newer edits.
- Portraits and decisions cannot attach to a rebuilt/reset pet. Rebuild clears creation-specific results. Pet decisions have bounded effects on needs.
- Circuit examples use 470 Ω at 9 V. Extremely small resistance values return an invalid, finite result instead of Infinity/null that could crash the UI.

The two skips are mobile keyboard-Tab navigation and a second browser launch with WebGL disabled; their equivalent desktop checks passed. No other checks were skipped.

## Visual and production review

Reviewed desktop studio, presentation mode, phone controls, circuit/LED and WebGL fallback screenshots. Production smoke used `npm start` on port 5173 with an independent phone browser context. Local screenshots were saved for the submitting team.

## Remaining boundaries

Supported interpretations are preset **pets and simple series circuits**, not arbitrary drawings or free-form meshes. JSON blueprints and sketch PNGs are real exports; CAD/STL/GLB exports are not implemented. The single server's state remains in memory and host controls are not authenticated. Restarting clears the session.

Live vision, AI decisions and portraits still require a successful `npm run smoke:live` on the teammate's configured machine. Vercel hosting is not verified: see [DEPLOYMENT.md](DEPLOYMENT.md) for the shared-state requirement. The local production demo is verified; a hosted URL, video, team metadata and event-specific disclosures must be supplied by the team before submission.
