# Catlin Streaming Avatar

`maid_cat.svg` または MotionPNGTuber アセットを使った配信用の Web アバターです。ブラウザ上では、月灯りのティーサロンから来た、みずから配信を行うメイド猫の AI キャラクター **キャットリン** を表示し、Cursor から返ってくる AI 応答を字幕表示し、VOICEVOX 音声の再生に合わせて顔と口が動きます。

## Character concept

- 名前: キャットリン / Catlin
- 役割: みずから配信を行い、視聴者に語りかけるメイド猫の AI キャラクター
- 性格: 上品で気配り上手。少し小悪魔ですが、最後はちゃんと甘やかしてくれます
- 話し方: 日本語で自然に親しみやすく、字幕で読みやすい短めの返答

## Requirements

- Devbox
- Podman または Docker
- Python 3.9+ と `memkraft`（`MEMKRAFT_EXECUTION_MODE=local` を使う場合のみ）
- Cursor API key

Node.js 22 と Bun 1.3 は Devbox で管理できます。runtime/package manager は Node.js, Bun, pnpm, Deno に対応し、Devbox は最速な Bun 経路をそのまま使えるようにしています。Deno は Devbox の同梱対象ではないため、`deno task` を使う場合は別途 Deno 本体をインストールしてください。キャラクターの発話連続性には MemKraft を使い、**デフォルトでは Podman/Docker 上の helper container** を起動します。ローカル Python + `memkraft` は `MEMKRAFT_EXECUTION_MODE=local` を明示した場合の代替経路です。
VOICEVOX ENGINE は Devbox コマンドから Podman/Docker コンテナとして起動します。コンテナランタイム自体はホスト側で利用可能になっている必要があります。

Cursor integrations dashboard で API key を作成し、`CURSOR_API_KEY` として設定してください。API key は Node.js サーバーだけで使用され、ブラウザには送信されません。

Cursor プロバイダは `@cursor/sdk` の native dependency を使うため、Bun サーバー上でも内部的には Node.js 補助プロセスで実行します。あわせて project-level の `.cursor/hooks.json` stop hook で返答完了を補助検知し、その後に emotion classifier subagent で最終アバター感情を確定します。

## Setup

```bash
git submodule update --init --recursive
devbox run install
cp .env.example .env
```

PowerShell では `.env` 作成に `Copy-Item .env.example .env` を使ってください。

`vendor/MotionPNGTuber_Player` は upstream 実装確認用の submodule です。clone 後に `git submodule update --init --recursive` を忘れると MotionPNGTuber 対応の実装参照元が欠けます。

MemKraft はデフォルトでコンテナ起動なので、このまま `devbox run dev` や `devbox run memkraft:start` で helper image を自動ビルドして起動できます。ローカル Python を使いたい場合だけ、追加で `python3 -m pip install memkraft` を実行して `.env` に `MEMKRAFT_EXECUTION_MODE=local` を入れてください。

以前に Aube で依存を入れていた場合や、`libstdc++.so.6: cannot open shared object file` が出る場合は、一度 `node_modules` を消して Bun で入れ直してください。

```bash
rm -rf node_modules
bun install
```

PowerShell では `Remove-Item -Recurse -Force node_modules` を使えます。

`.env` には Cursor 用の設定を入れます。

```bash
AI_PROVIDER=cursor
CURSOR_API_KEY=crsr_your_api_key_here
CURSOR_MODEL=composer-2
CURSOR_CHARACTER_MODEL=composer-2
CURSOR_EMOTION_MODEL=composer-2
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
PORT=8787
MEMKRAFT_DIR=./memory
MEMKRAFT_EXECUTION_MODE=container
MEMKRAFT_PYTHON_BIN=python3
MEMKRAFT_AGENT_ID=catlin
MEMKRAFT_CHANNEL_ID=catlin-global
MEMKRAFT_CONTAINER_RUNTIME=podman
MEMKRAFT_CONTAINER_NAME=maid-cat-memkraft
MEMKRAFT_CONTAINER_IMAGE=maid-cat-memkraft:latest
MEMKRAFT_CONTAINER_WORKDIR=/workspace
VOICEVOX_URL=http://127.0.0.1:50021
VOICEVOX_SPEAKER=1
VOICEVOX_CONTAINER_RUNTIME=podman
VOICEVOX_CONTAINER_NAME=maid-cat-voicevox
VOICEVOX_IMAGE=docker.io/voicevox/voicevox_engine:cpu-latest
VOICEVOX_PORT=50021
```

