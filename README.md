# CursorTuberKit

CursorTuberKit is a browser-first streaming avatar kit for **Cursor-powered** VTuber / PNGTuber style workflows. It is no longer tied to a single character: you can use the bundled SVG example avatar, switch to MotionPNGTuber assets, and evolve it into your own streaming avatar setup. AI replies stream as captions, speech is synthesized with VOICEVOX, and autoplayed comment handling stays serialized so spoken playback never overlaps.

- **Repository:** <https://github.com/ozekimasaki/CursorTuberKit>
- **Japanese README:** [README.ja.md](./README.ja.md)
- **License:** [MIT](./LICENSE)

## Features

- Cursor-only runtime integration via `@cursor/sdk`
- SVG avatar mode with emotion + viseme-driven animation
- MotionPNGTuber mode with folder-picker asset loading
- VOICEVOX speech synthesis with playback-driven lip sync
- YouTube / Twitch / Kick live comment intake
- Autoplay queueing with serialized spoken playback
- Custom stage background replacement with image or looping video
- Bring-your-own avatar workflow built around swap-ready assets

## Who this is for

CursorTuberKit is meant to be a base app for:

- streamers building a Cursor-driven talking avatar
- creators who want to prototype with the bundled SVG avatar first
- users migrating to MotionPNGTuber-style video assets later

## Requirements

- Node.js 22+
- Bun 1.3.11+ (recommended in this repository)
- Podman or Docker
- Python 3.9+ only when using `MEMKRAFT_EXECUTION_MODE=local`
- Cursor API key

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

`.env.example` contains the full template. The minimum Cursor / VOICEVOX-related values are:

```env
AI_PROVIDER=cursor
CURSOR_API_KEY=crsr_your_api_key_here
CURSOR_MODEL=composer-2
CURSOR_CHARACTER_MODEL=composer-2
CURSOR_EMOTION_MODEL=composer-2
VOICEVOX_URL=http://127.0.0.1:50021
VOICEVOX_SPEAKER=1
PORT=8787
```

This project is **Cursor-only**. Keep `AI_PROVIDER=cursor` or omit it.

## Development

```bash
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run build
npm run start
npm run voicevox:start
npm run voicevox:status
npm run voicevox:stop
```

## Avatar Modes

### SVG mode

- Uses the bundled `maid_cat.svg` sample avatar
- Supports `idle / thinking / speaking / error`
- Uses the existing viseme path driven by playback analysis

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
- Use MotionPNGTuber assets when you want video-based rendering instead of SVG
- Tune background media, chroma key, scale, and position per avatar setup
- Adjust the surrounding prompts and orchestration to fit your own character or channel identity

## Live Chat

- Choose YouTube / Twitch / Kick in **Live Chat Mode**
- Incoming comments flow into the dock feed
- With auto reply enabled, replies are generated in the background but **spoken playback remains serialized**
- Replies are rendered inside the app only; they are not auto-posted back into platform chat

## Architecture Notes

- `src/App.tsx` orchestrates viewer comment intake, queueing, reply generation, autoplay, subtitle state, avatar switching, and automatic content
- `src/lib/audioPlayback.ts` drives both SVG visemes and MotionPNGTuber audio analysis
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

Returns recent chat run recap, platform chat state, character artifact summaries, and latest VOICEVOX health.

### `GET /api/platform-chat/state`

Returns current live chat mode state plus recently received viewer events.

## License

This repository is licensed under the [MIT License](./LICENSE).
