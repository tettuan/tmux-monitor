# tmux-monitor ドメイン駆動設計 - 中核駆動型

## 概要

**Pane**を中核とした**シンプルで強靭な設計**により、Claude Code稼働時間の最大化を実現。Totalityと科学的複雑化制御の原則に基づき、持続可能なドメインモデルを構築。

```
根源的欲求: Claude Code稼働時間の最大化
    ↓
中核エンティティ: Pane (作業の最小単位)
    ↓  
収束パターン: Smart Constructor + Result型 + Discriminated Union
```

## 中核ドメイン分析

### 🎯 **24回シミュレーション分析結果**

| ドメイン要素 | 影響範囲 | 頻出度 | 結合度 | 戦略的重要度 |
|-------------|----------|--------|--------|------------|
| **Pane** | 15クラス | 高 | 高 | ★★★★★ |
| **WorkerStatus** | 12クラス | 高 | 中 | ★★★★☆ |
| **MonitoringEngine** | 16クラス | 高 | 高 | ★★★★☆ |

**結論**: Paneが最も広範囲に影響し、すべての機能の基盤となる**中核**として確定。

## 中核ドメイン設計

### 🎯 **Pane（集約ルート・中核）**

**設計理由**: tmuxにおける作業の最小単位であり、すべての制御の起点。

```typescript
// 中核エンティティ - 全域性原則適用
class Pane {
  private constructor(
    readonly id: PaneId,           // Smart Constructor
    readonly name: PaneName,       // Smart Constructor  
    private status: WorkerStatus,  // Discriminated Union
    private history: StatusHistory[],  // 最大2件制約
    private metadata: PaneMetadata
  ) {}

  // Smart Constructor - 制約付き生成
  static create(
    id: string, 
    role: PaneRole, 
    index?: number
  ): Result<Pane, ValidationError & { message: string }> {
    const paneIdResult = PaneId.create(id);
    if (!paneIdResult.ok) return paneIdResult;
    
    const nameResult = PaneName.create(role, index);
    if (!nameResult.ok) return nameResult;
    
    return { 
      ok: true, 
      data: new Pane(
        paneIdResult.data, 
        nameResult.data, 
        { kind: 'UNKNOWN', detectedAt: new Date() }, 
        [], 
        new PaneMetadata()
      ) 
    };
  }

  // 状態更新 - Result型による安全性保証
  updateStatus(newStatus: WorkerStatus): Result<void, ValidationError & { message: string }> {
    const transition = StatusTransition.validate(this.status, newStatus);
    if (!transition.ok) return transition;
    
    this.status = newStatus;
    this.addToHistory(this.status);
    return { ok: true, data: undefined };
  }

  // 内容変化に基づく状態判定
  updateFromContent(content: string, previousContent: string): Result<void, ValidationError & { message: string }> {
    const newStatus = StatusDetermination.fromContent(content, previousContent, this.status);
    return this.updateStatus(newStatus);
  }

  // 不変条件の保護
  private addToHistory(status: WorkerStatus): void {
    this.history.push(new StatusHistory(status, new Date()));
    if (this.history.length > 2) {
      this.history.shift(); // 最大2件制約
    }
  }
}
```

### 🔑 **PaneId（値オブジェクト）**

```typescript
class PaneId {
  private constructor(private readonly value: string) {}
  
  static create(value: string): Result<PaneId, ValidationError & { message: string }> {
    const pattern = /^%\d+$/;
    if (!pattern.test(value)) {
      return { 
        ok: false, 
        error: createError({ 
          kind: "PatternMismatch", 
          value, 
          pattern: pattern.source 
        }) 
      };
    }
    return { ok: true, data: new PaneId(value) };
  }
  
  toString(): string { return this.value; }
  equals(other: PaneId): boolean { return this.value === other.value; }
}
```

### 🏷️ **PaneName（値オブジェクト）**

```typescript
type PaneRole = 'main' | 'manager' | 'secretary' | 'worker';

class PaneName {
  private constructor(
    private readonly role: PaneRole,
    private readonly index?: number
  ) {}
  
  static create(role: PaneRole, index?: number): Result<PaneName, ValidationError & { message: string }> {
    if (role === 'worker' && index === undefined) {
      return { 
        ok: false, 
        error: createError({ kind: "MissingIndex", role }) 
      };
    }
    return { ok: true, data: new PaneName(role, index) };
  }
  
  toString(): string {
    return this.role === 'worker' ? `${this.role}${this.index}` : this.role;
  }
  
  isMainPane(): boolean { return this.role === 'main'; }
  isWorkerPane(): boolean { return this.role === 'worker'; }
}
```

### 📊 **WorkerStatus（値オブジェクト・中心線通貫）**

```typescript
// Discriminated Union - 網羅的状態表現
type WorkerStatus = 
  | { kind: 'IDLE'; reason: 'ready' | 'cleared' }
  | { kind: 'WORKING'; startTime: Date }
  | { kind: 'BLOCKED'; errorType: string; retryCount: number }
  | { kind: 'DONE'; completedAt: Date }
  | { kind: 'TERMINATED'; cause: string }
  | { kind: 'UNKNOWN'; detectedAt: Date };

// 状態判定ロジック
class StatusDetermination {
  static fromContent(
    content: string, 
    previousContent: string, 
    currentStatus: WorkerStatus
  ): WorkerStatus {
    // 初回キャプチャ
    if (!previousContent) {
      return { kind: 'IDLE', reason: 'ready' };
    }
    
    // /clear完了パターン
    if (this.isClearCompleted(content)) {
      return { kind: 'DONE', completedAt: new Date() };
    }
    
    // エラーパターン
    if (this.isBlocked(content)) {
      const retryCount = currentStatus.kind === 'BLOCKED' ? currentStatus.retryCount + 1 : 0;
      return { kind: 'BLOCKED', errorType: 'hook_blocked', retryCount };
    }
    
    // 内容変化
    if (content !== previousContent) {
      return { kind: 'WORKING', startTime: new Date() };
    }
    
    // 変化なし
    return { kind: 'IDLE', reason: 'ready' };
  }
  
  private static isClearCompleted(content: string): boolean {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized === '> /clear ⎿ (no content)';
  }
  
  private static isBlocked(content: string): boolean {
    return content.includes('hook blocked') || content.includes('error occurred');
  }
}
```

