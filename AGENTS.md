# AGENTS.md

This repository currently uses this file as the effective agent note.
On Windows, `AGENTS.md` and `AGENTS.MD` cannot coexist as separate files, so keep this file aligned with the latest repository policy.

## Repository guidance

- **Runtime is Cursor-only.** Do not add alternative runtime providers back into runtime selection, configuration docs, provider branching, or environment examples unless explicitly requested.
- **This is a general avatar app now.** Do not present the product as Catlin-only. Treat `maid_cat.svg` and `catlin_v2.svg` as sample SVG avatars, and keep docs / UX ready for swap-in custom avatars and MotionPNGTuber assets.
- **Keep playback serialized.** Background reply generation may run in parallel, but spoken audio playback must remain ordered and non-overlapping.
- **Optimize for continuity.** Prefer prefetching and background generation during current speech so `次ネタ待ち` gaps stay short.
- **Do not reintroduce manual approval flow.** The current product direction is full-auto in-app execution with block-only safety stops.
- **Preserve Windows compatibility.** Prefer the existing cross-platform Node task scripts over POSIX-only shell snippets.
- **Assume the repo is public.** Never commit secrets, and keep setup examples, docs, and placeholders safe for public exposure.

## Documentation guidance

- `README.md` is the default English-facing README.
- `README.ja.md` is the Japanese companion README.
- Include the public repository URL when touching public-facing setup docs: <https://github.com/ozekimasaki/CursorTuberKit>
- When documenting MotionPNGTuber support, keep the upstream reference visible: <https://github.com/rotejin/MotionPNGTuber>

## Project layout

- `src/` — React client. Entry point `src/main.tsx` (loaded by `index.html`); `src/App.tsx` is the orchestrator. Also `src/components/`, `src/hooks/`, `src/lib/`, `src/styles/`.
- `server/` — Bun/Express backend. Entry point `server/index.ts` (built to `dist/server/index.js`). Includes Cursor/VOICEVOX/MemKraft integration, `server/chatSources/` (youtube/twitch/kick), and `server/discovery/`.
- `shared/` — code shared between client and server (character state, sins, prompts, moderation).
- `config/` — `defaults.json`, `local.example.json`, and `load-config.mjs` (the JSON config loader with schema validation and `local.json` overrides). Non-secret settings live here, not in `.env`.
- `scripts/` — `tasks.mjs` is the cross-platform task runner behind every npm script; also `voicevox.mjs`, `memkraft.ts`, and `ensure-supported-install.mjs`.
- `tools/` — one-off SVG inspection helpers.
- `vendor/MotionPNGTuber_Player` — git submodule.
- Config: `tsconfig.json` (client/shared, `noEmit`), `tsconfig.node.json` (server/shared/scripts), `vite.config.ts`, `vitest.config.ts`.

## Setup

- Install: `npm install` (or `bun install`). Initialize the submodule with `git submodule update --init --recursive`.
- Requires Node.js 22+ (`engines`); Bun 1.3.11+ is supported via `:bun` script variants. `deno.json` and `devbox.json` provide optional alternative runners.
- Copy `.env.example` to `.env` for secrets only (`CURSOR_API_KEY`, optional Kick/MCP). Do not set the legacy env vars listed in `config/load-config.mjs` — they are rejected; use `config/local.json` instead.

## Coding conventions

- TypeScript with `strict` mode; ESM (`"type": "module"`). Match the existing style (double quotes, no semicolons in most files).
- Keep the `config/load-config.mjs` schema and `config/load-config.d.ts` in sync when adding config keys.
- Prefer the existing cross-platform `scripts/tasks.mjs` Node scripts over POSIX-only shell snippets.

## Key implementation notes

- `src/App.tsx` is the main orchestration file for viewer comment intake, queueing, reply generation, autoplay, subtitle state, avatar switching, background replacement, and automatic content.
- `src/lib/audioPlayback.ts` drives playback analysis used by both the SVG viseme path and MotionPNGTuber lip sync.
- `src/components/SvgAvatar.tsx` routes selectable SVG characters. `MaidCatAvatar.tsx` wraps `maid_cat.svg`; `CatlinV2Avatar.tsx` wraps `catlin_v2.svg`.
- `src/components/CatlinV2Avatar.tsx` uses GSAP for SVG animation, custom mouth drawing, and subtle expression modulation from runtime character-state signals.
- `shared/sinsExpression.ts` maps seven-deadly-sins character state into bounded visual modifiers. Keep these effects subtle and avoid exposing raw sin labels in the UI.
- `src/components/MotionPngAvatar.tsx` and `src/lib/motionPngEngine.ts` are the MotionPNGTuber integration points.
- Stage background replacement is shared across avatar modes; avoid changes that make it MotionPNGTuber-only.
- Viewer reply generation may use limited parallelism in the background, but prepared reply playback must stay ordered and non-overlapping.
- Comment compaction is intentionally relaxed compared with earlier versions: keep short comments more often before batch selection.
- `tools/inspect-catlin.mjs`, `tools/classify-catlin.mjs`, and `tools/annotate-catlin.mjs` are one-off SVG inspection helpers. Keep generated `tools/out/` artifacts out of git.

## Validation

- Run `npm run typecheck` (runs `tsc --noEmit` against `tsconfig.json` and `tsconfig.node.json`).
- Run `npm run test` (Vitest over `*.test.ts` in `src/`, `shared/`, and `server/`).
- Run `npm run build` before finishing larger changes.
- There is no lint or formatter script configured; do not invent one. Rely on `typecheck` and `test`.