このプロジェクトは現在 **Cursor 専用** です。`AI_PROVIDER` は `cursor` を指定するか省略してください。`CURSOR_API_KEY` は必須です。Cursor の Character Director / Lore Keeper / Relationship Manager / Content Writer 系サブエージェントは既定で **`CURSOR_CHARACTER_MODEL=composer-2`**、final emotion 用サブエージェントは既定で **`CURSOR_EMOTION_MODEL=composer-2`** を使います。
MemKraft は初回チャット時に `MEMKRAFT_DIR` 配下を自動初期化し、キャットリン全体で共有する会話連続性メモリを保存します。**既定値は `MEMKRAFT_EXECUTION_MODE=container`** で、`MEMKRAFT_CONTAINER_RUNTIME` / `MEMKRAFT_CONTAINER_NAME` / `MEMKRAFT_CONTAINER_IMAGE` を使って helper container を切り替えられます。ローカル実行に戻したい場合だけ `MEMKRAFT_EXECUTION_MODE=local` と `MEMKRAFT_PYTHON_BIN` を使います。
配信コメント連携は YouTube / Twitch / Kick の 3 モードに対応しています。YouTube と Twitch は追加キーなしで接続でき、Kick だけは `KICK_CLIENT_ID` と `KICK_CLIENT_SECRET` が必要です。

## MemKraft container mode

MemKraft はデフォルトでこのモードです。Podman を使う基本設定は以下です。

```bash
MEMKRAFT_CONTAINER_RUNTIME=podman
```

このモードでは `server/Containerfile.memkraft` から `memkraft` 入りの helper image をビルドし、会話処理時は `podman exec` / `docker exec` 経由で `memkraft_bridge.py` を実行します。`MEMKRAFT_DIR` はそのままホスト側の `memory/` を bind mount するので、既存データも継続利用できます。

warm-up や状態確認だけ先に行いたい場合:

```bash
devbox run memkraft:start
devbox run memkraft:status
devbox run memkraft:stop
```

## VOICEVOX

VOICEVOX ENGINE を Podman で起動します。初回は `docker.io/voicevox/voicevox_engine:cpu-latest` のダウンロードに時間がかかります。

```bash
devbox run voicevox:start
devbox run voicevox:status
```

停止する場合:

```bash
devbox run voicevox:stop
```

デフォルトでは `http://127.0.0.1:50021` に VOICEVOX ENGINE を公開します。話者は `.env` の `VOICEVOX_SPEAKER` で変更できます。

## Development

```bash
devbox run dev
```

- `devbox run dev` / `bun run dev` は最初に MemKraft helper container の warm-up（container mode 時のみ）と VOICEVOX ENGINE の起動確認を行います。
- Frontend: Vite dev server
- Backend: Bun では TypeScript を直接 watch 実行し、npm / pnpm では Node 互換経路で起動
- Frontend の `/api/*` は backend に proxy されます。

初回だけ VOICEVOX のコンテナイメージ取得に時間がかかるので、先に `devbox run voicevox:start` で warm-up しておくこともできます。

Deno は production-oriented な `build` / `start` のみ対応で、`deno task dev` は用意していません。

## MotionPNGTuber

- `Settings > Avatar` から `MotionPNGTuber` を選ぶと、folder picker でアセットフォルダを読み込めます。
- 読み込み対象は `*_mouthless_h264.mp4`、`mouth_track.json`、`mouth/closed.png`、`mouth/open.png` が必須です。`half.png`、`e.png`、`u.png` は任意です。
- MotionPNGTuber モードでは `感度`、`HQ Audio`、`クロマキー`、`位置`、`拡大率` を dock から調整できます。
- ベース動画がグリーンバック等の単色背景なら、`クロマキー` を有効にしてキー色・しきい値・フェザーを合わせてください。
- 初回実装では SVG と MotionPNGTuber を切り替えられます。MotionPNGTuber のアセット選択はブラウザの folder picker 由来なので、ページ再読み込み後は再選択が必要です。

## Live chat modes

