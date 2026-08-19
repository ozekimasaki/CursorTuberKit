# CursorTuberKit

CursorTuberKit is a browser-first streaming avatar kit for **Cursor-powered** VTuber / PNGTuber style workflows. It is no longer tied to a single character: you can use the bundled SVG example avatar, switch to MotionPNGTuber assets, and evolve it into your own streaming avatar setup. AI replies stream as captions, speech is synthesized with VOICEVOX, and autoplayed comment handling stays serialized so spoken playback never overlaps.

- **Repository:** <https://github.com/ozekimasaki/CursorTuberKit>
- **Japanese README:** [README.ja.md](./README.ja.md)
- **License:** [MIT](./LICENSE)

## Features

- Cursor-only runtime integration via `@cursor/sdk`
- SVG avatar mode with selectable `maid_cat` / `catlin_v2` characters, emotion, viseme, and state-driven animation
- MotionPNGTuber mode with folder-picker asset loading
- VOICEVOX speech synthesis with playback-driven lip sync
- YouTube / Twitch / Kick live comment intake
- Autoplay queueing with serialized spoken playback
- Custom stage background replacement with image or looping video
- Bring-your-own avatar workflow built around swap-ready assets and inspection tooling

## Who this is for

CursorTuberKit is meant to be a base app for:

- streamers building a Cursor-driven talking avatar
- creators who want to prototype with the bundled SVG avatar first
- users migrating to MotionPNGTuber-style video assets later

## Requirements

- Node.js 22+ (`package.json` `engines` requires `>=22`; Vite needs 20.19+ / 22.12+)
- Bun 1.3.11+ (recommended in this repository; used by the `*:bun` scripts)
- Podman or Docker (for the VOICEVOX and container-mode MemKraft images)
- Python 3.9+ only when using `memkraft.executionMode: "local"` in `config/local.json`
- Cursor API key

Deno and Devbox are supported as optional alternative runners: see `deno.json` tasks (`typecheck`, `build`, `start`) and `devbox.json` (`nodejs@22`, `bun@1.3.11`, `python@3.12`).

## Setup

```bash
git clone https://github.com/ozekimasaki/CursorTuberKit.git
cd CursorTuberKit
git submodule update --init --recursive
npm install
```

On Windows PowerShell, create the env file with:

```powershell
Copy-Item .env.example .env
```

`vendor/MotionPNGTuber_Player` is tracked as a submodule so the local MotionPNGTuber wrapper can be audited against the upstream implementation.

## Environment

`.env` is only for secrets and process-level values. Copy `.env.example` and set at least:

```env
CURSOR_API_KEY=crsr_your_api_key_here
```

`.env.example` also lists optional secrets: `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` for Kick live chat, and `MCP_DISCOVERY_TOKEN` for MCP discovery endpoints. Non-secret settings that used to be environment variables (ports, model names, VOICEVOX/MemKraft options) now live in JSON and are rejected if set as env vars.

Normal non-secret settings live in JSON:

- `config/defaults.json` — committed defaults.
- `config/local.json` — local overrides; copy from `config/local.example.json` and keep it uncommitted.

Use `config/local.json` for ports, Cursor model names, VOICEVOX URL/container settings, MemKraft paths/runtime, automation policy, and MCP discovery URLs. This project is **Cursor-only**; there is no provider switch.

## Development

```bash
npm run dev
```

`npm run dev` starts the backend server, waits for `/api/health`, then starts the Vite client. Default ports are `5173` (client) and `8787` (server); the Vite dev server proxies `/api` to the backend. Both are configurable in `config/defaults.json` / `config/local.json`. You can also run each side alone with `npm run dev:client` / `npm run dev:server`.

Build, typecheck, and run:

```bash
npm run typecheck   # tsc --noEmit for tsconfig.json and tsconfig.node.json
npm run build       # typecheck + Vite client build + server tsc + copy server *.py
npm run start       # run the built server (dist/server/index.js) in production
```

Test:

```bash
npm run test        # vitest run (src, shared, server *.test.ts)
npm run test:watch  # vitest in watch mode
```

VOICEVOX engine container:

```bash
npm run voicevox:start
npm run voicevox:status
npm run voicevox:stop
```

MemKraft long-term memory container:

```bash
npm run memkraft:start
npm run memkraft:status
npm run memkraft:stop
```

Most build/dev/start/typecheck scripts have a `:bun` variant (e.g. `npm run build:bun`) that runs the same task through Bun; the plain scripts also switch to Bun automatically when invoked via `bun run`.

## Avatar Modes

### SVG mode

- Uses the bundled `maid_cat.svg` sample avatar by default
- Can switch to `catlin_v2.svg` from **Settings > Avatar > SVG character**
- Supports `idle / thinking / speaking / error`
- Uses the existing viseme path driven by playback analysis
- `catlin_v2` uses `gsap` animation and seven-deadly-sins expression modifiers for subtle blink, sway, blush, eye, pupil, smile, and chin changes

