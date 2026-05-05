# Catlin Streaming Avatar

`maid_cat.svg` を使った配信用の Web アバターです。ブラウザ上では、月灯りのティーサロンから来たメイド猫アシスタント **キャットリン** を表示し、Cursor または Gemini から返ってくる AI 応答を字幕表示し、VOICEVOX 音声の再生に合わせて顔と口が動きます。

## Character concept

- 名前: キャットリン / Catlin
- 役割: 配信者と視聴者の空気を整えるメイド猫の配信アシスタント
- 性格: 上品で気配り上手。少し小悪魔ですが、最後はちゃんと甘やかしてくれます
- 話し方: 日本語で自然に親しみやすく、字幕で読みやすい短めの返答

## Requirements

- Devbox
- Python 3.9+ と `memkraft`
- Podman または Docker
- Cursor API key または Google AI Studio API key

Node.js 22 と Bun 1.3 は Devbox で管理できます。runtime/package manager は Node.js, Bun, pnpm, Deno に対応し、Devbox は最速な Bun 経路をそのまま使えるようにしています。Deno は Devbox の同梱対象ではないため、`deno task` を使う場合は別途 Deno 本体をインストールしてください。キャラクターの発話連続性には MemKraft を使うため、Python 3.9+ と `memkraft` の導入も必要です。
VOICEVOX ENGINE は Devbox コマンドから Podman/Docker コンテナとして起動します。コンテナランタイム自体はホスト側で利用可能になっている必要があります。

`AI_PROVIDER=cursor` の場合は Cursor integrations dashboard で API key を作成し、`CURSOR_API_KEY` として設定してください。`AI_PROVIDER=gemini` の場合は Google AI Studio の API key を `GOOGLE_API_KEY` として設定してください。いずれの API key も Node.js サーバーだけで使用され、ブラウザには送信されません。

Cursor プロバイダは `@cursor/sdk` の native dependency を使うため、Bun サーバー上でも内部的には Node.js 補助プロセスで実行します。

## Setup

```bash
devbox run install
python3 -m pip install memkraft
cp .env.example .env
```

以前に Aube で依存を入れていた場合や、`libstdc++.so.6: cannot open shared object file` が出る場合は、一度 `node_modules` を消して Bun で入れ直してください。

```bash
rm -rf node_modules
bun install
```

`.env` に利用する AI プロバイダと API key を設定します。

```bash
# choose one
AI_PROVIDER=cursor
CURSOR_API_KEY=crsr_your_api_key_here
CURSOR_MODEL=composer-2
GOOGLE_API_KEY=your_google_ai_studio_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite-preview
PORT=8787
MEMKRAFT_DIR=./memory
MEMKRAFT_PYTHON_BIN=python3
MEMKRAFT_AGENT_ID=catlin
MEMKRAFT_CHANNEL_ID=catlin-global
VOICEVOX_URL=http://127.0.0.1:50021
VOICEVOX_SPEAKER=1
VOICEVOX_CONTAINER_RUNTIME=podman
VOICEVOX_CONTAINER_NAME=maid-cat-voicevox
VOICEVOX_IMAGE=docker.io/voicevox/voicevox_engine:cpu-latest
VOICEVOX_PORT=50021
```

`AI_PROVIDER` は `cursor` または `gemini` の完全一致で明示設定します。Gemini の既定モデルは `gemini-3.1-flash-lite-preview` で、必要に応じて `GEMINI_MODEL` で変更できます。Cursor を使う場合は `AI_PROVIDER=cursor` と `CURSOR_API_KEY`、Gemini を使う場合は `AI_PROVIDER=gemini` と `GOOGLE_API_KEY` を設定してください。
MemKraft は初回チャット時に `MEMKRAFT_DIR` 配下を自動初期化し、キャットリン全体で共有する会話連続性メモリを保存します。`MEMKRAFT_PYTHON_BIN` で使用する Python 実行ファイルを明示できます。

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

- `devbox run dev` / `bun run dev` は最初に VOICEVOX ENGINE の起動確認も行います。
- Frontend: Vite dev server
- Backend: Bun では TypeScript を直接 watch 実行し、npm / pnpm では Node 互換経路で起動
- Frontend の `/api/*` は backend に proxy されます。

初回だけ VOICEVOX のコンテナイメージ取得に時間がかかるので、先に `devbox run voicevox:start` で warm-up しておくこともできます。

Deno は production-oriented な `build` / `start` のみ対応で、`deno task dev` は用意していません。

## Production build

```bash
devbox run build
devbox run start
```

Production mode では backend が `dist/client` の Web アプリを配信し、`/api/*` で `AI_PROVIDER` に応じた Cursor / Gemini 連携を処理します。

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
devbox run voicevox:start  # VOICEVOX ENGINE 起動
devbox run voicevox:status # VOICEVOX ENGINE 状態確認
devbox run voicevox:stop   # VOICEVOX ENGINE 停止
```

## How it works

- `maid_cat.svg` には目、口、頬、ひげなどのアニメーション用 ID/class を追加しています。
- React 側では SVG を raw import してインライン表示し、`idle`、`thinking`、`speaking`、`error` の状態 class で制御します。
- AI 応答は `POST /api/chat/stream` から `text/event-stream` として返ります。
- `/api/chat/stream` はブラウザの recent turns と MemKraft の共有メモリを結合し、キャットリンの発話連続性を保ったプロンプトを組み立てます。
- AI 応答が完了すると backend が VOICEVOX ENGINE に `audio_query` と `synthesis` を投げ、WAV 音声を生成します。
- backend の `/api/chat/stream` は `AI_PROVIDER` に応じて Cursor SDK または Gemini SDK を使い分けます。
- 返答後はユーザー発話とキャットリンの応答を MemKraft に書き戻し、`memory/` 配下の Markdown / `.memkraft` データとして継続コンテキストを蓄積します。
- Bun 実行時は backend が TypeScript を直接実行し、Node/Deno 互換経路では `dotenv/config` を読み込みます。
- ブラウザは WAV 音声を再生し、Web Audio の音量解析に合わせて口パクを同期します。

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
- `event: text` with streamed assistant text
- `event: error` with an error message
- `event: done` when complete

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
- `AI_PROVIDER=cursor` で `CURSOR_API_KEY` 未設定、または `AI_PROVIDER=gemini` で `GOOGLE_API_KEY` 未設定の場合、`/api/chat/stream` は設定エラーを返します。
- Python または `memkraft` が未導入の場合、`/api/chat/stream` は MemKraft 設定エラーを返します。`python3 -m pip install memkraft` を実行し、必要なら `MEMKRAFT_PYTHON_BIN` を設定してください。
- Podman が利用できない環境では、`VOICEVOX_CONTAINER_RUNTIME=docker` に変更すると Docker 互換環境で起動できます。
- Devbox/Nix で入れた rootless Podman は `newuidmap/newgidmap` の setuid/file capabilities が不足して起動できない場合があります。その場合はホスト側の Podman を設定するか Docker を使ってください。
- ブラウザの自動再生制限により、ページを開いただけでは音声が鳴りません。プロンプト送信ボタンの操作後に再生されます。
