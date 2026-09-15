# Verification record

## Reverification of local changes (the historical record below is retained)

- Removed the confirmation callback, UI prompt, and working-directory boundary check for videos outside the directory; retained real-path resolution, file-identity checks, size budgets, and cancellation.
- `npm test`: 101 passing tests cover parallel external reads without UI, original-ID provenance checks, rejection of unauthorized markers, protocol-ID pairing, and duplicate-response rejection.
- `npm run typecheck`: passed against the local Pi 0.85.1 host dependencies.
- `npm run test:pi`: 18 passing tests. The test invokes real Pi 0.85.1 Anthropic/Google serializers, captures at `onPayload`, then deliberately aborts before HTTP. It covers Kimi, Gemini 3 with IDs, Gemini 2.5 without IDs, same-model and model-switch cases, normal/special/long IDs. The test requires development dependencies and is included in CI, but has not yet run remotely.
- ID layering changed: context still validates the original call ID and tool-result provenance; protocol code consumes only Pi-serialized call/response pairs plus authorized markers. It does not read the reference's original ID or duplicate normalization rules. All 18 combinations attach successfully without rewriting original session data or assistant signatures.
- Exceptional IDs are regression-test fixtures, not claims about Kimi server behavior. Passing tests do not mean a service accepts arbitrary IDs.
- This change still does not verify real video decoding, Kimi/Gemini server responses, or actual Pi TUI interaction.

Date: 2026-09-09. Version: pi-read-video 0.1.0.

## Completed checks

- `npm test`: **90 passed, 0 failed, 0 skipped**. Full TAP output is retained in `TEST-RESULTS.txt`.
- Strict TypeScript checking of the core layer passed, including `strict`, `noUncheckedIndexedAccess`, and unused-symbol checks. The scope is `src` and excludes `pi-extension.ts`, which requires Pi SDK declarations.
- A mocked Pi event end-to-end flow passed: tool call → context provenance validation → request injection, for both providers, with all `fetch` and credential reads forbidden in tests.
- Publication-script safety tests passed: private by default, account matching, existing-repository refusal, and ancestor-repository protection. These are mocked command tests.
- `npm pack --dry-run --ignore-scripts` passed and included the extension entry point and all runtime source files.

## Environment and limitations

The offline environment used Node.js 22.16.0 and TypeScript 5.8.3. Core checks reused installed Node 25.1.0 type declarations. Pi 0.85.1 requires Node.js >=22.19.0 for real installation. CI is prepared for Node 22.19.0 and 24 but has not run remotely.

Full `npm run typecheck` was **not verified** in that environment because Pi, Pi TUI, and TypeBox development declarations were unavailable; npm-registry access returned `EAI_AGAIN`. Core type checking is not a substitute for complete SDK type checking. CI includes a separate job that installs development dependencies and runs the full check.

The extension has not been loaded in a real Pi TUI process and has not called a real Kimi or Gemini API. Unit tests use synthetic container headers and validate reading, encoding, state, and request shape, not provider decoding, real quotas, real service limits, or response quality.

## GitHub publication status

The available GitHub connection confirmed the target account `astrosheep-zero`; querying `pi-read-video` returned 404. The current session's GitHub tools were read-only and did not provide repository creation or file-push capability; the local machine also lacked GitHub CLI and publication credentials.

Running `node scripts/publish.mjs` exited immediately:

```text
Cannot run gh: spawnSync gh ENOENT
```

Accordingly, this record does **not** claim repository creation or a completed push. The source keeps the publication script; on a machine with an authenticated GitHub CLI it creates the repository privately by default and accepts no stored token.
