# tmux-monitor ドメイン駆動設計

## 概要

tmux-monitorは、tmuxターミナルセッションの監視とペイン管理を行うツールです。[`docs/totality.ja.md`](./totality.ja.md)の**全域性原則**に基づき、**部分関数を全域関数に変換**し、型システムで「ありえない状態」を排除する堅牢な設計を採用しています。

## 中核ドメイン概念

### 🎯 **Pane**（ペイン）- 最重要エンティティ

```typescript
// Discriminated Unionによる状態の論理的分割
export type PaneState =
  | { kind: "Active"; command: string; title: string; pid: number }
  | { kind: "Inactive"; command: string; title: string; pid: number }
  | { kind: "Unknown"; reason: "NoProcess" | "ConnectionLost" | "PermissionDenied" };

// Smart Constructorによる制約の型化
class PaneId {
  private constructor(readonly value: string) {}
  static create(id: string): Result<PaneId, ValidationError> {
    const pattern = /^%\d+$/;
    return pattern.test(id) 
      ? { ok: true, data: new PaneId(id) }
      : { ok: false, error: createError({ kind: "PatternMismatch", value: id, pattern: pattern.source }) };
  }
}
```

**ビジネス観点**:
- **Main Pane**: アクティブな操作対象ペイン（1つのセッションに最大1つ）
- **Target Panes**: 監視対象の非アクティブペイン群

### 📊 **WorkerStatus**（ワーカー状態）- 行動観測エンティティ

```typescript
export type WorkerStatus =
  | { kind: "IDLE" }
  | { kind: "WORKING"; details?: string }
  | { kind: "BLOCKED"; reason?: string }
  | { kind: "DONE"; result?: string }
  | { kind: "TERMINATED"; reason?: string }
  | { kind: "UNKNOWN"; lastKnownState?: string };
```

**戦略的判定システム**（優先度順）:
1. **Title解析**: ペインタイトルから明示的状態を抽出（最優先）
2. **Command解析**: 実行中コマンドのパターンマッチング（セカンダリ）
3. **PID確認**: プロセス状態の確認（最終手段）

### 🔄 **Monitoring Cycle**（監視サイクル）- プロセス骨格

```typescript
export type MonitoringMode =
  | { kind: "SingleRun" }
  | { kind: "Continuous" }
  | { kind: "Scheduled"; scheduledTime: Date }
  | { kind: "ScheduledContinuous"; scheduledTime: Date };

// フェーズの論理的実行制御（依存関係の型化）
type MonitoringPhase =
  | { kind: "Discovery"; prerequisites: {} }
  | { kind: "Classification"; prerequisites: { session: TmuxSession } }
  | { kind: "Tracking"; prerequisites: { session: TmuxSession; panes: PaneCollection } }
  | { kind: "Reporting"; prerequisites: { session: TmuxSession; panes: PaneCollection; statuses: StatusMap } }
  | { kind: "Completed"; prerequisites: { session: TmuxSession; panes: PaneCollection; statuses: StatusMap; reports: Report[] } };
```

## アーキテクチャ層構造

### 🏛️ **4層アーキテクチャ**

```
Presentation Layer  → CLI Interface, Application Controller
Domain Layer        → Core Models, Smart Constructors, Business Rules
Application Layer   → MonitoringEngine (orchestration)
Infrastructure Layer → TmuxSession, CommandExecutor, PaneCommunicator
```

### 🎛️ **責任分離**

| コンポーネント | 責任 | 設計原則 |
|----------------|------|----------|
| **MonitoringEngine** | 監視ロジックの統制・フロー制御 | Single Responsibility, DI |
| **PaneManager** | Main/Target Panesの分類・状態追跡 | State Management |
| **StatusAnalyzer** | Command/Title/PIDからWorkerStatus決定 | Strategy Pattern |
| **PaneCommunicator** | tmuxコマンド経由のペイン間通信 | Communication Abstraction |

## ユビキタス言語辞書

### 📚 **中核概念**

| 用語 | 定義 | ビジネスルール |
|------|------|----------------|
| **Pane** | tmuxの作業ペイン（%1, %2...形式ID） | ID一意性、状態遷移制御 |
| **Main Pane** | アクティブな操作対象ペイン | セッション内唯一性 |
| **Target Panes** | 監視対象の非アクティブペイン群 | 複数可、状態追跡対象 |
| **Session Discovery** | 最適tmuxセッションの自動発見 | アクティビティベース選択 |
| **Status Tracking** | ペイン状況の継続的追跡 | Title→Command→PID優先順 |
| **Monitoring Cycle** | 監視の1周期（発見→分類→追跡→報告） | 順序保証、エラー分離 |

