# Code and abstraction boundaries

## Request path

```text
Pi interactive @path
  → model decides to call read_video
  → Pi binding validates parameters and bridges cancellation signals
  → VideoService checks policy and route
  → media inspects and reads the file once
  → VideoStore keeps in-memory base64 and returns a metadata-only reference
  → Pi persists the ordinary text tool result and metadata
  → context validates the tool-result provenance for the current request
  → before_provider_request invokes a pure protocol transform
  → Pi's existing provider sends the request containing inline video
```

## Module responsibilities

| Module | Responsible for | Not responsible for |
| --- | --- | --- |
| `index.ts` | Obtaining Pi host modules, schema, and text renderer | Business logic |
| `pi-extension.ts` | Pi events, tool registration, enablement, UI, cancellation-signal bridging | Wire encoding or read authorization |
| `config.ts` / `jsonc.ts` | Compiling raw configuration into a Boolean policy | Storing API keys or implementing providers |
| `routes.ts` | Implemented provider/API routes and client budgets | Guessing unknown model capability |
| `service.ts` | One-read use case, lifecycle, context-provenance validation | HTTP or concrete video wire blocks |
| `media.ts` / `formats.ts` | Paths, file identity, bounded reads, container headers, base64 | Networking, TUI, transcoding |
| `store.ts` / `references.ts` | In-memory content deduplication, references, byte-free persistent representation | Disk cache or rereading files after restoration |
| `wire/kimi.ts` | Converts a Kimi `tool_result` into a base64 video block | Gemini or file I/O |
| `wire/gemini.ts` | Preserves `functionResponse` grouping and appends `inlineData` | Kimi or file I/O |
| `wire/index.ts` | Model-consistency checks and aggregate request budget | HTTP sending or credential reads |

Provider differences are intentionally not generalized into an adapter framework users must configure. There are only two small, isolated, testable protocol transforms. A new protocol needs an explicit route, a transform implementation, and tests; adding only a model name is insufficient.

## Data lifecycle and trust boundary

`VideoReference` contains metadata only and is the sole type allowed in tool `details.readVideo`. `InlineVideo` contains base64, stays in `VideoStore`, and is used only to make a request copy immediately before sending. There are no `any` casts or conversions that disguise video as `ImageContent`.

`context` authorizes injectable markers only for successful `read_video` results in the current message. It checks the call ID and a process-generated reference. User input, ordinary `read` results, forged details, and error results cannot trigger injection. **Assistant messages are never rewritten**, preventing signature-replay damage.

The original session call ID is used only by the context layer to validate provenance. `ResolveVideo` returns only markers authorized in the current context, matching the route, and still resident in memory. Protocol code neither reads the reference's original call ID nor implements Pi's ID-normalization rules. It uses only Pi-serialized call/response pairs; older id-less Gemini calls consume by the count of already seen `read_video` calls. Protocol encoders must use this authorization resolver rather than querying an unvalidated global cache.

The Kimi transform additionally requires the corresponding preceding `tool_use` and places video in that call's `tool_result.content`. The Gemini transform verifies function-call/function-response correspondence, preserves IDs and thought signatures, does not split parallel `functionResponse` groups, and adds media in the immediately following user Content rather than inside a JSON output string.

Every transform returns a copy and never writes a real video block back to Pi's session. Even if configuration is disabled after context validation, the request layer checks enablement again. A marker alone does not authorize file reading after restart.

## Intentional limitations

A raw-file budget is checked before reading, and a serialized-parameter budget is checked after request rewriting with all context included. On overflow, the behavior explicitly degrades to “video not provided”; it never silently switches to a Files API. Request mutations made by other extensions after this extension are outside its control.

File encoding is queued and process storage is bounded, but total RSS also includes Pi itself, temporary Buffers, SDK parameters, and serialization copies. The 96 MiB cache figure measures encoded strings, not a total-process memory guarantee.

Switching to a different video-enabled model on the same provider/endpoint can reuse resident content. Content is not reused across provider, API, or endpoint boundaries. Cleared or evicted references require the model to call the tool again. This is an explicit memory-lifecycle choice; the extension does not automatically restore videos or silently send them across services.
