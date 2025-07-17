/**
 * ドメイン値オブジェクト定義
 *
 * DDDドキュメントの設計原則に基づいた値オブジェクトの実装
 * - 不変性の保証
 * - Smart Constructorによる制約の強制
 * - Result型による失敗の明示的表現
 */

import {
  createError,
  type Result,
  type ValidationError,
} from "../core/types.ts";

// =============================================================================
// PaneId値オブジェクト - tmuxシステムのペイン識別子
// =============================================================================

/**
 * PaneId値オブジェクト
 *
 * tmuxの仕様（%数字形式）に従った制約を型レベルで表現し、
 * 不正な値の流入を防ぐ。
 *
 * @example
 * ```typescript
 * const result = PaneId.create("%1");
 * if (result.ok) {
 *   console.log("Valid pane ID:", result.data.value);
 * }
 * ```
 */
export class PaneId {
  private constructor(private readonly _value: string) {}

  /**
   * Smart Constructor - tmux形式のペインIDを検証して作成
   */
  static create(
    value: string,
  ): Result<PaneId, ValidationError & { message: string }> {
    // 制約1: 空文字・null・undefinedの禁止
    if (!value || value.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }),
      };
    }

    // 制約2: tmux形式（%数字）の強制
    const trimmed = value.trim();
    if (!trimmed.match(/^%\d+$/)) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: trimmed,
          constraint:
            `PaneId must follow tmux format (%number), got: ${trimmed}`,
        }),
      };
    }

    return {
      ok: true,
      data: new PaneId(trimmed),
    };
  }

  /**
   * 値の取得（読み取り専用）
   */
  get value(): string {
    return this._value;
  }

  /**
   * 等価性チェック
   */
  equals(other: PaneId): boolean {
    return this._value === other._value;
  }

  /**
   * 文字列表現
   */
  toString(): string {
    return this._value;
  }
}

// =============================================================================
// PaneName値オブジェクト - ペインの役割を表現する業務識別子
// =============================================================================

/**
 * ペイン名の役割定義
 * Claude Codeの作業分類に基づく
 */
export type PaneRole = "manager" | "worker" | "secretary";

/**
 * PaneName値オブジェクト
 *
 * ペインの役割（manager、worker、secretary）を表現する業務上の識別子。
 * 運用上の命名規則を型で強制し、間違った分類を防ぐ。
 *
 * @example
 * ```typescript
 * const result = PaneName.create("worker-1");
 * if (result.ok) {
 *   console.log("Role:", result.data.role);
 * }
 * ```
 */
export class PaneName {
  private constructor(
    private readonly _value: string,
    private readonly _role: PaneRole,
  ) {}

  /**
   * Smart Constructor - パターンマッチによる役割の自動判定
   */
  static create(
    value: string,
  ): Result<PaneName, ValidationError & { message: string }> {
    // 制約1: 空文字の禁止
    if (!value || value.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }),
      };
    }

    const trimmed = value.trim().toLowerCase();

    // 制約2: 役割パターンの判定
    let role: PaneRole;
    if (trimmed === "main") {
      role = "manager"; // "main" is treated as a manager role for validation purposes
    } else if (trimmed.includes("manager") || trimmed.includes("mgr")) {
      role = "manager";
    } else if (trimmed.includes("worker") || trimmed.includes("work")) {
      role = "worker";
    } else if (trimmed.includes("secretary") || trimmed.includes("sec")) {
      role = "secretary";
    } else {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: trimmed,
          constraint:
            `PaneName must contain role indicator (main/manager/worker/secretary), got: ${trimmed}`,
        }),
      };
    }

    return {
      ok: true,
      data: new PaneName(value.trim(), role),
    };
  }

  /**
   * ペイン名の取得
   */
  get value(): string {
    return this._value;
  }

  /**
   * 役割の取得
   */
  get role(): PaneRole {
    return this._role;
  }

  /**
   * 管理者役割かどうか
   */
  isManager(): boolean {
    return this._role === "manager";
  }

  /**
   * 作業者役割かどうか
   */
  isWorker(): boolean {
    return this._role === "worker";
  }

  /**
   * 補助者役割かどうか
   */
  isSecretary(): boolean {
    return this._role === "secretary";
  }

  /**
   * 等価性チェック
   */
  equals(other: PaneName): boolean {
    return this._value === other._value && this._role === other._role;
  }

  /**
   * 文字列表現
   */
  toString(): string {
    return `${this._value} [${this._role}]`;
  }
}