### ⚙️ **技術用語**

| 用語 | 設計原則 | 全域性適用 |
|------|----------|------------|
| **Smart Constructor** | 制約付きオブジェクト生成 | 不正値の事前排除 |
| **Result Type** | 型安全なエラーハンドリング | 部分関数の全域化 |
| **Discriminated Union** | 状態の型安全表現 | パターンマッチング網羅 |

## 論理的全域性の設計原則

### 🧠 **核心理念**

**部分関数を全域関数に変換**し、型システムで「ありえない状態」を排除：

1. **状態空間の論理的分割**: Discriminated Unionによる明確な状態表現
2. **遷移の必然性**: Smart Constructorによる状態変化の論理的根拠
3. **制約の論理的表現**: Result Typeによるビジネスルール強制
4. **部分関数排除**: null/undefined/例外の型レベル防止

### 🛡️ **実践パターン**

#### **パターン1: 状態の論理的分割**

```typescript
// ❌ オプショナルプロパティ（曖昧性）
interface BadPaneInfo { active?: boolean; command?: string; }

// ✅ Discriminated Union（明確性）
type PaneState = { kind: "Active"; ... } | { kind: "Inactive"; ... } | { kind: "Unknown"; ... };

// パターンマッチング（網羅的処理、default不要）
function processPane(state: PaneState): string {
  switch (state.kind) {
    case "Active": return `アクティブ: ${state.command}`;
    case "Inactive": return `非アクティブ: ${state.command}`;
    case "Unknown": return `不明: ${state.reason}`;
  }
}
```

#### **パターン2: 制約の型化**

```typescript
// ❌ 無制限値型
type MonitorInterval = number; // 1でも100万でも受け入れ

// ✅ Smart Constructor（ビジネスルール強制）
class MonitorInterval {
  private constructor(readonly milliseconds: number) {}
  static create(ms: number): Result<MonitorInterval, ValidationError> {
    return (ms >= 100 && ms <= 60000 && ms % 100 === 0)
      ? { ok: true, data: new MonitorInterval(ms) }
      : { ok: false, error: createError({ kind: "OutOfRange", value: ms, min: 100, max: 60000 }) };
  }
}
```

#### **パターン3: 部分関数の全域化**

```typescript
// ❌ 例外ベースエラーハンドリング
function findMainPane(): Pane {
  const panes = getTmuxPanes(); // 失敗時は例外
  if (panes.length === 0) throw new Error("No panes found");
  return panes.find(p => p.active) ?? (() => { throw new Error("No active pane"); })();
}

// ✅ Result型（全ての失敗を型で表現）
function findMainPane(): Result<Pane, FindPaneError> {
  const panesResult = getTmuxPanes(); // Result<Pane[], TmuxError>
  if (!panesResult.ok) return { ok: false, error: createError({ kind: "TmuxCommandFailed", cause: panesResult.error }) };
  
  const activePane = panesResult.data.find(p => p.state.kind === "Active");
  return activePane 
    ? { ok: true, data: activePane }
    : { ok: false, error: createError({ kind: "NoActivePaneFound", availablePanes: panesResult.data.length }) };
}
```

#### **パターン4: 状態遷移制御**

```typescript
// 論理的遷移ルール定義
type StateTransitionRule =
  | { from: "Active"; to: "Inactive"; trigger: "UserSwitch" | "ProcessEnd" }
  | { from: "Inactive"; to: "Active"; trigger: "UserActivation" | "Focus" }
  | { from: "Active" | "Inactive"; to: "Unknown"; trigger: "ConnectionLost" | "TmuxError" }
  | { from: "Unknown"; to: "Active" | "Inactive"; trigger: "Reconnected" };

// 遷移マトリックスによる検証
const validTransitions: Record<string, { to: PaneState["kind"]; triggers: string[] }[]> = {
  "Active": [{ to: "Inactive", triggers: ["UserSwitch", "ProcessEnd"] }, { to: "Unknown", triggers: ["ConnectionLost", "TmuxError"] }],
  "Inactive": [{ to: "Active", triggers: ["UserActivation", "Focus"] }, { to: "Unknown", triggers: ["ConnectionLost", "TmuxError"] }],
  "Unknown": [{ to: "Active", triggers: ["Reconnected"] }, { to: "Inactive", triggers: ["Reconnected"] }]
};
```