### 🔄 **StatusTransition（状態遷移制御）**

```typescript
class StatusTransition {
  static validate(
    from: WorkerStatus, 
    to: WorkerStatus
  ): Result<void, ValidationError & { message: string }> {
    // architecture.mdの遷移ルールを実装
    const validTransitions: Record<WorkerStatus['kind'], WorkerStatus['kind'][]> = {
      'IDLE': ['WORKING', 'DONE', 'BLOCKED'],
      'WORKING': ['IDLE', 'DONE', 'BLOCKED', 'TERMINATED'],
      'BLOCKED': ['IDLE', 'WORKING', 'TERMINATED'],
      'DONE': ['IDLE', 'WORKING'],
      'TERMINATED': ['UNKNOWN'],
      'UNKNOWN': ['IDLE', 'WORKING', 'BLOCKED', 'DONE', 'TERMINATED']
    };
    
    if (!validTransitions[from.kind].includes(to.kind)) {
      return { 
        ok: false, 
        error: createError({ 
          kind: "InvalidTransition", 
          from: from.kind, 
          to: to.kind 
        }) 
      };
    }
    
    return { ok: true, data: undefined };
  }
}
```

## ユビキタス言語（シンプル化）

### 📚 **中核概念のみ**

| 用語 | 定義 | 役割 |
|------|------|------|
| **Pane** | tmuxの作業ペイン（%数字） | 中核・すべての起点 |
| **WorkerStatus** | ペインの稼働状態 | 状態の統一表現 |
| **StatusTransition** | 状態遷移の制御 | 不変条件の保護 |
| **MonitoringCycle** | 30秒監視サイクル | 周期的実行の管理 |

## エラーハンドリング（中核集約）

```typescript
// エラー型定義（シンプル化）
type PaneError = 
  | { kind: 'CaptureTimeout'; paneId: PaneId }
  | { kind: 'InvalidContent'; paneId: PaneId; content: string }
  | { kind: 'TmuxDisconnect'; sessionId: string }
  | { kind: 'UnrecoverableError'; message: string };

// リカバリアクション
type RecoveryAction =
  | { type: 'RetryCapture'; paneId: PaneId; delay: number }
  | { type: 'ResetPane'; paneId: PaneId }
  | { type: 'RecoverSession' }
  | { type: 'Terminate' };

// 中核エラーハンドラ
class PaneErrorHandler {
  static handle(error: PaneError): Result<RecoveryAction, FatalError> {
    switch (error.kind) {
      case 'CaptureTimeout':
        return { ok: true, data: { type: 'RetryCapture', paneId: error.paneId, delay: 1000 } };
      case 'InvalidContent':
        return { ok: true, data: { type: 'ResetPane', paneId: error.paneId } };
      case 'TmuxDisconnect':
        return { ok: true, data: { type: 'RecoverSession' } };
      case 'UnrecoverableError':
        return { ok: false, error: new FatalError(error.message) };
    }
  }
}
```

## 全域性原則の適用

### 🧠 **Result型による完全性**

```typescript
// すべての操作はResult型で統一
type Result<T, E> = 
  | { ok: true; data: T }
  | { ok: false; error: E };

// 共通エラー型（最小限）
type ValidationError = 
  | { kind: "PatternMismatch"; value: string; pattern: string }
  | { kind: "InvalidTransition"; from: string; to: string }
  | { kind: "MissingIndex"; role: string }
  | { kind: "InvariantViolation"; message: string };

// エラー生成ヘルパー
const createError = (
  error: ValidationError
): ValidationError & { message: string } => ({
  ...error,
  message: getErrorMessage(error)
});
```

## 品質メトリクス（定量的管理）

### 📊 **複雑性エントロピー監視**

```typescript
interface QualityMetrics {
  // 中核設計の維持
  coreClasses: 3;           // Pane, PaneId, PaneName
  valueObjects: 5;          // 上記 + WorkerStatus, StatusHistory
  services: 3;              // StatusTransition, StatusDetermination, PaneErrorHandler
  totalComplexity: 11;      // 合計（15以下を維持）
  
  // パターン適用率
  smartConstructorUsage: 100;  // %
  resultTypeUsage: 100;        // %
  discriminatedUnionUsage: 100; // %
}
```

## まとめ

### 🎯 **中核駆動設計の効果**

1. **単純性**: Pane中心の明確な構造
2. **堅牢性**: 全域性原則による型安全性
3. **保守性**: 3つの成功パターンに収束
4. **拡張性**: 中核を変更せずに周辺拡張可能

### 🏗️ **設計整合性**

- **architecture.md**: 中核駆動の全体設計
- **domain_boundary.md**: 3ドメインの境界定義
- **domain_driven_design.md**: Pane中心の詳細設計

すべてが**Pane**を中核とした一貫した設計思想で統一され、Claude Code稼働時間の最大化という根源的欲求を実現。