// =============================================================================
// MonitoringCycle値オブジェクト - 監視業務の周期性と段階性
// =============================================================================

/**
 * 監視フェーズの定義
 */
export type MonitoringPhase =
  | "Discovery" // セッション発見
  | "Classification" // ペイン分類
  | "Tracking" // ステータス追跡
  | "Reporting"; // 報告

/**
 * MonitoringCycle値オブジェクト
 *
 * 監視業務の「周期性」と「段階性」を型で表現する。
 * 各フェーズの前提条件と失敗の分離を明確化。
 *
 * @example
 * ```typescript
 * const result = MonitoringCycle.create("Discovery", 30);
 * if (result.ok) {
 *   const nextPhase = result.data.getNextPhase();
 * }
 * ```
 */
export class MonitoringCycle {
  private constructor(
    private readonly _phase: MonitoringPhase,
    private readonly _intervalSeconds: number,
    private readonly _cycleCount: number = 0,
  ) {}

  /**
   * Smart Constructor - フェーズと間隔の検証
   */
  static create(
    phase: MonitoringPhase,
    intervalSeconds: number,
    cycleCount: number = 0,
  ): Result<MonitoringCycle, ValidationError & { message: string }> {
    // 制約1: 間隔の妥当性検証
    if (intervalSeconds <= 0) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: intervalSeconds.toString(),
          constraint:
            `Monitoring interval must be positive, got: ${intervalSeconds}`,
        }),
      };
    }

    // 制約2: サイクル数の妥当性検証
    if (cycleCount < 0) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: cycleCount.toString(),
          constraint: `Cycle count cannot be negative, got: ${cycleCount}`,
        }),
      };
    }

    return {
      ok: true,
      data: new MonitoringCycle(phase, intervalSeconds, cycleCount),
    };
  }

  /**
   * 現在のフェーズ取得
   */
  get phase(): MonitoringPhase {
    return this._phase;
  }

  /**
   * 監視間隔取得
   */
  get intervalSeconds(): number {
    return this._intervalSeconds;
  }

  /**
   * サイクル数取得
   */
  get cycleCount(): number {
    return this._cycleCount;
  }

  /**
   * 次のフェーズの取得
   */
  getNextPhase(): MonitoringPhase {
    switch (this._phase) {
      case "Discovery":
        return "Classification";
      case "Classification":
        return "Tracking";
      case "Tracking":
        return "Reporting";
      case "Reporting":
        return "Discovery"; // 新しいサイクルの開始
    }
  }

  /**
   * 次のサイクルへの遷移
   */
  advance(): Result<MonitoringCycle, ValidationError & { message: string }> {
    const nextPhase = this.getNextPhase();
    const nextCycleCount = nextPhase === "Discovery"
      ? this._cycleCount + 1
      : this._cycleCount;

    return MonitoringCycle.create(
      nextPhase,
      this._intervalSeconds,
      nextCycleCount,
    );
  }

  /**
   * フェーズの前提条件チェック
   */
  canProceedToNext(): boolean {
    // 各フェーズで必要な前提条件をチェック
    // 実際の実装では、外部の状態と連携する
    return true;
  }

  /**
   * 等価性チェック
   */
  equals(other: MonitoringCycle): boolean {
    return this._phase === other._phase &&
      this._intervalSeconds === other._intervalSeconds &&
      this._cycleCount === other._cycleCount;
  }

  /**
   * 文字列表現
   */
  toString(): string {
    return `MonitoringCycle(${this._phase}, ${this._intervalSeconds}s, cycle: ${this._cycleCount})`;
  }
}

