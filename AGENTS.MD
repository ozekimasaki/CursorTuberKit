# AGENTS.MD

## Project overview

This project is a streaming avatar web app centered on Catlin, a maid-cat AI livestream host character. The frontend displays `maid_cat.svg` as an inline SVG avatar, streams AI responses as captions, infers simple facial emotions, and plays segmented VOICEVOX audio while changing the mouth shape. The backend routes chat generation through Cursor or Gemini, keeps API keys server-side, merges browser turns with MemKraft continuity memory, and is optimized to run on Bun.

## Structure

- `src/`: React + Vite frontend.
  - `src/App.tsx`: main stage UI, streaming chat flow, speech segmentation, synthesis queue, playback state, local recent turns, and avatar state wiring.
  - `src/components/ControlDock.tsx`: compose / transcript / settings dock, submit/cancel controls, and VOICEVOX status display.
  - `src/components/MaidCatAvatar.tsx`: imports `maid_cat.svg?raw` and applies avatar/viseme classes.
- `src/lib/audioPlayback.ts`: plays WAV blobs, analyzes audio volume, and emits visemes.
- `src/lib/emotion.ts`: infers a lightweight emotion state from generated Japanese text.
- `src/lib/platformChat.ts`: frontend REST client for platform-chat state/start/stop calls.
- `src/lib/visemes.ts`: maps Japanese text to `closed/a/i/u/e/o` mouth steps.
- `src/lib/streamAi.ts`: reads `/api/chat/stream` server-sent events.
- `src/lib/voicevox.ts`: frontend VOICEVOX API client.
- `src/styles.css`: layout and SVG avatar animations.
- `server/`: Express backend runnable on Node.js, Bun, and built-output Deno tasks.
  - `server/aiCommon.ts`: shared AI prompt text and stream option types.
  - `server/aiProvider.ts`: provider selection by `AI_PROVIDER`.
  - `server/chatSources/`: YouTube / Twitch / Kick live comment adapters.
  - `server/index.ts`: API routes, SSE chat stream, static production serving.
  - `server/cursorAgent.ts`: Cursor SDK integration and avatar prompt.
  - `server/cursorWorker.ts`: Node-side worker process used when Cursor runs behind Bun.
  - `server/geminiAgent.ts`: Gemini integration via `@google/genai`.
  - `server/memkraft.ts`: MemKraft bridge execution, context loading, and exchange persistence.
  - `server/memkraftContainer.ts`: helper-container lifecycle and execution for MemKraft container mode.
  - `server/platformChatOrchestrator.ts`: single-active-platform live comment state, dedupe, and event fan-out.
  - `server/platformChatSource.ts`: shared abstraction and helpers for live chat adapters.
  - `server/voicevox.ts`: VOICEVOX health, `audio_query`, synthesis, and voice tuning.
- `shared/characterProfile.ts`: shared character/app copy for frontend and backend prompts.
- `shared/platformChat.ts`: normalized platform-chat mode, event, and state types.
- `scripts/memkraft.ts`: helper for preparing, checking, and stopping the MemKraft helper container.
- `scripts/voicevox.mjs`: Podman/Docker helper for starting, checking, and stopping VOICEVOX ENGINE.
- `maid_cat.svg`: original inline avatar artwork with animated IDs/classes for face, mouth, eyes, whiskers, and blush.
- `dist/`: generated build output from `devbox run build`. Do not edit by hand.
- `node_modules/` and `.devbox/`: local dependency/tooling directories. Do not edit or commit.
- `.env.example`: environment variable template. Do not commit real secrets in `.env`.

## Current implementation status

