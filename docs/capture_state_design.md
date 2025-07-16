# Capture状態設計仕様書

## 概要

tmux-monitorにおけるペインのcapture状態評価システムの設計。DDD（ドメイン駆動設計）と全域性原則に基づき、2つの観点（STATUS、INPUT）からペインの状況を型安全に評価する。

## 要求仕様

### 1. STATUS観点（活動状況）
- **目的**: 30秒ごとのpane capture結果を比較し、ペインの活動状況を判定
- **判定ロジック**: 
  - 前回との変化あり → `WORKING` 
  - 前回との変化なし → `IDLE`
  - 初回など評価不能 → `NOT_EVALUATED`

### 2. INPUT観点（入力欄状況）
- **目的**: ペインの入力状態（空白か否か）を判定
- **判定ロジック**: capture 3行の評価による入力欄の状態検出

```
╭──────────────────────────────────────╮
│ >                                    │ ← この行の解析
╰──────────────────────────────────────╯
```

**判定条件**:
1. 連続する3行の先頭が `╭`, `│`, `╰` であること（入力欄枠線の検出）
2. 2行目が `│ > │` 形式（空白除去後）→ `EMPTY`
3. 2行目が `│ > [文字列] │` 形式 → `HAS_INPUT`
4. 入力欄パターンなし → `NO_INPUT_FIELD`

## DDD設計

### ドメインモデル構造

```typescript
// 値オブジェクト階層
StatusComparison    // STATUS観点の2点比較
InputFieldState     // INPUT観点の入力欄解析
CaptureState        // 2つの観点を統合

// 集約ルート
Pane                // capture状態を管理する集約ルート
```

### ユビキタス言語

| 用語 | 定義 | ドメイン的意味 |
|------|------|---------------|
| **ActivityStatus** | ペインの活動状況 | WORKING/IDLE/NOT_EVALUATED |
| **InputFieldStatus** | 入力欄の状況 | EMPTY/HAS_INPUT/NO_INPUT_FIELD/PARSE_ERROR |
| **StatusComparison** | capture内容の2点比較 | 変化検出による活動判定 |
| **InputFieldState** | 入力欄状態の評価結果 | 3行解析による入力判定 |
| **CaptureState** | 統合capture状態 | STATUS+INPUT観点の総合評価 |

## 型安全設計（全域性原則適用）

### Discriminated Union による状態表現

```typescript
// ❌ 悪い例：オプショナルによる状態表現
interface BadCaptureState {
  isWorking?: boolean;
  hasInput?: boolean;
  isEvaluated?: boolean;
}

// ✅ 良い例：タグ付きユニオンによる明示的状態
type ActivityStatus =
  | { kind: "WORKING" }
  | { kind: "IDLE" } 
  | { kind: "NOT_EVALUATED" };

type InputFieldStatus =
  | { kind: "EMPTY" }
  | { kind: "HAS_INPUT" }
  | { kind: "NO_INPUT_FIELD" }
  | { kind: "PARSE_ERROR"; reason: string };
```

### Smart Constructor による制約強制

```typescript
class StatusComparison {
  private constructor(/* ... */) {}
  
  static create(
    previousContent: string | null,
    currentContent: string,
  ): Result<StatusComparison, ValidationError & { message: string }> {
    // 制約チェック + 作成
  }
  
  getActivityStatus(): ActivityStatus {
    // switch文による網羅的判定
  }
}
```

### Result型によるエラー値化

```typescript
// 例外を投げる代わりに、エラーも型の一部として表現
function updateCaptureState(): Result<void, ValidationError> {
  // すべての失敗ケースが型で表現される
}
```

## ペインとの関係（集約設計）

### なぜPaneが集約ルートなのか

1. **一意性の保証**: tmux内でPaneIDは絶対的に一意
2. **状態の一貫性**: capture状態とWorkerStatusは同一ペインの異なる側面
3. **ビジネス不変条件**: 「稼働中ペインへのタスク割当禁止」などの制約
4. **操作の原子性**: capture状態更新→WorkerStatus更新は分割不可

### 集約境界

```typescript
class Pane {
  // 境界内：ペインの本質的属性
  private _captureState: CaptureState | null;
  private _previousCaptureContent: string | null;
  private _status: WorkerStatus;
  
  // 境界外：技術的関心事
  // - tmuxコマンド実行
  // - ネットワーク通信
  // - ファイルI/O
}
```