// =============================================================================
// CaptureStatus値オブジェクト - ペインcapture状態の評価結果
// =============================================================================

/**
 * ペインの活動状況（STATUS観点）
 * 30秒ごとのcapture結果比較による判定
 */
export type ActivityStatus =
  | { kind: "WORKING" } // 変化あり：作業実行中
  | { kind: "IDLE" } // 変化なし：待機状態
  | { kind: "NOT_EVALUATED" }; // 初回など：評価不能

/**
 * ペインの入力欄状態（INPUT観点）
 * capture 3行の評価による判定
 */
export type InputFieldStatus =
  | { kind: "EMPTY" } // 入力欄が空白
  | { kind: "HAS_INPUT" } // 入力欄に文字あり
  | { kind: "NO_INPUT_FIELD" } // 入力欄が検出されない
  | { kind: "PARSE_ERROR"; reason: string }; // 解析失敗

/**
 * StatusComparison値オブジェクト
 *
 * 2つのcapture結果を比較し、変化の有無を判定する。
 * 初回や不正な状態では評価不能を明示的に表現。
 *
 * @example
 * ```typescript
 * const result = StatusComparison.create(
 *   previousCapture,
 *   currentCapture
 * );
 * if (result.ok) {
 *   const comparison = result.data;
 *   console.log("Activity:", comparison.getActivityStatus());
 * }
 * ```
 */
export class StatusComparison {
  private constructor(
    private readonly _previousContent: string | null,
    private readonly _currentContent: string,
    private readonly _hasChanges: boolean,
  ) {}

  /**
   * Smart Constructor - capture内容の比較
   */
  static create(
    previousContent: string | null,
    currentContent: string,
  ): Result<StatusComparison, ValidationError & { message: string }> {
    // 制約1: 現在のcapture内容は必須
    if (!currentContent || currentContent.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }),
      };
    }

    // 制約2: 比較可能性の確認
    const hasChanges = previousContent !== null
      ? previousContent !== currentContent
      : false; // 初回は変化なしとして扱う

    return {
      ok: true,
      data: new StatusComparison(previousContent, currentContent, hasChanges),
    };
  }

  /**
   * 活動状況の判定
   */
  getActivityStatus(): ActivityStatus {
    if (this._previousContent === null) {
      return { kind: "NOT_EVALUATED" };
    }
    return this._hasChanges ? { kind: "WORKING" } : { kind: "IDLE" };
  }

  /**
   * 現在のcapture内容取得
   */
  get currentContent(): string {
    return this._currentContent;
  }

  /**
   * 前回のcapture内容取得
   */
  get previousContent(): string | null {
    return this._previousContent;
  }

  /**
   * 変化有無
   */
  get hasChanges(): boolean {
    return this._hasChanges;
  }
}

/**
 * InputFieldState値オブジェクト
 *
 * capture 3行を評価し、入力欄の状態を判定する。
 * ╭─, │ >, ╰─ パターンによる空白判定を実装。
 *
 * @example
 * ```typescript
 * const result = InputFieldState.create(captureLines);
 * if (result.ok) {
 *   const inputState = result.data;
 *   console.log("Input status:", inputState.getStatus());
 * }
 * ```
 */
export class InputFieldState {
  private constructor(
    private readonly _captureLines: string[],
    private readonly _status: InputFieldStatus,
  ) {}