- `ControlDock` の `Live Chat Mode` から `YouTube / Twitch / Kick` を選び、接続先を入力して接続します。
- `ControlDock` では `受信 / 手動 / 字幕 / 設定` を分離し、`配信画面` ボタンで受信コメントだけを**画面上へ浮かせて表示**するモードへ切り替えられます。
- YouTube は配信 URL または `video ID`、Twitch / Kick はチャンネル名を入力します。
- 受信した視聴者コメントは dock 内の feed に表示され、`自動返答` をオンにすると Catlin が既存の AI + VOICEVOX 経路で順番に返答します。発話中でも次の返答文はバックグラウンドで生成され、完成分から reply queue に積まれます。
- 連続コメント時は、課金・質問・話題を広げやすいコメントを優先し、短い相槌やリアクションだけのコメントは自動返答キューへ入れずに見送ります。
- 同じ `自動返答` が有効な間は、ネタ面の `opening / mini-corner / recap / teaser` も自動投入されます。live chat 未接続でも Catlin 自身が進行を継続し、コメントが来たらそちらを優先します。
- `CHARACTER CONTENT` は stream screen には出さず、dock 内の監視 / フォールバック導線としてだけ表示します。
- 返答は **アプリ内での字幕表示と音声再生のみ** です。各プラットフォームのチャットへ自動投稿はまだ行いません。
- monetized event は通常コメントより優先して reply queue に入ります。

## Production build

```bash
devbox run build
devbox run start
```

Production mode では backend が `dist/client` の Web アプリを配信し、`/api/*` で Cursor 連携を処理します。

Bun を直接使う場合:

```bash
bun run dev
bun run build
bun run start
```

Node.js / npm:

```bash
npm install
npm run dev
npm run build
npm run start
```

