# Interface evidence

Checked on 2026-09-09. These sources establish interface shapes; they are not proof of end-to-end behavior for a real account.

## Pi

- [Extension documentation](https://pi.dev/docs/latest/extensions): `registerTool`, `context`, `before_provider_request`, `model_select`, and session lifecycle.
- [Model documentation](https://pi.dev/docs/latest/models): native `input` and `modelOverrides` fields.
- [Package definition](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/package.json): version 0.85.1 at review time; Node engine `>=22.19.0`.
- [Extension types](https://github.com/earendil-works/pi/blob/be26e32704f7cab048e2b356206350ef7ad65999/packages/coding-agent/src/core/extensions/types.ts): tool execution and rendering interfaces.
- [Model configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/model-config.ts): `video` is not a native field. The extension reads raw JSONC itself and does not assume the field survives in the runtime Model.
- [Google parameter construction](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/google-generative-ai.ts): `onPayload` runs after `GenerateContentParameters` construction and before the SDK call.
- [Google message conversion](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/google-shared.ts): tool results live in `functionResponse.response.output`; parallel-response grouping and Google tool-call ID normalization.
- [Kimi provider](https://github.com/earendil-works/pi/blob/main/packages/ai/src/providers/kimi-coding.ts): `kimi-coding` uses an Anthropic-compatible API.
- [CLI file handling](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/file-processor.ts): startup `@file` behavior differs from interactive-editor references.

## Kimi

- [Anthropic protocol lowering](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/human/llm/requester/bases/anthropic/lower.ts): `video`, `source.type = base64`, `media_type`, and `data`; video can appear inside tool results.
- [Inline-video construction](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/agent/media/videoUpload.ts): local video data URLs and protocol selection.
- [Official Hermes integration documentation](https://www.kimi.com/code/docs/third-party-tools/hermes.html): direct base64 video sending; roughly 50 MB is a Hermes client limit, not an API-limit claim.
- [Model documentation](https://www.kimi.com/code/docs/kimi-code/models.html): model capability and the `k3-256k` video limitation.

## Gemini

- [GenerateContent video-understanding documentation](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding): inlineData video example and roughly 20 MB total-request guidance.
- [GenerateContent API](https://ai.google.dev/api/generate-content): `Content`, `Part`, and `inlineData`.
- [General video documentation](https://ai.google.dev/gemini-api/docs/video-understanding): newer Interactions paths and differing input-size guidance. This extension uses Pi's current GenerateContent parameter interface, retains its own conservative client budget, and does not conflate limits from different APIs.

## CI

At review time GitHub Actions v4 tags pointed to these commits: checkout `11d5960a326750d5838078e36cf38b85af677262`; setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`. Before the repository is published, CI is bundled configuration only and cannot be described as a completed remote check.