### MotionPNGTuber mode

- Select **Settings > Avatar > MotionPNGTuber**
- Upstream project: <https://github.com/rotejin/MotionPNGTuber>
- Load a local asset folder with the built-in folder picker
- Required files:
  - `*_mouthless_h264.mp4`
  - `mouth_track.json`
  - `mouth/closed.png`
  - `mouth/open.png`
- Optional files:
  - `mouth/half.png`
  - `mouth/e.png`
  - `mouth/u.png`

Available controls:

- sensitivity
- HQ audio
- chroma key color / threshold / feather
- avatar position X / Y
- avatar scale

## Stage Background Replacement

Use **Settings > Background** to replace the stage background with:

- a static image, or
- a muted looping video

The custom background renders behind both avatar modes. When SVG mode is active, its baked-in decorative hologram layers are automatically hidden so the replacement background reads cleanly.

## Customizing the app

- Swap the default SVG asset path if you want a different inline avatar baseline
- Add new SVG characters through `src/lib/avatarConfig.ts`, `src/components/SvgAvatar.tsx`, and the Settings SVG character selector
- Use `tools/inspect-catlin.mjs`, `tools/classify-catlin.mjs`, and `tools/annotate-catlin.mjs` as one-off helpers for inspecting and annotating complex SVG path groups; generated `tools/out/` images are local artifacts
- Use MotionPNGTuber assets when you want video-based rendering instead of SVG
- Tune background media, chroma key, scale, and position per avatar setup
- Adjust the surrounding prompts and orchestration to fit your own character or channel identity
- Use `.cursor/rules/cursortuber-character.mdc` for tracked character seed rules, including the short and full persona prompts. The app explicitly loads this file into runtime avatar prompts; `alwaysApply: false` keeps it from being broadly injected into coding-agent work.
- Use the in-app **Settings** panel to change the character name, inspect AI-managed prompt previews, trigger persona auto-rewrite, save persona presets, and tune long-term memory behavior.
- Persona auto-rewrite also updates `.cursor/rules/cursortuber-character.mdc`, so review git diffs before committing. Never commit secrets or credentials to this tracked rule file.

## Live Chat

- Choose YouTube / Twitch / Kick in **Live Chat Mode**
- Incoming comments flow into the dock feed
- Duplicate comment playback from reconnect/replay paths is suppressed before auto-reply queueing
- With auto reply enabled, replies are generated in the background but **spoken playback remains serialized**
- Replies are rendered inside the app only; they are not auto-posted back into platform chat

## Project Structure

```
src/            React client (App.tsx orchestrator, components, hooks, lib, styles)
server/         Bun/Express backend: API (index.ts), Cursor + VOICEVOX + MemKraft
                integration, chat sources (youtube/twitch/kick), discovery
shared/         Types/logic shared by client and server (character state, sins, prompts)
config/         defaults.json + local.example.json and the JSON config loader
scripts/        Node task runner (tasks.mjs) plus voicevox/memkraft/install helpers
tools/          One-off SVG inspection helpers (inspect/classify/annotate-catlin.mjs)
vendor/         MotionPNGTuber_Player submodule
index.html      Vite entry HTML (loads src/main.tsx)
```

- Entry points: client `src/main.tsx` (via `index.html`); backend `server/index.ts` (built to `dist/server/index.js`).
- Sample avatars: `maid_cat.svg` and `catlin_v2.svg` at the repo root.
- Vitest picks up `*.test.ts` under `src/`, `shared/`, and `server/`.

## Architecture Notes

- `src/App.tsx` orchestrates viewer comment intake, queueing, reply generation, autoplay, subtitle state, avatar switching, and automatic content
- `src/lib/audioPlayback.ts` drives both SVG visemes and MotionPNGTuber audio analysis
- `src/components/SvgAvatar.tsx` selects between `MaidCatAvatar` and `CatlinV2Avatar`
- `src/components/CatlinV2Avatar.tsx` wraps `catlin_v2.svg`, GSAP animation, custom mouth drawing, and sin-expression visual modulation
- `shared/sinsExpression.ts` converts runtime seven-deadly-sins values into bounded visual modifiers for SVG avatars
- `src/components/MotionPngAvatar.tsx` and `src/lib/motionPngEngine.ts` wrap the MotionPNGTuber runtime
- `server/index.ts` exposes the Cursor + VOICEVOX-backed API endpoints

## API

### `GET /api/health`

Basic server health check.

### `POST /api/chat/stream`

Streams:

- `state`
- `text`
- `metadata`
- `character-artifacts`
- `emotion`
- `task` / `action` / `metadata`
- `error`
- `done`

### `GET /api/runtime/status`

Returns recent chat run recap, platform chat state, character rule status, character artifact summaries, and latest VOICEVOX health.

### `GET /api/platform-chat/state`

Returns current live chat mode state plus recently received viewer events.

## License

This repository is licensed under the [MIT License](./LICENSE).