- Frontend UI is implemented as a single-page React app with a stage view, live caption area, a collapsible `ControlDock`, live chat mode controls, a voice on/off toggle, cancel support, and VOICEVOX health visibility.
- Avatar rendering is implemented with inline SVG plus CSS classes for state (`idle/thinking/speaking/error`), visemes (`closed/a/i/u/e/o`), and lightweight emotion states inferred from the generated text.
- AI text is streamed from `/api/chat/stream` over SSE. The browser accumulates streamed text, shows it live, keeps the latest browser-local conversation turns, and splits the character response into short speech segments for lower-latency synthesis/playback.
- Live platform chat ingestion is implemented for `youtube`, `twitch`, and `kick`. The frontend can start/stop a single active mode, subscribe to `/api/platform-chat/stream`, display normalized viewer events, and queue in-app auto replies.
- VOICEVOX playback is implemented end-to-end: the frontend requests `/api/voicevox/synthesis`, queues returned WAV blobs, plays them sequentially, and drives lip sync from both scheduled visemes and live Web Audio intensity.
- Backend API routes are implemented for `/api/health`, `/api/voicevox/health`, `/api/voicevox/synthesis`, `/api/chat/stream`, `/api/platform-chat/state`, `/api/platform-chat/start`, `/api/platform-chat/stop`, and `/api/platform-chat/stream`. Input validation, abort handling, SSE state/text/error events, and production static serving are in place.
- AI provider switching is implemented behind `AI_PROVIDER`. `cursor` and `gemini` are both supported; Cursor runs through a Node child worker when needed, and Gemini uses `@google/genai` streaming directly.
- MemKraft continuity memory is integrated. The server validates configuration, loads continuity notes / summary / recent shared exchanges before prompt construction, and persists successful user/character exchanges after generation.
- MemKraft container mode is implemented as the default operational path, with a local Python fallback available through `MEMKRAFT_EXECUTION_MODE=local`.
- Kick mode requires `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET`; YouTube and Twitch do not currently require extra credentials for inbound comment reading in this app.
- Dev/start/build tooling is implemented for Devbox, Bun, Node/npm, pnpm, and Deno build/start flows. Helper scripts also exist for MemKraft container lifecycle and VOICEVOX container lifecycle.
- There is no dedicated automated test suite in the repository at the moment; the documented validation path is `devbox run typecheck` and `devbox run build`.

## Requirements

- Use Devbox for the expected Node.js 22 + Bun 1.3 environment.
- Deno is supported via `deno task build` / `deno task start`, but it is not bundled by Devbox in this repository.
- A host Podman or Docker runtime is required for VOICEVOX ENGINE and the default MemKraft helper container mode.
- Python 3.9+ and `memkraft` are only required when `MEMKRAFT_EXECUTION_MODE=local`.
- `CURSOR_API_KEY` is required when `AI_PROVIDER=cursor`.
- `GOOGLE_API_KEY` is required when `AI_PROVIDER=gemini`.
- Optional environment settings include `CURSOR_MODEL`, `GEMINI_MODEL`, `PORT`, `VOICEVOX_URL`, `VOICEVOX_SPEAKER`, `VOICEVOX_CONTAINER_RUNTIME`, `VOICEVOX_CONTAINER_NAME`, `VOICEVOX_IMAGE`, and `VOICEVOX_PORT`.
- Memory settings are `MEMKRAFT_DIR`, `MEMKRAFT_EXECUTION_MODE`, `MEMKRAFT_PYTHON_BIN`, `MEMKRAFT_AGENT_ID`, `MEMKRAFT_CHANNEL_ID`, `MEMKRAFT_CONTAINER_RUNTIME`, `MEMKRAFT_CONTAINER_NAME`, `MEMKRAFT_CONTAINER_IMAGE`, and `MEMKRAFT_CONTAINER_WORKDIR`.

## Startup

1. Install dependencies:

   ```bash
   devbox run install
   ```

   If you are already inside a prepared environment, you can also use `npm install` or `pnpm install`. The shared `package.json` scripts select Bun when run from Bun, and otherwise use the Node-compatible toolchain. Deno uses `deno task build` / `deno task start` separately instead of the `package.json` dev flow.

2. Create local environment settings:

   ```bash
   cp .env.example .env
   ```

   Set `AI_PROVIDER=cursor` or `AI_PROVIDER=gemini` in `.env`. This setting is required and is not auto-detected. Use `CURSOR_API_KEY` for Cursor mode or `GOOGLE_API_KEY` for Gemini mode. `CURSOR_MODEL` selects the Cursor model, `GEMINI_MODEL` defaults to `gemini-3.1-flash-lite-preview`, `PORT` controls the backend listen port, and `MEMKRAFT_*` controls the shared continuity memory location plus either the default helper container runtime or the explicit local Python fallback. Keep real API keys out of git.

