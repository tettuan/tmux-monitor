---
title: 
usage: "climpt-launch claude-company using-tmux"
---
# tmuxを使った相互通信によるClaude Code Company管理方法

## 概要

tmuxの複数paneでClaude
Codeインスタンスを並列実行し、効率的にタスクを分散処理する方法。

## 基本セットアップ

### 0. tmux pane起動確認

```
tmux list-panes -F "#{pane_index}: #{pane_id} #{pane_current_command} #{pane_active} #{pane_title}"
# 例の出力:
# 0: %22 node 1  (メインpane)
# 1: %27 node 0  (部下1)
```

- node の場合は Claude Code と判定する。
- zsh はClaude Codeではない。
- Claude Code 存在確認:  "C-["を0.2秒毎に3回送る。その後、返信を求めるメッセージを送る。

### 1. tmux pane構成作成

最適化レイアウト（推奨）：メイン40% + 部下3x4グリッド

```bash
# 既存paneを削除してリセット
tmux kill-pane -a -t 0

# 横を40%:60%に分割
tmux split-window -h -p 60

# 右側(60%)を縦に4分割
tmux select-pane -t 1
tmux split-window -v -p 75
tmux split-window -v -p 66
tmux split-window -v -p 50

# 各行を横に3分割（1行目）
tmux select-pane -t 1
tmux split-window -h -p 66
tmux split-window -h -p 50

# 2行目
tmux select-pane -t 4
tmux split-window -h -p 66
tmux split-window -h -p 50

# 3行目
tmux select-pane -t 7
tmux split-window -h -p 66
tmux split-window -h -p 50

# 4行目
tmux select-pane -t 10
tmux split-window -h -p 66
tmux split-window -h -p 50

# メインpaneに戻る
tmux select-pane -t 0

# メインpaneに色をつけて視認性向上
tmux select-pane -P 'fg=white,bg=black,bold'

# pane番号と実行中コマンドを表示
tmux display-panes -d 0  # pane番号を常時表示
tmux list-panes -F "pane#{pane_index}(#{pane_id}): #{pane_current_command} #{pane_title}"  # 実行中コマンド一覧とタイトル表示
```

**レイアウト結果**：
```
┌─────────────────────┬────────┬────────┬────────┐
│      メイン         │ pane1  │ pane2  │ pane3  │
│     (40%)           ├────────┼────────┼────────┤
│     視認性良好      │ pane4  │ pane5  │ pane6  │
│                     ├────────┼────────┼────────┤
│                     │ pane7  │ pane8  │ pane9  │
│                     ├────────┼────────┼────────┤
│                     │ pane10 │ pane11 │ pane12 │
└─────────────────────┴────────┴────────┴────────┘
```

### 2. pane番号の確認

```
# pane構造とIDの確認（実際の番号は環境により異なる）
tmux list-panes -F "#{pane_index}: #{pane_id} #{pane_current_command} #{pane_active} #{pane_title}"
# 例の出力:
# 0: %22 zsh 1  (メインpane)
# 1: %27 zsh 0  (部下1)
# 2: %28 zsh 0  (部下2)
# 3: %25 zsh 0  (部下3)
# 4: %29 zsh 0  (部下4)
# 5: %26 zsh 0  (部下5)
```

### 3. Claude Codeセッション起動

**注意**: `cld`はClaude Codeのエイリアスです。事前に`alias cld="claude --dangerously-skip-permissions"`を設定してください。

**%27等の番号について**: これらはtmuxが自動割り当てするpane IDです。上記の確認コマンドで実際のIDを確認してから使用してください。

#### 最適化レイアウト（推奨）

```bash
# pane IDを動的に取得して起動（3x4グリッド）
for pane in $(tmux list-panes -F "#{pane_id}" | grep -v "$(tmux display-message -p '#{pane_id}')"); do
    # エイリアス設定、テーマ設定、起動を順次実行
    tmux send-keys -t $pane "alias cld='claude --dangerously-skip-permissions'" && sleep 0.1 && tmux send-keys -t $pane Enter
    tmux send-keys -t $pane "claude config set -g theme dark" && sleep 0.1 && tmux send-keys -t $pane Enter
    tmux send-keys -t $pane "cld" && sleep 0.2 && tmux send-keys -t $pane Enter 
done
wait
```

## タスク割り当て方法

### 基本テンプレート

```
tmux send-keys -t %27 "cd 'ワーキングディレクトリ' && あなたはpane1です。タスク内容。エラー時は[pane1]でtmux send-keys -t %22でメイン報告。" && sleep 0.1 && tmux send-keys -t %27 Enter
```

