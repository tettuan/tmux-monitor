# STATUS判定システム統合設計

## 現状分析

### 既存システム（WorkerStatus）
```typescript
export type WorkerStatus =
  | { kind: "IDLE" }
  | { kind: "WORKING"; details?: string }
  | { kind: "BLOCKED"; reason?: string }
  | { kind: "DONE"; result?: string }
  | { kind: "TERMINATED"; reason?: string }
  | { kind: "UNKNOWN"; lastKnownState?: string };
```

**判定方法**: タイトル解析、コマンド解析による**推論ベース**

### 新規システム（ActivityStatus）
```typescript
export type ActivityStatus =
  | { kind: "WORKING" }
  | { kind: "IDLE" } 
  | { kind: "NOT_EVALUATED" };
```

**判定方法**: capture内容の2点比較による**事実ベース**

## 統合戦略

### 🎯 **戦略1: 階層化（推奨）**

ActivityStatusを**観測事実**として扱い、WorkerStatusを**業務解釈**として扱う階層構造。

```typescript
// 観測事実層（capture状態から直接判定）
ActivityStatus: WORKING | IDLE | NOT_EVALUATED

// 業務解釈層（ActivityStatus + 追加情報で判定）  
WorkerStatus: IDLE | WORKING | BLOCKED | DONE | TERMINATED | UNKNOWN
```

### 🔄 **統合ルール**

```typescript
function deriveWorkerStatusFromActivity(
  activityStatus: ActivityStatus,
  contextInfo: ContextInfo
): WorkerStatus {
  switch (activityStatus.kind) {
    case "NOT_EVALUATED":
      return { kind: "UNKNOWN", lastKnownState: "初回評価" };
      
    case "IDLE":
      // 追加判定で詳細化
      if (contextInfo.hasCompletionMarker) {
        return { kind: "DONE", result: contextInfo.result };
      }
      if (contextInfo.hasErrorMarker) {
        return { kind: "TERMINATED", reason: contextInfo.error };
      }
      return { kind: "IDLE" };
      
    case "WORKING":
      // 追加判定で詳細化
      if (contextInfo.isBlocked) {
        return { kind: "BLOCKED", reason: contextInfo.blockReason };
      }
      return { kind: "WORKING", details: contextInfo.workDetails };
  }
}
```

## 実装プラン

### フェーズ1: ActivityStatusMapping作成
ActivityStatusとWorkerStatusの変換ロジックを値オブジェクトとして実装

### フェーズ2: Pane集約ルート修正
capture状態からWorkerStatusを導出するロジックを統合

### フェーズ3: 既存判定ロジック段階的移行
タイトル解析ベースから capture状態ベースへの段階的移行

## 利点

1. **データソースの明確化**: 推論 vs 観測の分離
2. **精度向上**: capture状態による客観的判定
3. **後方互換性**: 既存WorkerStatusの維持
4. **段階的移行**: 既存システムへの影響最小化