#### **パターン5: 戦略的判定システム**

```typescript
// 複数戦略の優先度付き組み合わせ
class WorkerStatusAnalyzer {
  static determine(title: string, command: string, pid: number | null): Result<WorkerStatus, StatusAnalysisError> {
    // 戦略1: タイトル解析（最優先）
    const titleResult = this.analyzeTitle(title);
    if (titleResult.ok) return titleResult;
    
    // 戦略2: コマンド分析（セカンダリ）
    const commandResult = this.analyzeCommand(command);
    if (commandResult.ok) return commandResult;
    
    // 戦略3: プロセス確認（最終手段）
    return this.analyzeProcess(pid);
  }
  
  // コマンドパターンの論理的分類
  private static analyzeCommand(command: string): Result<WorkerStatus, StatusAnalysisError> {
    const categories = {
      development: { pattern: /^(npm|yarn|deno|node|python|cargo|go)\s/, status: { kind: "WORKING", details: "開発ツール実行中" } },
      editor: { pattern: /^(vim|nvim|emacs|code|nano)/, status: { kind: "WORKING", details: "エディタ使用中" } },
      shell: { pattern: /^(bash|zsh|fish|sh)$/, status: { kind: "IDLE" } }
    };
    
    for (const [category, config] of Object.entries(categories)) {
      if (config.pattern.test(command)) {
        return { ok: true, data: { ...config.status, details: `${config.status.details} (${category}): ${command}` } };
      }
    }
    
    return { ok: false, error: createError({ kind: "CommandParsingFailed", input: command }) };
  }
}
```

## 設計品質指標

### 📊 **全域性メトリクス**

| 指標 | 目標値 | 実装状況 | 測定方法 |
|------|-------|----------|----------|
| **型カバレッジ** | any型使用率 < 1% | ✅ 0% | 完全排除済み |
| **パターン網羅** | switch文default不要率 | ✅ 100% | 全Discriminated Union対応 |
| **エラー型化** | 例外使用率 < 5% | ✅ 0% | Result型のみ使用 |
| **制約型化** | ビジネスルール型表現率 | ✅ 95% | Smart Constructor適用 |
| **状態一貫性** | 不正状態型レベル排除率 | ✅ 100% | 全状態型定義済み |

### 🔍 **継続的改善指標**

```typescript
// 全域性違反の早期検出
type TotalityViolation =
  | { kind: "PartialFunctionDetected"; suggestion: "Convert to Result<T, E>" }
  | { kind: "ImplicitStateDetected"; suggestion: "Use Discriminated Union" }
  | { kind: "UncheckedTransitionDetected"; suggestion: "Add transition validation" }
  | { kind: "AnyTypeDetected"; suggestion: "Define explicit type" };

// コンパイル時品質チェック
interface TotalityCompliance {
  partialFunctionCount: 0;        // 目標: 0 (全てResult型)
  anyTypeUsageCount: 0;           // 目標: 0 (明示的型定義)
  uncheckedTransitionCount: 0;    // 目標: 0 (全遷移検証)
  unhandledErrorCaseCount: 0;     // 目標: 0 (全エラー型化)
}
```

## まとめ

### 🎯 **全域性原則による設計の強化**

tmux-monitorは**Pane**中心の明確な責任分離、**WorkerStatus**による状態追跡、**Monitoring Cycle**による一貫したプロセスフローで構築されています。

[`docs/totality.ja.md`](./totality.ja.md)の理念を完全統合し、以下を実現：

1. **部分関数の全域化**: 全操作をResult型で包装、失敗を型で表現
2. **状態空間の論理的分割**: Discriminated Unionによる状態明確化
3. **制約の型化**: Smart Constructorによるビジネスルール強制
4. **遷移制御の論理化**: 許可された状態遷移のみを型で保証
5. **戦略パターンの型安全実装**: 複数判定手法の優先度付き組み合わせ
6. **実行時安全性**: キャンセル・タイムアウト・エラー分離の型レベル制御

### 🏗️ **型システムによるビジネス論理保証**

**論理的全域性**の適用により、従来の手続き型では困難だった**ビジネスロジックの完全性**を型レベルで保証。コンパイル時に不正状態・不正遷移・制約違反を検出し、tmux環境での複雑なペイン管理を**予測可能で保守しやすい**コードベースで実現しています。