  /**
   * Smart Constructor - capture 3行からの入力欄状態判定
   */
  static create(
    captureLines: string[],
  ): Result<InputFieldState, ValidationError & { message: string }> {
    // 制約1: 3行以上必要
    if (!captureLines || captureLines.length < 3) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: `lines: ${captureLines?.length || 0}`,
          constraint: "At least 3 lines required for input field detection",
        }),
      };
    }

    // 入力欄パターンの検出と状態判定
    const status = InputFieldState._analyzeInputField(captureLines);

    return {
      ok: true,
      data: new InputFieldState(captureLines, status),
    };
  }

  /**
   * 入力欄の解析ロジック
   */
  private static _analyzeInputField(lines: string[]): InputFieldStatus {
    try {
      // 連続する3行を検索
      for (let i = 0; i <= lines.length - 3; i++) {
        const line1 = lines[i].trim();
        const line2 = lines[i + 1].trim();
        const line3 = lines[i + 2].trim();

        // パターン1: 入力欄の枠線検出
        if (
          line1.startsWith("╭") && line1.includes("─") &&
          line2.startsWith("│") && line2.endsWith("│") &&
          line3.startsWith("╰") && line3.includes("─")
        ) {
          // パターン2: 入力欄の空白判定
          // │ >     │ のような形式
          const middleContent = line2.substring(1, line2.length - 1).trim();
          if (middleContent === ">") {
            return { kind: "EMPTY" };
          } else if (middleContent.startsWith(">")) {
            return { kind: "HAS_INPUT" };
          }
        }
      }

      // 入力欄パターンが見つからない
      return { kind: "NO_INPUT_FIELD" };
    } catch (error) {
      return {
        kind: "PARSE_ERROR",
        reason: error instanceof Error ? error.message : "Unknown parse error",
      };
    }
  }

  /**
   * 入力欄状態の取得
   */
  getStatus(): InputFieldStatus {
    return this._status;
  }

  /**
   * capture行数
   */
  get lineCount(): number {
    return this._captureLines.length;
  }

  /**
   * 元のcapture行
   */
  get captureLines(): readonly string[] {
    return this._captureLines;
  }
}

/**
 * CaptureState値オブジェクト
 *
 * STATUS観点とINPUT観点を統合したcapture状態の評価結果。
 * ペインの総合的な状況判断に使用する。
 *
 * @example
 * ```typescript
 * const result = CaptureState.create(
 *   statusComparison,
 *   inputFieldState
 * );
 * if (result.ok) {
 *   const captureState = result.data;
 *   console.log("Overall state:", captureState.getSummary());
 * }
 * ```
 */
export class CaptureState {
  private constructor(
    private readonly _statusComparison: StatusComparison,
    private readonly _inputFieldState: InputFieldState,
    private readonly _evaluatedAt: Date,
  ) {}

  /**
   * Smart Constructor - 統合capture状態の作成
   */
  static create(
    statusComparison: StatusComparison,
    inputFieldState: InputFieldState,
  ): Result<CaptureState, ValidationError & { message: string }> {
    return {
      ok: true,
      data: new CaptureState(
        statusComparison,
        inputFieldState,
        new Date(),
      ),
    };
  }

  /**
   * STATUS観点の状態
   */
  get activityStatus(): ActivityStatus {
    return this._statusComparison.getActivityStatus();
  }

  /**
   * INPUT観点の状態
   */
  get inputStatus(): InputFieldStatus {
    return this._inputFieldState.getStatus();
  }

  /**
   * 評価時刻
   */
  get evaluatedAt(): Date {
    return this._evaluatedAt;
  }

  /**
   * 状態サマリー（ログ・表示用）
   */
  getSummary(): {
    activity: string;
    input: string;
    timestamp: string;
  } {
    const activity = this.activityStatus.kind;
    const input = this.inputStatus.kind;
    const timestamp = this._evaluatedAt.toISOString();

    return {
      activity,
      input,
      timestamp,
    };
  }

  /**
   * ペインが利用可能かの判定
   * IDLE状態かつ入力欄が空白の場合に利用可能とする
   */
  isAvailableForNewTask(): boolean {
    return this.activityStatus.kind === "IDLE" &&
      this.inputStatus.kind === "EMPTY";
  }

  /**
   * StatusComparison取得
   */
  get statusComparison(): StatusComparison {
    return this._statusComparison;
  }

