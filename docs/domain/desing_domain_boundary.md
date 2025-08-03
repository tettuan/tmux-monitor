# tmux-monitor ドメイン境界線設計

## ドメイン境界の定義

### 1. **Monitoring Domain**（監視ドメイン）
**根源的欲求**: Claude Code稼働時間の最大化  
**集約ルート**: Pane

#### 境界内要素
- **Pane** - 集約ルート（PaneId, WorkerStatus, PaneName, 履歴管理）
- **PaneCollection** - ペイン群の管理とライフサイクル制御
- **StatusTransitionService** - ワーカーステータス遷移制御
- **PaneNamingService** - ペイン役割分類（manager/worker/secretary）
- **WorkerStatus** - 値オブジェクト（IDLE/WORKING/BLOCKED/DONE/TERMINATED/UNKNOWN）
- **PaneId** - 値オブジェクト（%\d+ 形式制約）
- **PaneName** - 値オブジェクト（役割ベース命名制約）

#### 不変条件
- PaneIDはtmux形式（%\d+）でなければならない
- ステータス遷移は定義されたルールに従う
- 履歴は最大2件まで保持
- アクティブペインは1セッションに1つのみ

#### 境界接続
- **→ Application Layer**: MonitoringCycleCompleted イベント
- **← Infrastructure Layer**: PaneContentChanged イベント

### 2. **Orchestration Domain**（調整ドメイン）
**根源的欲求**: 監視プロセスの周期的実行と制御  
**集約ルート**: MonitoringCycle

#### 境界内要素
- **MonitoringEngine** - 監視プロセス全体のオーケストレーション
- **MonitoringCycleService** - 30秒サイクル管理
- **MonitoringCycleCoordinator** - サイクル調整ロジック
- **CaptureOrchestrator** - キャプチャ処理の統合
- **MonitoringCycle** - 値オブジェクト（周期性と段階性の表現）

#### 不変条件
- 監視サイクルは30秒間隔で実行
- 同時実行可能なサイクルは1つのみ
- 各サイクルは発見→分類→追跡→報告の順序で実行

#### 境界接続
- **→ Monitoring Domain**: StartMonitoringCycle コマンド
- **→ Infrastructure Domain**: ExecuteCapture コマンド
- **← Presentation Layer**: StartMonitoring コマンド

### 3. **Infrastructure Domain**（基盤ドメイン）
**根源的欲求**: tmux外部システムとの安全な連携  
**集約ルート**: TmuxSession

#### 境界内要素
- **TmuxSession** - tmuxセッション管理と操作
- **CommandExecutor** - tmuxコマンド実行基盤
- **PaneCommunicator** - ペイン間通信制御
- **Logger** - ログ出力管理
- **TimeManager** - 時間管理
- **UnifiedCaptureAdapter** - キャプチャ処理統合

#### 不変条件
- tmuxコマンド実行は例外安全
- セッション状態は常に同期済み
- 外部依存は抽象化されたインターフェース経由

#### 境界接続
- **← Orchestration Domain**: ExecuteCapture コマンド
- **→ Monitoring Domain**: PaneContentChanged イベント

### 4. **Core Domain**（共通ドメイン）
**根源的欲求**: 横断的関心事の統一管理  
**集約ルート**: DIContainer

#### 境界内要素
- **DIContainer** - 依存性注入コンテナ
- **Configuration** - アプリケーション設定管理
- **CancellationToken** - 処理中断制御
- **Result<T>** - 型安全なエラーハンドリング
- **ValidationError** - バリデーション失敗表現

#### 不変条件
- 依存性は単一方向（上位→下位）
- エラーは型として表現される
- 設定変更は不変オブジェクトで管理

#### 境界接続
- **→ すべてのドメイン**: 依存性注入による疎結合

## 境界間通信プロトコル

### イベント駆動通信
```typescript
// Monitoring → Orchestration
interface MonitoringCycleCompleted {
  type: 'MonitoringCycleCompleted'
  cycleId: string
  detectedChanges: PaneChange[]
  timestamp: Date
}

// Infrastructure → Monitoring  
interface PaneContentChanged {
  type: 'PaneContentChanged'
  paneId: PaneId
  content: string
  timestamp: Date
}
```

### コマンド駆動通信
```typescript
// Orchestration → Monitoring
interface StartMonitoringCycle {
  type: 'StartMonitoringCycle'
  targetPanes: PaneId[]
  cycleConfig: MonitoringConfig
}

// Orchestration → Infrastructure
interface ExecuteCapture {
  type: 'ExecuteCapture'  
  paneId: PaneId
  captureType: 'content' | 'title'
}
```

### 依存性注入通信
```typescript
// Core → すべてのドメイン
interface DomainDependencies {
  logger: Logger
  timeManager: TimeManager
  cancellationToken: CancellationToken
}
```

## 境界の堅牢性保証

### 型レベル境界強制
- **Smart Constructor**: 境界オブジェクトの制約付き生成
- **Discriminated Union**: 状態の型安全表現
- **Result Type**: エラーハンドリングの明示的型化

### ランタイム境界検証
- **Invariant Checks**: 不変条件の実行時検証
- **Event Validation**: イベント形式の厳密検証
- **Command Authorization**: コマンド実行権限の確認

### アーキテクチャ境界監視
- **Dependency Direction**: 依存関係の方向性チェック
- **Layer Isolation**: 層間分離の維持確認
- **Interface Compliance**: インターフェース準拠の検証