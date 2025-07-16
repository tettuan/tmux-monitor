# Capture変化検出の統合設計

## 🔍 **現状分析**

### 点在している実装

1. **`src/panes.ts`** - `getPaneContent()`
   - tmux capture-pane実行のみ
   - 最後10行限定

2. **`src/infrastructure/adapters.ts`** - `PaneContentAdapter`
   - capture + Map履歴管理
   - 正規化処理

3. **`src/pane_monitor.ts`** - `PaneContentMonitor`  
   - capture + 配列履歴管理
   - タイムスタンプ付き

4. **`src/domain/pane.ts`** - Pane集約ルート
   - DDD設計によるcapture状態管理（今回追加）

### 💔 **問題点**

- **重複実装**: 4箇所で別々のcapture機能
- **不一致**: 各々異なるアルゴリズム・データ構造  
- **責任分散**: ドメインロジックがinfrastructure層に漏出
- **テスト困難**: 統一された仕様がない

## 🎯 **統合戦略**

### DDD層構造での役割分担

```
Application Layer
├─ CaptureOrchestrator (新設)
│   ├─ capture実行のオーケストレーション
│   └─ ドメインサービスとの連携

Domain Layer  
├─ Pane (集約ルート)
│   ├─ capture状態の管理
│   └─ ActivityStatus/WorkerStatus統合
├─ CaptureState (値オブジェクト)
│   ├─ STATUS + INPUT観点の統合
│   └─ StatusMapping連携
└─ CaptureService (ドメインサービス)
    ├─ capture変化検出ロジック
    └─ ビジネスルール適用

Infrastructure Layer
└─ TmuxCaptureAdapter (統一adapter)
    ├─ tmux capture-pane実行
    └─ 技術的詳細の抽象化
```

## 🏗️ **統合実装プラン**

### フェーズ1: 統一Adapter作成
- 既存4実装の統合
- DDD設計に従ったinterface定義

### フェーズ2: ドメインサービス作成  
- capture変化検出のビジネスロジック
- StatusMapping統合

### フェーズ3: 既存コード移行
- 段階的な置き換え
- テストでの検証

## 📊 **統合後の利点**

1. **単一責任**: capture機能の一元化
2. **型安全**: Result型による堅牢性
3. **テスタビリティ**: モック可能な設計
4. **保守性**: DDD構造による明確な責任分界