## ビジネスルール

### 1. capture状態によるWorkerStatus自動更新

```typescript
switch (activityStatus.kind) {
  case "WORKING":
    newWorkerStatus = { kind: "WORKING", details: "Activity detected" };
    break;
  case "IDLE":
    newWorkerStatus = { kind: "IDLE" };
    break;
  case "NOT_EVALUATED":
    // 既存ステータス維持
    break;
}
```

### 2. タスク利用可能性判定

**条件**: `IDLE` かつ `EMPTY` の場合のみ利用可能

```typescript
isAvailableForNewTask(): boolean {
  return this.activityStatus.kind === "IDLE" && 
         this.inputStatus.kind === "EMPTY";
}
```

### 3. 不変条件

- capture状態は一度設定されると、必ず前回コンテンツを保持する
- INPUT観点の評価には最低3行のcapture内容が必要
- STATUS観点の初回評価は常に`NOT_EVALUATED`

## 実装パターン

### パターン1: 段階的評価

```typescript
// 1. STATUS観点の評価
const statusComparison = StatusComparison.create(previous, current);

// 2. INPUT観点の評価  
const inputFieldState = InputFieldState.create(captureLines);

// 3. 統合capture状態の作成
const captureState = CaptureState.create(statusComparison, inputFieldState);
```

### パターン2: エラーの伝播

```typescript
// Result型チェーンによる早期return
if (!statusComparisonResult.ok) {
  return { ok: false, error: statusComparisonResult.error };
}
if (!inputFieldStateResult.ok) {
  return { ok: false, error: inputFieldStateResult.error };
}
```

### パターン3: 状態の網羅

```typescript
// switch文による全ケース処理（defaultが不要）
switch (activityStatus.kind) {
  case "WORKING": /* ... */ break;
  case "IDLE": /* ... */ break;
  case "NOT_EVALUATED": /* ... */ break;
  // ↑ コンパイラが網羅性を保証
}
```

## 実装例

### 基本的な使用方法

```typescript
// 1. ペインの作成
const paneResult = Pane.create(paneId, false, "shell", "Terminal");

// 2. capture状態の更新
const updateResult = pane.updateCaptureState(
  "current screen content",
  ["╭─────╮", "│ >   │", "╰─────╯"]
);

// 3. 利用可能性の確認
if (pane.isAvailableForNewTask()) {
  // 新しいタスクを割り当て可能
}

// 4. 状態サマリーの取得
const summary = pane.getCaptureStateSummary();
console.log(`Activity: ${summary?.activity}, Input: ${summary?.input}`);
```

### 高度な使用例

```typescript
// イベント駆動での状態管理
class MonitoringService {
  async processCapture(paneId: string): Promise<void> {
    const captureResult = await this.tmuxRepository.captureContent(paneId);
    if (!captureResult.ok) return;
    
    const lines = captureResult.data.split('\n');
    const updateResult = pane.updateCaptureState(captureResult.data, lines);
    
    if (updateResult.ok && pane.isAvailableForNewTask()) {
      await this.taskAssignmentService.assignNewTask(pane);
    }
  }
}
```

## 品質保証

### テスト観点

1. **StatusComparison**: 初回/変化あり/変化なしの各ケース
2. **InputFieldState**: 空白/入力あり/入力欄なし/パースエラーの各ケース  
3. **CaptureState**: 2つの観点の統合が正しく動作するか
4. **Pane統合**: capture状態がWorkerStatusに正しく反映されるか

### エラーハンドリング

- すべてのエラーはResult型で表現され、例外は使用しない
- 各バリデーションエラーには具体的な制約違反内容を含める
- ビジネスルール違反は専用のエラー種別で分類

## 拡張性

### 新しい観点の追加

現在の2観点（STATUS、INPUT）に加えて、新しい観点を追加する場合：

1. 新しい値オブジェクトを定義
2. CaptureStateに統合
3. switch文を拡張（コンパイラが未対応箇所を検出）

### 判定ロジックの変更

- 各値オブジェクトは独立しているため、一つの観点の変更が他に影響しない
- Smart Constructorパターンにより、制約変更時の影響範囲が明確

## 参考資料

- [ドメイン駆動設計仕様](./domain_driven_design.md)
- [全域性原則](./totality.ja.md)
- [実装テスト](../src/tests/capture_state_test.ts)
