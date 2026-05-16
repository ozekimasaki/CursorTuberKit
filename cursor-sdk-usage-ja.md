# Cursor SDK 利用箇所一覧

作成日: 2026-05-17

参照元:
- 公式ドキュメント: <https://cursor.com/ja/docs/sdk/typescript>
- Context7 取得結果:
  - `Agent.create` + `local`
  - `Agent.resume`
  - `agent.send(...)`
  - `run.stream()`
  - `run.wait()`
  - `run.cancel()`
  - `run.onDidChangeStatus()`
  - `onStep`

## 結論

このリポジトリでは、Cursor SDK の TypeScript API を主に **3つの層** で使っています。

1. **メイン会話エージェントの生成・再開・実行**
2. **サブエージェント群によるキャラクター補助データ生成**
3. **Run イベントのストリーミング監視とテレメトリ収集**

あわせて、SDK そのものではありませんが、**Cursor の stop hook** を併用して会話終了タイミングを観測し、内部のキャラクター感情値（7つの大罪パラメータ）の自動変動に使っています。

---

## 利用機能ごとの対応表

| SDK 機能 | 現在の実装箇所 | 使い方 |
| --- | --- | --- |
| `@cursor/sdk` 依存導入 | `package.json:33` | SDK 自体をランタイム依存として導入しています。 |
| `Agent.create(...)` | `server/cursorWorker.ts:123-128` | メイン会話用の Cursor エージェントを生成しています。`apiKey`、`model`、`local.cwd`、`name` を指定。 |
| `Agent.resume(...)` | `server/cursorWorker.ts:397-425` | 既存 `agentId` を使って会話エージェントを再開し、会話コンテキストを引き継いでいます。 |
| `agent.send(...)` | `server/cursorWorker.ts:427-447` | プロンプトを送信して `Run` を開始しています。通常送信に失敗した場合は `local.force: true` で再試行。 |
| `run.cancel()` | `server/cursorWorker.ts:93-103`, `server/cursorWorker.ts:105-112` | SIGINT / SIGTERM 受信時に進行中の Run を安全に中断しています。 |
| `run.stream()` | `server/cursorSdkRun.ts:28-65` | Run のイベントを逐次読み取り、本文・ツール呼び出し・状態変化を収集しています。 |
| `run.wait()` | `server/cursorSdkRun.ts:67-79` | Run 完了を待ち、最終 status / usage を確定しています。 |
| `run.onDidChangeStatus(...)` | `server/cursorSdkRun.ts:21-25` | 状態遷移履歴を取るためにステータス変更を購読しています。 |
| `Run` 型の利用 | `server/cursorWorker.ts:4`, `server/characterAgents.ts:1`, `server/cursorSdkRun.ts:1` | 進行中 Run の型安全な受け渡しと監視に使っています。 |
| `SDKAgent` 型の利用 | `server/cursorWorker.ts:4`, `server/cursorWorker.ts:427-447` | メインエージェントの再開・送信処理を型安全に扱っています。 |
| `ConversationStep` 型 + `onStep` | `server/characterAgents.ts:1`, `server/characterAgents.ts:136-141`, `server/characterAgents.ts:213-223` | サブエージェント実行時の step を見て、どの subagent が実際に使われたかを記録しています。 |
| `Agent.create({ agents: ... })` | `server/characterAgents.ts:75-129` | Character Director / Lore Keeper / Relationship Manager / Content Writer の4サブエージェントを定義しています。 |
| サブエージェント付き `agent.send(..., { onStep })` | `server/characterAgents.ts:135-141` | 4サブエージェントを使った分析 Run を開始し、`onStep` で task step を観測しています。 |
| SDK のストリーム結果を本文へ反映 | `server/cursorWorker.ts:173-178` | `collectCursorRun(...)` の `onText` コールバック経由で、テキストを SSE 出力に流しています。 |
| SDK Run のツール呼び出しテレメトリ | `server/cursorSdkRun.ts:39-45`, `server/cursorWorker.ts:195-214`, `server/characterAgents.ts:158-173` | `tool_call` イベント、status history、usage を収集して独自テレメトリへ保存しています。 |
| SDK エージェントの終了処理 | `server/cursorWorker.ts:338-343`, `server/characterAgents.ts:178-182` | `Symbol.asyncDispose` があれば優先し、なければ `close()` で後始末しています。 |

---

## 詳細メモ

### 1. メイン会話エージェント

実装の中心は `server/cursorWorker.ts` です。

- `Agent.create(...)` で新規エージェントを作成
- `Agent.resume(...)` で既存エージェントを再開
- `agent.send(...)` でプロンプトを送信
- `run.cancel()` で中断

特にこの実装は、単純な 1 回きりの呼び出しではなく、**ブラウザセッションに紐づく再開可能な会話セッション**として使っています。

### 2. Run ストリーミングと状態監視

`server/cursorSdkRun.ts` で Cursor SDK の `Run` をラップし、以下を収集しています。

- 本文テキスト
- `tool_call` イベント
- status 変化
- usage（token 使用量）

これは公式 docs の `run.stream()` / `run.wait()` / `run.onDidChangeStatus()` の使い方にかなり沿った実装です。

### 3. サブエージェント活用

`server/characterAgents.ts` では、`Agent.create({ agents: ... })` を使って以下の4エージェントを束ねています。

- Character Director
- Lore Keeper
- Relationship Manager
- Content Writer

さらに `agent.send(..., { onStep })` を使い、`ConversationStep` を見て **実際にどの subagent が使われたか** を記録しています。  
この部分が、このリポジトリの Cursor SDK 活用の中でいちばん独自性が強いです。

### 4. `local` オプションの使い方

公式 docs では `Agent.create({ local: { cwd } })` が紹介されていますが、この実装ではさらに:

- `server/cursorWorker.ts:125`
- `server/cursorWorker.ts:414`
- `server/cursorWorker.ts:442-444`

のように、**ローカル実行コンテキストの明示** と、必要時の **`local.force: true` 再試行** まで入っています。

### 5. SDK 外だが併用している Cursor hook

`@cursor/sdk` の API ではありませんが、現在の実装では stop hook も併用しています。

- `.cursor/hooks.json`
- `scripts/cursor-stop-hook.mjs`
- `server/cursorWorker.ts`
- `server/characterRuntimeState.ts`

この経路では stop hook の完了を観測したあと、Character Director が返した `sevenDeadlySins` をもとに内部値を少しずつ更新しています。  
その更新後の値は次回の `resolveCharacterRuntimeContext(...)` に入り、結果として **次回以降のプロンプト内容に反映** されます。

---

## 現状、特に Cursor SDK を強く使っているファイル

### `server/cursorWorker.ts`

役割:
- メインの Cursor 会話実行
- セッション再開
- Run 中断
- テレメトリ保存
- サブエージェント分析との接続

### `server/characterAgents.ts`

役割:
- 4サブエージェントの定義
- `onStep` による subagent 使用状況の検出
- character artifacts の JSON 生成

### `server/cursorSdkRun.ts`

役割:
- Cursor SDK の Run をイベント単位で読み出す共通ラッパー
- text / tool_calls / status / usage の抽出

---

## 補足

今回の確認範囲では、公式 docs で説明されている Cursor SDK 機能のうち、この実装で明確に活用されている中核は次の通りでした。

- Agent の生成
- Agent の再開
- プロンプト送信
- Run のストリーミング
- Run 完了待ち
- Run のキャンセル
- status 変更購読
- `onStep` によるステップ観測
- サブエージェント構成

一方で、今回の実装確認では **`run.conversation()` を直接使っている箇所は見当たりませんでした。**