  /**
   * InputFieldState取得
   */
  get inputFieldState(): InputFieldState {
    return this._inputFieldState;
  }
}

// =============================================================================
// StatusMapping値オブジェクト - ActivityStatusとWorkerStatusの統合
// =============================================================================

/**
 * ステータス判定のコンテキスト情報
 * capture内容から抽出される追加的な判定材料
 */
export interface StatusContext {
  readonly hasCompletionMarker: boolean;
  readonly completionMarker?: string;
  readonly hasErrorMarker: boolean;
  readonly errorMarker?: string;
  readonly isBlocked: boolean;
  readonly blockReason?: string;
  readonly workDetails?: string;
  readonly titleHints?: string[];
  readonly commandHints?: string[];
}

/**
 * StatusMapping値オブジェクト
 *
 * ActivityStatus（観測事実）からWorkerStatus（業務解釈）への
 * 変換ロジックを型安全に実装する。
 *
 * 【設計原則】:
 * - ActivityStatus: capture状態の客観的事実
 * - WorkerStatus: ビジネスロジックによる主観的解釈
 * - 階層化により、事実と解釈を分離
 *
 * @example
 * ```typescript
 * const mapping = StatusMapping.create(
 *   activityStatus,
 *   statusContext
 * );
 * if (mapping.ok) {
 *   const workerStatus = mapping.data.deriveWorkerStatus();
 * }
 * ```
 */
export class StatusMapping {
  private constructor(
    private readonly _activityStatus: ActivityStatus,
    private readonly _context: StatusContext,
  ) {}

  /**
   * Smart Constructor - 統合ステータス判定の作成
   */
  static create(
    activityStatus: ActivityStatus,
    context: StatusContext,
  ): Result<StatusMapping, ValidationError & { message: string }> {
    return {
      ok: true,
      data: new StatusMapping(activityStatus, context),
    };
  }

  /**
   * ActivityStatusからWorkerStatusへの変換
   *
   * 階層化されたステータス判定ロジック：
   * 1. 観測事実（ActivityStatus）を基準とする
   * 2. コンテキスト情報で詳細化する
   * 3. ビジネスルールを適用する
   */
  deriveWorkerStatus():
    | { kind: "IDLE" }
    | { kind: "WORKING"; details?: string }
    | { kind: "BLOCKED"; reason?: string }
    | { kind: "DONE"; result?: string }
    | { kind: "TERMINATED"; reason?: string }
    | { kind: "UNKNOWN"; lastKnownState?: string } {
    switch (this._activityStatus.kind) {
      case "NOT_EVALUATED":
        return {
          kind: "UNKNOWN",
          lastKnownState: "初回評価または判定不能",
        };

      case "IDLE":
        // IDLE状態の詳細判定
        if (this._context.hasCompletionMarker) {
          return {
            kind: "DONE",
            result: this._context.completionMarker || "作業完了",
          };
        }
        if (this._context.hasErrorMarker) {
          return {
            kind: "TERMINATED",
            reason: this._context.errorMarker || "エラーによる終了",
          };
        }
        return { kind: "IDLE" };

      case "WORKING":
        // WORKING状態の詳細判定
        if (this._context.isBlocked) {
          return {
            kind: "BLOCKED",
            reason: this._context.blockReason || "外部要因による停止",
          };
        }
        return {
          kind: "WORKING",
          details: this._context.workDetails || "作業実行中",
        };
    }
  }

  /**
   * 変換の根拠情報
   */
  getDerivationInfo(): {
    source: ActivityStatus;
    context: StatusContext;
    reasoning: string[];
  } {
    const reasoning: string[] = [];

    switch (this._activityStatus.kind) {
      case "NOT_EVALUATED":
        reasoning.push("初回またはcapture内容不十分により評価不能");
        break;
      case "IDLE":
        reasoning.push("capture内容に変化なし");
        if (this._context.hasCompletionMarker) {
          reasoning.push(`完了マーカー検出: ${this._context.completionMarker}`);
        }
        if (this._context.hasErrorMarker) {
          reasoning.push(`エラーマーカー検出: ${this._context.errorMarker}`);
        }
        break;
      case "WORKING":
        reasoning.push("capture内容に変化あり");
        if (this._context.isBlocked) {
          reasoning.push(`ブロック状態検出: ${this._context.blockReason}`);
        }
        break;
    }

    return {
      source: this._activityStatus,
      context: this._context,
      reasoning,
    };
  }