**NG例**: 
```
tmux send-keys -t %27 "cd 'ワーキングディレクトリ' && あなたはpane1です。タスク内容。エラー時は[pane1]でtmux send-keys -t %22でメイン報告。 Enter"
```

### 並列タスク割り当て例

```
tmux select-pane -t %27 -T "役割名" && sleep 0.1 && tmux send-keys -t %27 "タスク1の内容" && sleep 0.1 && tmux send-keys -t %27 Enter & \
tmux select-pane -t %27 -T "役割名" && sleep 0.1 && tmux send-keys -t %28 "タスク2の内容" && sleep 0.1 && tmux send-keys -t %28 Enter & \
tmux select-pane -t %27 -T "役割名" && sleep 0.1 && tmux send-keys -t %25 "タスク3の内容" && sleep 0.1 && tmux send-keys -t %25 Enter & \
wait
```

## 報連相システム

### 部下からメインへの報告形式

部下は以下のワンライナーで報告：

```
tmux send-keys -t %22 '[pane番号] 報告内容' && sleep 0.1 && tmux send-keys -t %22 Enter
```

部下から報連相できるように、タスク依頼時に上記の方法を教えて上げてください。また、`/clear`
を頻繁にするので、2回目以降でもタスクの末尾に報連相の方法を加えておくと良いです。マネージャーから部下へ送る時も同様です。
Enterは必ず単独で送ります。

### 例

```
tmux send-keys -t %22 '[pane1] タスク完了しました' && sleep 0.1 && tmux send-keys -t %22 Enter
tmux send-keys -t %22 '[pane3] エラーが発生しました：詳細内容' && sleep 0.1 && tmux send-keys -t %22 Enter
```

## トークン管理

### /clearコマンドの実行

部下は自分で/clearできないため、メインが判断して実行：

**実行タイミングの判断基準**:

- タスク完了時（新しいタスクに集中させるため）
- トークン使用量が高くなった時（cldusageで確認）
- エラーが頻発している時（コンテキストをリセット）
- 複雑な作業から単純な作業に切り替える時

```
# 個別にクリア実行
tmux send-keys -t %27 "/clear" && sleep 0.1 && tmux send-keys -t %27 Enter
```

### 並列/clear

```
tmux send-keys -t %27 "/clear" && sleep 0.1 && tmux send-keys -t %27 Enter & \
tmux send-keys -t %28 "/clear" && sleep 0.1 && tmux send-keys -t %28 Enter & \
tmux send-keys -t %25 "/clear" && sleep 0.1 && tmux send-keys -t %25 Enter & \
wait
```

## 状況確認コマンド

**なぜ必要か**: 部下からの報告に加えて、以下の場面でコマンド確認が有効です：

- 部下が応答しない時（フリーズ、エラー状態の確認）
- 報告内容の詳細確認（エラーメッセージの全文確認）
- 作業状況の客観的把握（進捗の可視化）
- トラブルシューティング時（ログの確認）

### pane状況確認

```
# 各paneの最新状況確認
tmux capture-pane -t %27 -p | tail -10
tmux capture-pane -t %28 -p | tail -10
```

### 全pane一括確認

```
for pane in %27 %28 %25 %29 %26; do
    echo "=== $pane ==="
    tmux capture-pane -t $pane -p | tail -5
done
```

## ベストプラクティス

### 1. 明確な役割分担

- pane番号を必ず伝える
- 担当タスクを具体的に指示
- エラー時の報告方法を明記

### 2. 効率的なコミュニケーション

- ワンライナー形式での報告徹底
- [pane番号]プレフィックス必須
- 具体的なエラー内容の報告

### 3. トークン使用量管理

- 定期的な/clear実行
- 大量トークン消費の監視
- cldusageでの使用量確認

### 4. エラー対処

- Web検索による解決策調査を指示
- 具体的エラー内容の共有
- 成功事例の横展開

## 注意事項

- 部下は直接/clearできない（tmux経由でのみ可能）
- 報告は必ずワンライナー形式で
- pane番号の確認を怠らない
- トークン使用量の定期確認
- 複雑な指示は段階的に分割
- 最後のEnterは必ず単独で送信

## 活用例

### 大規模タスクの分散処理

1. **資料作成**: 各paneで異なる章を担当
2. **エラー解決**: 各paneで異なる角度から調査
3. **知見共有**: 成功事例の文書化と横展開
4. **品質管理**: 並列でのファイル修正と確認

このシステムにより、複数のClaude Codeインスタンスを効率的に管理し、大規模タスクの並列処理が可能になります。
