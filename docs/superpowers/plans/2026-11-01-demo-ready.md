# Living Paper Demo Implementation Plan

> **For agentic workers:** Use focused parallel implementation with a fresh whole-branch review. User delegated all implementation choices.

**Goal:** Ship a polished and reliable sketch-to-live-world demo before 15:00 London.
**Architecture:** Existing validated pet/circuit specifications power all rendering, interaction, and JSON exports. No new external services or framework migration.
**Tech Stack:** React 18, TypeScript, Three.js/R3F, Express, Socket.IO, Zod, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-11-01-demo-ready-design.md`

## Global Constraints
- Preserve the existing API and test selectors where practical.
- No keys or personal data committed; example mode is labelled honestly.
- Do not execute model-generated code or provide fake exports.
- Parallel workers have disjoint file ownership. Root coordinates contract changes and commits.
- Finish implementation by 14:35 to allow browser verification, review and push.

## Review Focus
- Refreshing must preserve the confirmed blueprint without overwriting intentional local edits.
- Async recognition/portrait/decision completions must not corrupt a newer creation.
- Separate phones on the same public IP must remain usable while individual requests stay bounded.
- Imported JSON must be validated before reaching the renderer; export/import must preserve the specification.
- Mobile, reduced-motion and unavailable WebGL must retain useful controls.

### Task 1: Backend reliability and portable blueprint validation
Files: `server/**`, `shared/blueprint.ts`, `src/lib/creationApi.ts`, `tests/api/**`, `tests/unit/**` (backend).
Interfaces: shared `buildCreationSchema` and `BuildCreationInput`; optional `clientId` on interactions, added by client transport. Preserve existing server schema re-exports.
- [x] Write and run failing regressions for stale portrait completion, rebuild clearing, meaningful pet decision effects and separate guest browser identities sharing one IP.
- [x] Fix root causes; retain idempotent retry semantics and a broad aggregate IP ceiling.
- [x] Move creation build validation to `shared/blueprint.ts`, re-export from existing server module.
- [x] Run targeted tests, then full unit/API suite; report exact results.

### Task 2: UI art direction, host actions and presentation
Files: `src/host/HostPage.tsx`, `ReadoutCard.tsx`, `AskCard.tsx`, `AudienceCard.tsx`, `src/guest/GuestPage.tsx`, `src/styles.css`, `src/components/Icon.tsx`, `src/scene/CircuitBoard.tsx`, `tests/e2e/studio.spec.ts`.
Interfaces: CreationColumn gets optional `creation: CreationConfig | null`; root adds drawing/import within its subtree. Export panel is a separate component root integrates via UI worker.
- [x] Write meaningful e2e tests for host actions and presentation toggle, observe failures.
- [x] Redesign studio/guest with strong paper-stage hierarchy, useful empty state, host feed/pet/play and presentation toggle (Escape exits).
- [x] Keep visible API labels; rename generated skin to portrait and show rejected decisions.
- [x] Improve lit LED appearance and mobile flow; preserve accessibility and reduced motion.
- [x] Run focused browser tests and report results.

### Task 3: Direct sketching, starter library and real blueprint save/load
Files: `src/host/CreationColumn.tsx`, `src/host/SketchPad.tsx`, `src/host/BlueprintPanel.tsx`, `src/lib/blueprintFile.ts`, `src/host/examples.ts`, `tests/unit/blueprint-file.test.ts`, `tests/e2e/creation-studio.spec.ts`.
Interfaces: import `buildCreationSchema` from `shared/blueprint.ts`; download confirmed `CreationConfig`; import validates into `BuildCreationInput` and calls existing `buildCreation`.
- [x] Write failing tests for valid pet/circuit round trips, malformed imports, editor reload preservation and canvas controls.
- [x] Implement bounded validated JSON save/load with visible error states and real file download.
- [x] Implement pointer draw/erase/undo/clear → PNG → existing recognition pipeline; retain upload and examples.
- [x] Hydrate initial editor from confirmed creation, invalidate stale recognition on edit, serialize recognition and show confirmation only after successful build.
- [x] Add a small editable pet starter library and safe 470-ohm circuit default.
- [x] Run unit and browser verification.

### Task 4: Submission, review and delivery
Files: `README.md`, `docs/DEMO.md`, `docs/SUBMISSION.md`, `docs/VERIFICATION.md`, `.github/workflows/ci.yml`.
- [x] Replace contradictory aspirational README with accurate setup, supported functionality and limitations.
- [x] Add a concise demo script, submission copy, reproducible verification and CI.
- [x] Run full tests, typecheck/production build and Playwright desktop/mobile suite.
- [x] Review actual screenshots and production server behavior, obtain independent final code review and fix material findings.
- [x] Commit, fetch/check remote, fast-forward main when safe, push and verify remote SHA. Keep local server available for review.
