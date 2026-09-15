# pi-read-video

Lets Pi's current model call `read_video` to inspect a local video. **Kimi and Gemini use inline input only; the extension never uses a Files API.**

```text
@recordings/bug.mp4 Inspect why the button disappears after 13 seconds, then relate it to the project code.
```

There is no `/video` command, no interception of `@`, and no second model that summarizes video. Configuration uses only `video: true`.

## Installation

Install into Pi through npm:

```bash
pi install npm:pi-read-video
```

Run `/reload` in the current Pi session; new sessions load it automatically. You must still configure `video: true` as described below.

Alternatively, place the entire `pi-read-video` directory at:

```text
~/.pi/agent/extensions/pi-read-video/
```

The manual-install entry point is `~/.pi/agent/extensions/pi-read-video/index.ts`. Do not load the npm version together with a manual copy or the older `pi-video` extension: each registers `read_video`. Remove the old extension directory before switching installation methods.

Run `/reload` in Pi. Installation does not require `npm install` or compilation: Pi provides the host modules used by the entry point and loads TypeScript files.

This version targets the `@earendil-works/pi-coding-agent` 0.85.1 extension API. Runtime requires Node.js 22.19.0 or later. Older `@mariozechner/*` package names and changed host APIs are unverified.

## Configuration

**Merge** the following into your existing `~/.pi/agent/models.json`; do not replace other providers, models, or credentials. With a custom agent directory, the extension uses Pi's `getAgentDir()` and reads that directory's `models.json`.

```json
{
  "providers": {
    "kimi-coding": {
      "modelOverrides": {
        "kimi-for-coding": { "video": true },
        "k3": { "video": true },
        "k3-256k": { "video": false }
      }
    },
    "google": {
      "baseUrl": "https://generativelanguage.googleapis.com",
      "modelOverrides": {
        "gemini-3.8-flash": { "video": true }
      }
    }
  }
}
```

`video` is this extension's custom Boolean field, not a native Pi field. Do not add `adapter`, `capabilities`, or `x-video`, and do not add `video` to Pi's `input` array.

`video` **must be model-level**: use `modelOverrides[id].video` for an existing model, or `video` on the matching entry in `models[]` for a custom model. Provider-level `video` is rejected so it cannot accidentally enable video for a whole provider. `true` only enables the tool; it does not add video support to an unsupported model.

Pi requires a provider configuration to contain at least one setting it recognizes. The Google example therefore includes its official `baseUrl`; do not create a provider that contains only a model video flag.

The extension rereads JSONC at startup, `/reload`, and before every user turn. An invalid configuration fails closed rather than retaining an old policy. Model switching changes only `read_video`, never unrelated tools.

## Supported routes

| Pi provider / API | Injected format |
| --- | --- |
| `kimi-coding` / `anthropic-messages`, official Coding endpoint | `type: "video"`, `source.type: "base64"` |
| `google` / `google-generative-ai`, official Gemini Developer API | `inlineData: { mimeType, data }` |

Kimi's video block is an extension of its Anthropic-compatible endpoint; it does not mean that the Claude API accepts video. This version does not enable Vertex, Gemini CLI OAuth, third-party proxies, or OpenAI-compatible routes. Even with `video: true`, an unimplemented route does not enable the tool.

Pi owns authentication, HTTP transport, streaming, and server retries. The extension never reads a key, constructs an upload request, or persists a remote file ID.

## Behavior and boundaries

In Pi's **interactive input**, reference a video with `@`. The model sees the path and calls `read_video({"path":"..."})` when the task requires it. The extension validates and reads the local file, base64-encodes it in memory, then converts the genuine tool result into the matching protocol's native video input during `before_provider_request`.

`@` neither forces a tool call nor sends a video as soon as you enter a path. The model must call `read_video` to inspect the picture. An ordinary `read` of a video is blocked and told to use `read_video` instead.

**Do not confuse an interactive reference with `pi @clip.mp4` at process startup.** The latter first goes through Pi's own CLI file processor, which this extension does not intercept. Start Pi first, then reference the video from the input field.

Extensions and container-header checks support MP4, MOV, WebM, MKV, AVI, MPEG, FLV, and 3GP. The extension does not validate codecs, duration, or audio understanding; the provider ultimately determines decoding behavior. There is no FFmpeg dependency and no automatic frame extraction, transcoding, or clipping.

## Privacy, session behavior, and limits

Inline input still sends video bytes to the selected model service. It bypasses a separate Files API, but it is not local inference or a zero-retention promise.

Sessions retain only the path, filename, MIME type, size, hash, and reference marker; they **never retain base64**. Process-local media storage deduplicates content, budgets 96 MiB of encoded strings, and keeps at most 256 references. Encoding is serialized so parallel tool calls do not allocate several full file buffers at once.

After `/reload`, session restore, fork, a new session, or tree navigation, the extension does not silently reread a historical path. When an in-memory reference is unavailable, the model is explicitly told to call `read_video` again. Switching provider does not automatically send a video to the new provider.

An explicit `read_video(path)` reads that local video without a working-directory confirmation, including an external path in non-interactive mode. A model can read files that the current process can read, but bytes are sent only on requests to an enabled supported model. The same file descriptor is used for validation and reading, with file identity and size checked to prevent replacement after inspection. Text inside a video is untrusted data, not new instructions.

| Route | Raw single-file budget | Serialized request-parameter budget |
| --- | ---: | ---: |
| Kimi | 35 MiB | 50,000,000 bytes |
| Gemini | 14 MiB | 20,000,000 bytes |

These are conservative **client** budgets, not API hard-limit claims. The full-request check includes base64, history, and other request parameters; the Google SDK subsequently serializes its own HTTP request. A file smaller than the limit is not guaranteed to fit the final request or the model context window.

When a budget is exceeded, the extension omits that video's injection, notifies the user, and explains the reason in the tool result. It never falls back to uploading. Shorten the context or trim the video yourself. The same content is attached once per request; different turns can still resend inline data and incur traffic and model usage.

The extension does not log raw requests, although other debugging extensions or SDK logs may record a request body that contains video.

## Development and verification

```bash
# Offline unit tests and mocked Pi-host tests; no real key or API request.
npm test

# Full host type checking requires development dependencies.
npm install --ignore-scripts
npm run typecheck

# Exercise the real Pi Anthropic/Google serialization chain, then stop before HTTP.
npm run test:pi
```

Tests use synthetic container headers and do not claim real video decoding or end-to-end verification. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for detailed results and open verification work, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries, and [docs/SOURCES.md](docs/SOURCES.md) for interface evidence.

## Initial GitHub publication

The target repository is `astrosheep-zero/pi-read-video`. The script below is only for initial creation and refuses if the repository already exists.

Run it on a machine with GitHub CLI installed, logged in as `astrosheep-zero`, and with Git commit identity configured:

```bash
node scripts/publish.mjs
```

The script verifies the account, runs tests, then creates and pushes `astrosheep-zero/pi-read-video` privately by default. It becomes public only with an explicit `--public`. It accepts no token parameter, does not alter an existing `origin`, does not overwrite an existing repository, and does not add files to an ancestor repository.

Before committing, inspect `git diff --cached`. For later releases, use ordinary Git commits and pushes rather than rerunning the initial-publication script.
