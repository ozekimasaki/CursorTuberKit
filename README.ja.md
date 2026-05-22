# CursorTuberKit

日本語ドキュメントです。英語版のメイン README は [README.md](./README.md) を参照してください。

- **Repository:** <https://github.com/ozekimasaki/CursorTuberKit>
- **English README:** [README.md](./README.md)
- **License:** [MIT](./LICENSE)

## 概要

CursorTuberKit は、**Cursor ベース**の配信アバター運用向けキットです。もうキャットリン専用ではなく、同梱の SVG サンプルアバターをそのまま使うことも、MotionPNGTuber アセットへ切り替えて自分向けの配信アバターへ発展させることもできます。AI 返答の字幕表示、VOICEVOX 読み上げ、live chat 連携、背景差し替えまでブラウザ中心で扱えます。

## 主な機能

- Cursor 専用 runtime
- SVG / MotionPNGTuber の切り替え
- SVG キャラクターとして `maid_cat` / `catlin_v2` を選択
- VOICEVOX 音声合成
- 発話に同期する口パク
- YouTube / Twitch / Kick のコメント連携
- 直列再生を崩さない自動返答キュー
- 画像 / 動画の背景差し替え
- 差し替え前提のアバター運用
- 複雑な SVG パスを調査・注釈する補助ツール

## 想定ユースケース

- Cursor 駆動の会話型アバター配信を作りたい
- まずは同梱 SVG で試し、後から独自アバターへ置き換えたい
- MotionPNGTuber ベースの動画アセットへ発展させたい

## セットアップ

```powershell
git clone https://github.com/ozekimasaki/CursorTuberKit.git
cd CursorTuberKit
git submodule update --init --recursive
npm install
Copy-Item .env.example .env
```

`.env.example` を元に Cursor API key などを設定してください。`AI_PROVIDER` は `cursor` のままで使います。

## 開発コマンド

```powershell
npm run dev
npm run typecheck
npm run build
npm run start
```

VOICEVOX:

```powershell
npm run voicevox:start
npm run voicevox:status
npm run voicevox:stop
```

## SVG アバター

- 標準では同梱の `maid_cat.svg` サンプルを使います。
- `Settings > Avatar > SVGキャラクター` から `キャットリン v2` (`catlin_v2.svg`) へ切り替えられます。
- `catlin_v2` は `gsap` によるアイドル / 口パク / 表情アニメーションと、七つの大罪スコア由来の瞬き・揺れ・赤面・目線・瞳・口元・顎上げの微調整を使います。
- 新しい SVG キャラクターを増やす場合は `src/lib/avatarConfig.ts`、`src/components/SvgAvatar.tsx`、Settings の SVG キャラクター選択に追加してください。
- `tools/inspect-catlin.mjs`、`tools/classify-catlin.mjs`、`tools/annotate-catlin.mjs` は `catlin_v2.svg` のパス解析・注釈用の補助ツールです。生成される `tools/out/` はローカル確認用で gitignore されています。

## MotionPNGTuber

- `Settings > Avatar > MotionPNGTuber` で切り替え
- upstream project: <https://github.com/rotejin/MotionPNGTuber>
- folder picker でローカルのアセットフォルダを選択
- 必須:
  - `*_mouthless_h264.mp4`
  - `mouth_track.json`
  - `mouth/closed.png`
  - `mouth/open.png`
- 任意:
  - `mouth/half.png`
  - `mouth/e.png`
  - `mouth/u.png`

調整可能:

- 感度
- HQ Audio
- クロマキー
- 位置 X / Y
- 拡大率

## 背景差し替え

`Settings > Background` から画像または動画を選ぶと、stage 背景を差し替えられます。動画はミュート・ループ再生です。SVG モードでは、カスタム背景を使うと埋め込み装飾レイヤーを自動で隠します。

## カスタマイズ

- デフォルトの SVG アセットを差し替えて独自アバターにする
- SVG キャラクター選択に新しいアバターを追加する
- MotionPNGTuber アセットで動画ベース表示へ移行する
- 背景、クロマキー、位置、拡大率をアバターに合わせて調整する
- `.cursor/rules/cursortuber-character.mdc` に、短い人格プロンプト・詳細人格プロンプト・補助人格ルールをまとめて置く。アプリはこの専用ファイルを明示的に runtime prompt へ合成します。`alwaysApply: false` のため、通常の coding agent 作業へ広く注入しない前提です。
- **Settings** からキャラクター名、AI 管理 prompt の preview、persona auto-rewrite、人格プリセット、長期記憶設定を扱う。
- persona auto-rewrite は `.cursor/rules/cursortuber-character.mdc` も更新します。git diff に出るため、コミット前に確認してください。秘密情報や認証情報はこの tracked rule に入れないでください。

## ライセンス

このリポジトリは [MIT License](./LICENSE) です。
