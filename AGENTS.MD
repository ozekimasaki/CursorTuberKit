# AGENTS.MD

## Project overview

This project is a streaming avatar web app centered on Catlin, a maid-cat livestream assistant. The frontend displays `maid_cat.svg` as an inline SVG avatar, streams AI responses as captions, and plays VOICEVOX audio while changing the mouth shape. The backend routes chat generation through Cursor or Gemini, keeps API keys server-side, and is optimized to run on Bun.

## Structure

- `src/`: React + Vite frontend.
  - `src/App.tsx`: main chat, synthesis queue, playback state, and avatar state wiring.
  - `src/components/MaidCatAvatar.tsx`: imports `maid_cat.svg?raw` and applies avatar/viseme classes.
  - `src/components/ChatPanel.tsx`: prompt form, status display, voice toggle, and transcript.
  - `src/lib/audioPlayback.ts`: plays WAV blobs, analyzes audio volume, and emits visemes.
  - `src/lib/visemes.ts`: maps Japanese text to `closed/a/i/u/e/o` mouth steps.
  - `src/lib/streamAi.ts`: reads `/api/chat/stream` server-sent events.
  - `src/lib/voicevox.ts`: frontend VOICEVOX API client.
  - `src/styles.css`: layout and SVG avatar animations.
- `server/`: Express backend runnable on Node.js, Bun, and built-output Deno tasks.
  - `server/aiCommon.ts`: shared AI prompt text and stream option types.
  - `server/aiProvider.ts`: provider selection by `AI_PROVIDER`.
  - `server/index.ts`: API routes, SSE chat stream, static production serving.
  - `server/cursorAgent.ts`: Cursor SDK integration and avatar prompt.
  - `server/geminiAgent.ts`: Gemini integration via `@google/genai`.
  - `server/voicevox.ts`: VOICEVOX health, `audio_query`, synthesis, and voice tuning.
- `scripts/voicevox.mjs`: Podman/Docker helper for starting, checking, and stopping VOICEVOX ENGINE.
- `maid_cat.svg`: original inline avatar artwork with animated IDs/classes for face, mouth, eyes, whiskers, and blush.
- `dist/`: generated build output from `devbox run build`. Do not edit by hand.
- `node_modules/` and `.devbox/`: local dependency/tooling directories. Do not edit or commit.
- `.env.example`: environment variable template. Do not commit real secrets in `.env`.

## Requirements

- Use Devbox for the expected Node.js 22 + Bun 1.3 environment.
- Deno is supported via `deno task build` / `deno task start`, but it is not bundled by Devbox in this repository.
- A host Podman or Docker runtime is required for VOICEVOX ENGINE.
- Python 3.9+ and `memkraft` are required for the shared continuity memory.
- `CURSOR_API_KEY` is required when `AI_PROVIDER=cursor`.
- `GOOGLE_API_KEY` is required when `AI_PROVIDER=gemini`.
- Optional environment settings include `CURSOR_MODEL`, `GEMINI_MODEL`, `PORT`, `VOICEVOX_URL`, `VOICEVOX_SPEAKER`, `VOICEVOX_CONTAINER_RUNTIME`, `VOICEVOX_CONTAINER_NAME`, `VOICEVOX_IMAGE`, and `VOICEVOX_PORT`.
- Memory settings are `MEMKRAFT_DIR`, `MEMKRAFT_PYTHON_BIN`, `MEMKRAFT_AGENT_ID`, and `MEMKRAFT_CHANNEL_ID`.

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

   Set `AI_PROVIDER=cursor` or `AI_PROVIDER=gemini` in `.env`. This setting is required and is not auto-detected. Use `CURSOR_API_KEY` for Cursor mode or `GOOGLE_API_KEY` for Gemini mode. `CURSOR_MODEL` selects the Cursor model, `GEMINI_MODEL` defaults to `gemini-3.1-flash-lite-preview`, `PORT` controls the backend listen port, and `MEMKRAFT_*` controls the shared continuity memory location and Python executable. Keep real API keys out of git.

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

   This runs `voicevox:start` first, then launches the Bun-optimized Express server and Vite frontend together. Vite proxies `/api/*` to the backend. The same scripts also work via `npm run dev` and `pnpm dev`. Deno support is limited to build/start and does not include a `dev` watch command.

5. Build and start production mode:

   ```bash
   devbox run build
   devbox run start
   ```

   Production mode serves `dist/client` from the backend and handles `/api/*` on the same server. `bun run start`, `npm run start`, `pnpm start`, and `deno task start` are all supported entrypoints.

## Common commands

- `devbox run typecheck`: run TypeScript checks for frontend and backend.
- `devbox run build`: run typecheck, frontend build, and backend build.
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