3. Start VOICEVOX ENGINE:

   ```bash
   devbox run voicevox:start
   devbox run voicevox:status
   ```

   The first run may pull a large VOICEVOX image, so wait until `voicevox:status` reports the engine as healthy before starting the app. The default engine URL is `http://127.0.0.1:50021`. If port `50021` is already in use, update both `VOICEVOX_PORT` and `VOICEVOX_URL`. `VOICEVOX_SPEAKER` selects the speaker ID.

4. Start development servers:

   ```bash
   devbox run dev
   ```

   This runs `memkraft.ts prepare` first, then `voicevox:start`, then launches the Bun-optimized Express server and Vite frontend together. By default the MemKraft prepare step builds/starts the helper container early; in explicit local mode it becomes a no-op. Vite proxies `/api/*` to the backend. The same scripts also work via `npm run dev` and `pnpm dev`. Deno support is limited to build/start and does not include a `dev` watch command.

5. Build and start production mode:

   ```bash
   devbox run build
   devbox run start
   ```

   Production mode serves `dist/client` from the backend and handles `/api/*` on the same server. `bun run start`, `npm run start`, `pnpm start`, and `deno task start` are all supported entrypoints.

## Common commands

- `devbox run typecheck`: run TypeScript checks for frontend and backend.
- `devbox run build`: run typecheck, frontend build, and backend build.
- `devbox run memkraft:start`: start the MemKraft helper container when container mode is enabled.
- `devbox run memkraft:status`: check the MemKraft helper container status.
- `devbox run memkraft:stop`: stop the MemKraft helper container.
- `devbox run voicevox:start`: start the VOICEVOX container.
- `devbox run voicevox:status`: check the VOICEVOX container and engine health.
- `devbox run voicevox:stop`: stop the VOICEVOX container.

The package scripts are runtime-aware. Bun keeps the fast path (`bun --watch`, `bunx`, direct Bun execution), while npm/pnpm use the Node-compatible path and Deno uses `deno task build` / `deno task start`.

## Editing guidelines

- Keep generated files in `dist/` untouched; change source files instead. Keep local-only files such as `.env`, `.devbox/`, and `node_modules/` out of commits.
- Preserve the avatar SVG IDs used by React/CSS, especially `head`, `left-eye`, `right-eye`, `eyebrows`, `mouth`, `mouth-shapes`, `mouth-base`, `mouth-visemes`, `viseme-closed`, `viseme-a`, `viseme-i`, `viseme-u`, `viseme-e`, `viseme-o`, `whiskers`, `blush`, and `muzzle-smile`.
- Mouth animation depends on the `Viseme` union in `src/lib/visemes.ts` and classes generated by `MaidCatAvatar`. Keep `closed/a/i/u/e/o` names synchronized across TypeScript, CSS, and SVG.
- Do not expose `CURSOR_API_KEY` to the browser. Cursor SDK usage belongs in `server/`.
- Do not expose `GOOGLE_API_KEY` to the browser. Gemini usage belongs in `server/`.
- Shared continuity memory is stored under `MEMKRAFT_DIR` (default `memory/`) and should stay out of commits.
- Surface API and VOICEVOX failures clearly; do not silently ignore errors.
- Prefer small, focused changes and validate with existing commands.
- `server/index.ts` skips `dotenv/config` under Bun because Bun already loads `.env`; keep that behavior if you refactor startup.

## Viseme notes

The lip-sync path is:

1. `App.tsx` sends response text to VOICEVOX synthesis and queues playback.
2. `audioPlayback.ts` converts the text to viseme steps with `textToVisemeSteps`.
3. During playback, Web Audio intensity opens/closes the mouth while playback progress selects the scheduled viseme.
4. `MaidCatAvatar` applies `avatar--viseme-*`.
5. `src/styles.css` shows the matching SVG group in `maid_cat.svg`.

For Japanese vowel work, update `src/lib/visemes.ts` first, then confirm CSS and SVG still cover every `Viseme` value.

## Validation

Run the existing checks after source changes:

```bash
devbox run typecheck
devbox run build
```

For avatar mouth changes, also exercise a phrase containing `あいうえお` in the UI and confirm the mouth switches through the five visible shapes while speech plays.