pnpm:

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
```

Deno:

```bash
deno task build
deno task start
```

`deno task start` は `dist/server/index.js` を実行します。先に `deno task build` を実行してください。Deno は別途インストールが必要で、開発用 watch サーバーではなく production build の起動経路として扱っています。

## Devbox commands

```bash
devbox shell        # Node.js 22 が有効な shell に入る
devbox run install # bun install
devbox run dev     # 開発サーバー起動
devbox run build   # typecheck + frontend/backend build
devbox run start   # production server 起動
devbox run memkraft:start  # MemKraft helper container 起動
devbox run memkraft:status # MemKraft helper container 状態確認
devbox run memkraft:stop   # MemKraft helper container 停止
devbox run voicevox:start  # VOICEVOX ENGINE 起動
devbox run voicevox:status # VOICEVOX ENGINE 状態確認
devbox run voicevox:stop   # VOICEVOX ENGINE 停止
```

## How it works

- `maid_cat.svg` には目、口、頬、ひげなどのアニメーション用 ID/class を追加しています。
- React 側では `SVG` と `MotionPNGTuber` を切り替えられます。SVG は raw import をインライン表示し、MotionPNGTuber は folder picker で選んだアセットを video/canvas 合成で再生します。
- MotionPNGTuber の口パクは `MotionPNGTuber_Player` upstream 実装を参照してローカル wrapper に移した lipsync engine を使い、VOICEVOX 再生中の音声解析値 `rms / low / high` を直接流しています。
- AI 応答は `POST /api/chat/stream` から `text/event-stream` として返ります。
- `/api/runtime/status` は最近の chat run 要約、platform chat 状態、character memory artifact 状態、直近の VOICEVOX health を返し、同じ内容を `memory/runtime/status.json` にも書き出します。
- live chat mode は backend 側で YouTube / Twitch / Kick の comment source を 1 つだけ有効化し、`/api/platform-chat/stream` で正規化済みイベントを frontend に流します。
- `/api/chat/stream` はブラウザの recent turns と MemKraft の共有メモリを結合し、キャットリンの発話連続性を保ったプロンプトを組み立てます。
- 同じプロンプト組み立てでは、七つの大罪パラメータ（0-100）を **pre-reply / relationship / segment / memory-write / lore** の内部 hook として適用し、`lust` は配信用の charm / mischievous allure / indulgent pampering として安全に解釈します。
- Cursor プロバイダでは返答本文の完了後に Character Director / Lore Keeper / Relationship Manager / Content Writer の各 subagent で補助データを整理し、`character-artifacts` SSE と `memory/runtime/character-agents.ndjson` に残します。
- 補助データと返答本文から lore cards / relationships / stream diary / teaser を永続化し、`memory/entities/lore-cards.json`、`memory/entities/relationships.json`、`memory/live-notes/stream-diary.md`、`memory/live-notes/next-stream-teaser.md`、`memory/runtime/character-artifacts*.json|ndjson` に保存します。
- その後で project stop hook を観測し、emotion classifier subagent で `neutral / joy / anger / sadness / delight` の最終感情を決めて `emotion` SSE として返します。
- chat stream が完了すると server は軽量 recap を `metadata` SSE と `memory/runtime/chat-runs.ndjson` に残すので、後続の運用 UI やレビュー導線から再利用できます。
- AI 応答が完了すると backend が VOICEVOX ENGINE に `audio_query` と `synthesis` を投げ、WAV 音声を生成します。
- backend の `/api/chat/stream` は Cursor SDK を使います。
- 返答後は視聴者コメントとキャットリンの応答を MemKraft に書き戻し、`memory/` 配下の Markdown / `.memkraft` データとして継続コンテキストを蓄積します。
- Bun 実行時は backend が TypeScript を直接実行し、Node/Deno 互換経路では `dotenv/config` を読み込みます。
- ブラウザは WAV 音声を再生し、Web Audio の音量解析に合わせて SVG viseme と MotionPNGTuber lipsync を同期します。

## API

### `GET /api/health`

サーバーの簡易ヘルスチェックです。

### `POST /api/chat/stream`

Request:

```json
{
  "prompt": "今日の配信の挨拶をお願いします"
}
```

Response:

- `event: state` with `thinking`, `speaking`, or `done`
- `event: text` with streamed character text
- `event: metadata` with provider/runtime info, plus safe `characterState.signature` / hook metadata for orchestration
- `event: character-artifacts` with Cursor subagent-derived director / lore / relationship / segment-planning payloads
- `event: emotion` with the final avatar emotion payload when Cursor finalization metadata is available
- `event: task` / `action` / `metadata` with lightweight runtime progress, character artifact persistence, or post-run recap
- `event: error` with an error message
- `event: done` when complete

### `GET /api/runtime/status`

最近の chat run recap、platform chat 状態、character memory artifact 集計、直近の VOICEVOX health を返します。artifact path には lore cards / relationships / stream diary / teaser の保存先も含まれます。

### `GET /api/platform-chat/state`

現在の live chat mode 状態と最近受信した視聴者イベント一覧を返します。

### `POST /api/platform-chat/start`

Request:

```json
{
  "mode": "youtube",
  "target": "https://www.youtube.com/watch?v=..."
}
```

- `mode`: `youtube` / `twitch` / `kick`
- `target`: YouTube は配信 URL または video ID、Twitch / Kick はチャンネル名

### `POST /api/platform-chat/stop`

現在の live chat 接続を停止します。

### `GET /api/platform-chat/stream`

live chat mode の server-sent events です。

- `event: state` with current connection state
- `event: viewer-event` with normalized viewer comment / monetized event

### `GET /api/voicevox/health`

VOICEVOX ENGINE の到達性、設定中の speaker、engine version を返します。

### `POST /api/voicevox/synthesis`

Request:

```json
{
  "text": "こんにちは、ご主人様。"
}
```

Response:

- `audio/wav`

## Troubleshooting

- `VOICEVOX ENGINE is not reachable` と表示される場合は `devbox run voicevox:start` を実行してください。
- `50021` が使用中の場合は `.env` の `VOICEVOX_PORT` と `VOICEVOX_URL` を変更してください。
- `CURSOR_API_KEY` が未設定の場合、`/api/chat/stream` は設定エラーを返します。
- Kick mode で `KICK_CLIENT_ID` または `KICK_CLIENT_SECRET` が未設定の場合、`/api/platform-chat/start` は設定エラーを返します。
- デフォルトの `MEMKRAFT_EXECUTION_MODE=container` で Podman/Docker が使える場合は、`devbox run memkraft:start` を実行すると helper image を自動ビルドして起動できます。
- `MEMKRAFT_EXECUTION_MODE=local` で Python または `memkraft` が未導入の場合、`/api/chat/stream` は MemKraft 設定エラーを返します。`python3 -m pip install memkraft` を実行し、必要なら `MEMKRAFT_PYTHON_BIN` を設定してください。
- Podman が利用できない環境では、`VOICEVOX_CONTAINER_RUNTIME=docker` に変更すると Docker 互換環境で起動できます。
- Devbox/Nix で入れた rootless Podman は `newuidmap/newgidmap` の setuid/file capabilities が不足して起動できない場合があります。その場合はホスト側の Podman を設定するか Docker を使ってください。
- ブラウザの自動再生制限により、ページを開いただけでは音声が鳴りません。プロンプト送信ボタンの操作後に再生されます。
