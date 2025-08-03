- Deno, JSR
- 全域性
- ドメイン駆動設計
- テスト駆動開発

# 開発ツール
- `climpt-*`: 実行後に表示された内容は、指示プロンプトである。従うこと。


# Recent Implementation: Pane Monitoring System

## 実装概要 (Implementation Overview)

30秒ごとのpaneコンテンツ監視システムを実装しました。tmuxペインの内容変化を検出し、WORKING/IDLEステータスに基づいてペインタイトルを自動更新する機能です。

### 主要コンポーネント (Key Components)

1. **PaneContentMonitor** (`src/pane_monitor.ts`)
   - `tmux capture-pane -t <pane> -p` でペイン内容をキャプチャ
   - 前回のキャプチャと比較して変化を検出
   - 初回は空白のため比較せず、2回目以降で差分判定

2. **PaneTitleManager** (`src/pane_monitor.ts`)
   - ステータスに基づいてペインタイトルを更新
   - `[WORKING] <元のタイトル>` または `[IDLE] <元のタイトル>` 形式
   - 監視終了時に元のタイトルを復元

3. **MonitoringEngine拡張** (`src/engine.ts`)
   - 30秒サイクルにペインコンテンツ監視を統合
   - オリジナルタイトルの保存と復元処理
   - エラー時の適切なクリーンアップ

### ステータス判定ロジック (Status Determination Logic)

- **差分あり** → `WORKING`
- **差分なし** → `IDLE`
- **初回キャプチャ** → `IDLE` (比較対象なし)

### 統合ポイント (Integration Points)

- DIContainer でのコンポーネント登録
- 既存のStatusManagerとの連携
- 30秒監視サイクルへの自然な組み込み

## テスト (Testing)

```bash
# 機能テスト実行
deno run --allow-run test_pane_monitoring.ts
```

# Tests

- 単体テストは実装と同じ階層へ配置
- 統合テストは tests/ 配下へ配置