  /**
   * ActivityStatus取得
   */
  get activityStatus(): ActivityStatus {
    return this._activityStatus;
  }

  /**
   * StatusContext取得
   */
  get context(): StatusContext {
    return this._context;
  }
}

/**
 * StatusContextBuilder - コンテキスト情報の構築支援
 *
 * capture内容からStatusContextを構築するビルダーパターン。
 * 複雑な判定ロジックを段階的に組み立てる。
 *
 * @example
 * ```typescript
 * const context = StatusContextBuilder.create()
 *   .withCaptureContent(captureLines)
 *   .withTitleHints([title])
 *   .withCommandHints([command])
 *   .build();
 * ```
 */
export class StatusContextBuilder {
  private _hasCompletionMarker = false;
  private _completionMarker?: string;
  private _hasErrorMarker = false;
  private _errorMarker?: string;
  private _isBlocked = false;
  private _blockReason?: string;
  private _workDetails?: string;
  private _titleHints: string[] = [];
  private _commandHints: string[] = [];

  private constructor() {}

  /**
   * ビルダー作成
   */
  static create(): StatusContextBuilder {
    return new StatusContextBuilder();
  }

  /**
   * capture内容からの自動解析
   */
  withCaptureContent(captureLines: string[]): StatusContextBuilder {
    const content = captureLines.join("\n").toLowerCase();

    // 完了マーカーの検出
    const completionPatterns = [
      /completed?/,
      /finished?/,
      /done/,
      /success/,
      /✓/,
      /完了/,
      /終了/,
    ];
    for (const pattern of completionPatterns) {
      const match = content.match(pattern);
      if (match) {
        this._hasCompletionMarker = true;
        this._completionMarker = match[0];
        break;
      }
    }

    // エラーマーカーの検出
    const errorPatterns = [
      /error/,
      /failed?/,
      /exception/,
      /✗/,
      /❌/,
      /エラー/,
      /失敗/,
      /例外/,
    ];
    for (const pattern of errorPatterns) {
      const match = content.match(pattern);
      if (match) {
        this._hasErrorMarker = true;
        this._errorMarker = match[0];
        break;
      }
    }

    // ブロック状態の検出
    const blockPatterns = [
      /waiting/,
      /pending/,
      /blocked/,
      /paused/,
      /待機/,
      /停止/,
      /ブロック/,
    ];
    for (const pattern of blockPatterns) {
      const match = content.match(pattern);
      if (match) {
        this._isBlocked = true;
        this._blockReason = match[0];
        break;
      }
    }

    return this;
  }

  /**
   * タイトルヒントの追加
   */
  withTitleHints(hints: string[]): StatusContextBuilder {
    this._titleHints = [...hints];
    return this;
  }

  /**
   * コマンドヒントの追加
   */
  withCommandHints(hints: string[]): StatusContextBuilder {
    this._commandHints = [...hints];
    return this;
  }

  /**
   * 作業詳細の設定
   */
  withWorkDetails(details: string): StatusContextBuilder {
    this._workDetails = details;
    return this;
  }

  /**
   * StatusContext構築
   */
  build(): StatusContext {
    return {
      hasCompletionMarker: this._hasCompletionMarker,
      completionMarker: this._completionMarker,
      hasErrorMarker: this._hasErrorMarker,
      errorMarker: this._errorMarker,
      isBlocked: this._isBlocked,
      blockReason: this._blockReason,
      workDetails: this._workDetails,
      titleHints: this._titleHints,
      commandHints: this._commandHints,
    };
  }
}
