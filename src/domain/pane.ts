/**
 * Pane集約ルート
 *
 * DDDドキュメントの設計原則に基づく中核ドメイン概念。
 * tmuxにおける「作業の最小単位」として、Claude Codeの稼働状態を
 * 観測・制御する境界そのものを表現する。
 */

import type { Result, ValidationError } from "../core/types.ts";
import { createError } from "../core/types.ts";
import { WorkerStatusParser } from "../core/models.ts";
import { WORKER_STATUS_TYPES } from "../core/config.ts";
import { type CaptureState, PaneId, type PaneName } from "./value_objects.ts";
import type { WorkerStatus } from "../core/models.ts";
import type {
  ClearOperationResult,
  ClearStrategy,
  ClearVerificationResult,
  PaneClearService,
} from "./clear_domain.ts";

// =============================================================================
// インターフェース定義
// =============================================================================

/**
 * tmuxリポジトリインターフェース（イベント駆動アーキテクチャ用）
 */
export interface ITmuxRepository {
  getTitle(paneId: string): Promise<Result<string, Error>>;
}

/**
 * ペイン更新結果（完了報告）
 */
export interface PaneUpdateResult {
  readonly paneId: string;
  readonly statusChanged: boolean;
  readonly oldStatus: string;
  readonly newStatus: string;
  readonly titleChanged: boolean;
  readonly oldTitle: string;
  readonly newTitle: string;
  readonly updatedAt: Date;
  readonly captureStateSummary: {
    activity: string;
    input: string;
    timestamp: string;
    available: boolean;
  } | null;
}

// =============================================================================
// Pane集約ルート - 業務の最小単位
// =============================================================================

/**
 * ペインの履歴エントリ
 */
export interface PaneHistoryEntry {
  readonly timestamp: Date;
  readonly status: WorkerStatus;
  readonly title: string;
  readonly command: string;
}

/**
 * ペインの不変条件
 */
export interface PaneInvariants {
  /** PaneIDはtmux形式（%\d+）でなければならない */
  readonly validPaneId: boolean;
  /** ステータス遷移は定義されたルールに従う */
  readonly validStatusTransition: boolean;
  /** 履歴は最大2件まで保持 */
  readonly historyWithinLimit: boolean;
  /** アクティブペインは1セッションに1つのみ */
  readonly uniqueActivePane: boolean;
}

/**
 * Pane集約ルート
 *
 * DDDの集約ルートとして、ペインの一貫性と不変条件を保証する。
 * すべてのペイン操作はこのクラスを通じて行われる。
 *
 * 【なぜPaneが集約ルートなのか】:
 * 1. 一意性の保証: tmux内でPaneIDは絶対的に一意
 * 2. 状態の一貫性: タイトル・ステータス・履歴・名前は同一ペインの異なる側面
 * 3. ビジネス不変条件: 稼働中ペインへのタスク割当禁止など
 * 4. 操作の原子性: ステータス変更→タイトル更新→履歴記録は分割不可
 *
 * @example
 * ```typescript
 * const result = Pane.create(
 *   PaneId.create("%1").data!,
 *   true,
 *   "vim",
 *   "Editor"
 * );
 * if (result.ok) {
 *   const pane = result.data;
 *   pane.updateStatus({ kind: "WORKING" });
 * }
 * ```
 */
export class Pane {
  private readonly _id: PaneId;
  private _isActive: boolean;
  private _currentCommand: string;
  private _title: string;
  private _status: WorkerStatus;
  private _name: PaneName | null;
  private readonly _history: PaneHistoryEntry[];
  private readonly _createdAt: Date;

  // Capture状態管理
  private _captureState: CaptureState | null;
  private _previousCaptureContent: string | null;

  private constructor(
    id: PaneId,
    isActive: boolean,
    currentCommand: string,
    title: string,
    status: WorkerStatus = { kind: "UNKNOWN" },
    name: PaneName | null = null,
  ) {
    this._id = id;
    this._isActive = isActive;
    this._currentCommand = currentCommand;
    this._title = title;
    this._status = status;
    this._name = name;
    this._history = [];
    this._createdAt = new Date();

    // Capture状態の初期化
    this._captureState = null;
    this._previousCaptureContent = null;
  }

  /**
   * Smart Constructor - 制約付きペイン作成
   */
  static create(
    id: PaneId,
    isActive: boolean,
    currentCommand: string,
    title: string,
    status?: WorkerStatus,
    name?: PaneName,
  ): Result<Pane, ValidationError & { message: string }> {
    // 制約1: 基本的な値の検証
    if (!currentCommand || currentCommand.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: currentCommand,
          constraint: "Pane command cannot be empty",
        }),
      };
    }

    if (!title || title.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: title,
          constraint: "Pane title cannot be empty",
        }),
      };
    }

    const pane = new Pane(
      id,
      isActive,
      currentCommand.trim(),
      title.trim(),
      status,
      name || null,
    );

    // 制約2: 不変条件の検証
    const invariants = pane.checkInvariants();
    if (!invariants.validPaneId) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: id.value,
          constraint: "Invalid pane ID format",
        }),
      };
    }

    return { ok: true, data: pane };
  }

  /**
   * ファクトリーメソッド - 既存tmuxペインからの作成
   */
  static fromTmuxData(
    paneId: string,
    isActive: boolean,
    command: string,
    title: string,
  ): Result<Pane, ValidationError & { message: string }> {
    // PaneIdの作成
    const paneIdResult = PaneId.create(paneId);
    if (!paneIdResult.ok) {
      return {
        ok: false,
        error: paneIdResult.error,
      };
    }

    // タイトルから初期状態を解析
    const statusFromTitle = Pane.extractStatusFromTitleStatic(title || "");

    // Pane作成（初期状態付き）
    return Pane.create(
      paneIdResult.data,
      isActive,
      command || "unknown",
      title || "untitled",
      statusFromTitle,
    );
  }

  // =============================================================================
  // ゲッター（読み取り専用アクセス）
  // =============================================================================

  get id(): PaneId {
    return this._id;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get currentCommand(): string {
    return this._currentCommand;
  }

  get title(): string {
    return this._title;
  }

  get status(): WorkerStatus {
    return this._status;
  }

  get name(): PaneName | null {
    return this._name;
  }

  get history(): readonly PaneHistoryEntry[] {
    return [...this._history];
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get captureState(): CaptureState | null {
    return this._captureState;
  }

  get previousCaptureContent(): string | null {
    return this._previousCaptureContent;
  }

  // =============================================================================
  // ドメインロジック（ビジネスルールの実装）
  // =============================================================================

  /**
   * ステータス更新（ビジネスルール適用）
   */
  updateStatus(
    newStatus: WorkerStatus,
  ): Result<void, ValidationError & { message: string }> {
    // ビジネスルール0: キャプチャ不十分によるUNKNOWN状態の場合、既存ステータスを維持
    if (newStatus.kind === "UNKNOWN" && this._status.kind !== "UNKNOWN") {
      // 既存のステータスがUNKNOWN以外の場合、キャプチャ不十分でもステータスを維持
      return { ok: true, data: undefined };
    }

    // ビジネスルール1: ステータス遷移の検証
    if (!this.isValidStatusTransition(this._status, newStatus)) {
      return {
        ok: false,
        error: createError({
          kind: "BusinessRuleViolation",
          rule: "ValidStatusTransition",
          context:
            `Invalid status transition from ${this._status.kind} to ${newStatus.kind}`,
        }),
      };
    }

    // 履歴への記録（最大2件まで）
    this.addToHistory(this._status, this._title, this._currentCommand);

    // ステータス更新
    this._status = newStatus;

    return { ok: true, data: undefined };
  }

  /**
   * タイトル更新
   */
  updateTitle(
    newTitle: string,
  ): Result<void, ValidationError & { message: string }> {
    if (!newTitle || newTitle.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: newTitle,
          constraint: "Title cannot be empty",
        }),
      };
    }

    this._title = newTitle.trim();
    return { ok: true, data: undefined };
  }

  /**
   * ペイン名の設定
   */
  assignName(
    name: PaneName,
  ): Result<void, ValidationError & { message: string }> {
    // ビジネスルール: アクティブペインはmanager役割を持つべき
    if (this._isActive && !name.isManager()) {
      return {
        ok: false,
        error: createError({
          kind: "BusinessRuleViolation",
          rule: "ActivePaneManagerRole",
          context: "Active pane should have manager role",
        }),
      };
    }

    this._name = name;
    return { ok: true, data: undefined };
  }

  /**
   * コマンド更新
   */
  updateCommand(
    newCommand: string,
  ): Result<void, ValidationError & { message: string }> {
    if (!newCommand || newCommand.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: newCommand,
          constraint: "Command cannot be empty",
        }),
      };
    }

    this._currentCommand = newCommand.trim();
    return { ok: true, data: undefined };
  }

  /**
   * アクティブ状態の変更
   */
  setActive(active: boolean): void {
    this._isActive = active;
  }

  // =============================================================================
  // ビジネスルールの実装
  // =============================================================================

  /**
   * ステータス遷移の妥当性検証
   */
  private isValidStatusTransition(
    from: WorkerStatus,
    to: WorkerStatus,
  ): boolean {
    // 許可される遷移パターンの定義
    const allowedTransitions: Record<string, string[]> = {
      "UNKNOWN": [
        "UNKNOWN",
        "IDLE",
        "WORKING",
        "BLOCKED",
        "DONE",
        "TERMINATED",
      ], // UNKNOWN -> UNKNOWN を許可
      "IDLE": ["IDLE", "WORKING", "BLOCKED", "TERMINATED"], // IDLE -> IDLE を許可
      "WORKING": ["WORKING", "IDLE", "DONE", "BLOCKED", "TERMINATED"], // WORKING -> WORKING を許可
      "BLOCKED": ["BLOCKED", "IDLE", "WORKING", "TERMINATED"], // BLOCKED -> BLOCKED を許可
      "DONE": ["DONE", "IDLE", "WORKING", "TERMINATED"], // DONE -> TERMINATED を許可（エラー検出時）
      "TERMINATED": ["TERMINATED", "IDLE", "WORKING"], // 復活可能、TERMINATED -> TERMINATED を許可
    };

    const allowedTargets = allowedTransitions[from.kind] || [];
    return allowedTargets.includes(to.kind);
  }

  /**
   * 履歴への追加（最大2件制限）
   */
  private addToHistory(
    status: WorkerStatus,
    title: string,
    command: string,
  ): void {
    const entry: PaneHistoryEntry = {
      timestamp: new Date(),
      status,
      title,
      command,
    };

    this._history.push(entry);

    // 最大2件まで保持
    if (this._history.length > 2) {
      this._history.shift();
    }
  }

  /**
   * 不変条件の検証
   */
  private checkInvariants(): PaneInvariants {
    return {
      validPaneId: this._id.value.match(/^%\d+$/) !== null,
      validStatusTransition: true, // 実際には前回のステータスと比較
      historyWithinLimit: this._history.length <= 2,
      uniqueActivePane: true, // 外部で検証（セッション単位）
    };
  }

  // =============================================================================
  // 問い合わせメソッド
  // =============================================================================

  /**
   * アイドル状態かどうか
   */
  isIdle(): boolean {
    return this._status.kind === "IDLE";
  }

  /**
   * 作業中かどうか
   */
  isWorking(): boolean {
    return this._status.kind === "WORKING";
  }

  /**
   * 作業完了かどうか
   */
  isDone(): boolean {
    return this._status.kind === "DONE";
  }

  /**
   * 終了状態かどうか
   */
  isTerminated(): boolean {
    return this._status.kind === "TERMINATED";
  }

  /**
   * タスク割当可能かどうか（重要なビジネスルール）
   */
  canAssignTask(): boolean {
    return this.isIdle() && this._isActive === false;
  }

  /**
   * 監視対象かどうか
   */
  shouldBeMonitored(): boolean {
    return !this.isTerminated() && !this._isActive;
  }

  /**
   * worker役割かどうか
   */
  isWorkerRole(): boolean {
    return this._name?.isWorker() || false;
  }

  /**
   * clear処理の対象かどうか
   * worker役割のペインのみがclear対象
   */
  shouldBeClearedWhenIdle(): boolean {
    return this.isWorkerRole() && (this.isIdle() || this.isDone());
  }

  // =============================================================================
  // 等価性とハッシュ
  // =============================================================================

  /**
   * 等価性チェック（IDベース）
   */
  equals(other: Pane): boolean {
    return this._id.equals(other._id);
  }

  /**
   * ハッシュコード
   */
  hashCode(): string {
    return this._id.value;
  }

  /**
   * 文字列表現
   */
  toString(): string {
    const nameStr = this._name ? ` [${this._name.value}]` : "";
    return `Pane(${this._id.value}${nameStr}, ${this._status.kind}, active: ${this._isActive})`;
  }

  // =============================================================================
  // レガシーコードとの互換性（段階的移行用）
  // =============================================================================

  /**
   * 旧Pane APIとの互換性メソッド
   */
  getCommand(): string | null {
    return this._currentCommand;
  }

  getTitle(): string | null {
    return this._title;
  }

  /**
   * 自己状態更新 - ペイン自身がタイトルから状態を判定
   *
   * tmuxコマンドでタイトルを取得し、自分で状態を判定します。
   * 外部からはタイミングのキックのみを受けます。
   */
  async refreshStatusFromTmux(
    commandExecutor: {
      executeTmuxCommand(cmd: string[]): Promise<Result<string, Error>>;
    },
  ): Promise<Result<boolean, ValidationError & { message: string }>> {
    try {
      // tmuxからこのペインのタイトルを取得
      const titleResult = await commandExecutor.executeTmuxCommand([
        "display-message",
        "-p",
        "-t",
        this._id.value,
        "#{pane_title}",
      ]);

      if (!titleResult.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux display-message -p -t ${this._id.value}`,
            stderr: titleResult.error.message,
          }, `Failed to get pane title: ${titleResult.error.message}`),
        };
      }

      const newTitle = titleResult.data.trim();
      const oldStatus = this._status.kind;

      // タイトルから状態を抽出
      const newStatus = this.extractStatusFromTitle(newTitle);

      // タイトルと状態を更新
      this._title = newTitle;
      this._status = newStatus;

      // 状態変更があったかどうかを返す
      const hasChanged = oldStatus !== newStatus.kind;

      if (hasChanged) {
        console.log(
          `🔄 Pane ${this._id.value}: ${oldStatus} → ${newStatus.kind} (title: "${newTitle}")`,
        );
      }

      return { ok: true, data: hasChanged };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "refreshStatusFromTmux",
          details: `${error}`,
        }, `Unexpected error during status refresh: ${error}`),
      };
    }
  }

  /**
   * イベント駆動アーキテクチャ - ペインの自己状態更新（統合版）
   *
   * ドメイン境界内の情報を、ペイン自身の責務で更新する。
   * 全域性原則に基づき、すべての状態変更は型安全に実行される。
   *
   * 【新機能】: tmuxコンテンツキャプチャによる実際のIDLE/WORKING判定を統合
   *
   * @param tmuxRepository - tmuxからの最新情報取得インターフェース
   * @param captureDetectionService - キャプチャ内容比較サービス（オプション）
   * @returns 更新結果とともに完了報告
   */
  async handleRefreshEvent(
    tmuxRepository: ITmuxRepository,
    captureDetectionService?:
      import("./capture_detection_service.ts").CaptureDetectionService,
  ): Promise<Result<PaneUpdateResult, ValidationError & { message: string }>> {
    try {
      const oldStatus = this._status;
      const oldTitle = this._title;
      let statusChanged = false;
      let titleChanged = false;
      let captureDetectionResult:
        | import("./capture_detection_service.ts").CaptureDetectionResult
        | null = null;

      // 方式1: キャプチャ内容比較による判定（優先）
      if (captureDetectionService) {
        const detectionResult = await captureDetectionService.detectChanges(
          this._id.value,
          [this._title, this._currentCommand], // コンテキストヒント
        );

        if (detectionResult.ok) {
          captureDetectionResult = detectionResult.data;

          // CaptureDetectionServiceの結果を使用してステータス更新
          const updateResult = this.updateCaptureStateFromDetection(
            captureDetectionResult,
          );
          if (updateResult.ok) {
            statusChanged = !WorkerStatusParser.isEqual(
              oldStatus,
              this._status,
            );
            console.log(
              `🔍 Pane ${this._id.value}: Capture-based status ${oldStatus.kind} → ${this._status.kind} (${
                captureDetectionResult.hasContentChanged
                  ? "content changed"
                  : "no change"
              })`,
            );
          } else {
            console.warn(
              `Failed to apply capture detection results for pane ${this._id.value}: ${updateResult.error.message}`,
            );
          }
        } else {
          console.warn(
            `Capture detection failed for pane ${this._id.value}: ${detectionResult.error.message}, falling back to title-based detection`,
          );
        }
      }

      // 方式2: タイトルベース判定（フォールバック、またはキャプチャサービス未使用時）
      if (!captureDetectionService || !captureDetectionResult) {
        // タイトル情報の取得
        const titleResult = await tmuxRepository.getTitle(this._id.value);
        if (!titleResult.ok) {
          return {
            ok: false,
            error: createError({
              kind: "CommunicationFailed",
              target: `pane ${this._id.value}`,
              details: `Failed to get title: ${titleResult.error.message}`,
            }, `Failed to get title for pane ${this._id.value}`),
          };
        }

        // タイトルから新しい状態を抽出
        const newStatus = this.extractStatusFromTitle(titleResult.data);
        statusChanged = !WorkerStatusParser.isEqual(oldStatus, newStatus);
        titleChanged = titleResult.data !== oldTitle;

        // ドメイン境界内での状態更新
        if (statusChanged || titleChanged) {
          this._status = newStatus;
          this._title = titleResult.data;

          // 履歴の追加（不変条件: 最大2件まで）
          this.addToHistory(newStatus, titleResult.data, this._currentCommand);

          console.log(
            `📋 Pane ${this._id.value}: Title-based status ${oldStatus.kind} → ${newStatus.kind} (title: "${titleResult.data}")`,
          );
        }
      } else {
        // キャプチャベース判定が成功した場合でも、タイトルの更新は必要
        const titleResult = await tmuxRepository.getTitle(this._id.value);
        if (titleResult.ok && titleResult.data !== oldTitle) {
          this._title = titleResult.data;
          titleChanged = true;
        }
      }

      // 完了報告として更新結果を返す
      return {
        ok: true,
        data: {
          paneId: this._id.value,
          statusChanged,
          oldStatus: WorkerStatusParser.toString(oldStatus),
          newStatus: WorkerStatusParser.toString(this._status),
          titleChanged,
          oldTitle,
          newTitle: this._title,
          updatedAt: new Date(),
          captureStateSummary: this.getCaptureStateSummary(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "handleRefreshEvent",
          details: `Unexpected error: ${error}`,
        }, `Unexpected error during pane refresh: ${error}`),
      };
    }
  }

  /**
   * 自己責任によるタイトルからの状態抽出
   * ペインの境界内で状態判定ロジックを実行
   */
  private extractStatusFromTitle(title: string): WorkerStatus {
    // 全域性原則: すべてのケースを型安全に処理
    for (const statusType of WORKER_STATUS_TYPES) {
      if (title.toLowerCase().includes(statusType.toLowerCase())) {
        const status = WorkerStatusParser.parse(statusType);
        return status;
      }
    }

    // デフォルト状態（型安全性保証）
    return { kind: "UNKNOWN" };
  }

  /**
   * 静的ヘルパー: タイトルから状態を抽出
   * fromTmuxData静的メソッドから使用するため
   */
  private static extractStatusFromTitleStatic(title: string): WorkerStatus {
    // 全域性原則: すべてのケースを型安全に処理
    for (const statusType of WORKER_STATUS_TYPES) {
      if (title.toLowerCase().includes(statusType.toLowerCase())) {
        const status = WorkerStatusParser.parse(statusType);
        return status;
      }
    }

    // デフォルト状態（型安全性保証）
    return { kind: "UNKNOWN" };
  }

  /**
   * Capture状態の更新（統合版）
   *
   * 新しい統合CaptureDetectionServiceを使用して
   * capture状態を更新する。既存の分散実装を置き換え。
   *
   * @param captureDetectionResult - 統合検出結果
   * @returns 更新結果
   */
  updateCaptureStateFromDetection(
    captureDetectionResult:
      import("./capture_detection_service.ts").CaptureDetectionResult,
  ): Result<void, ValidationError & { message: string }> {
    // 統合結果からcapture状態を更新
    this._captureState = captureDetectionResult.captureState;
    this._previousCaptureContent = captureDetectionResult.previousContent;

    // 導出されたWorkerStatusを適用
    const statusUpdateResult = this.updateStatus(
      captureDetectionResult.derivedWorkerStatus,
    );
    if (!statusUpdateResult.ok) {
      // ステータス更新に失敗した場合はログに記録するが、
      // capture状態の更新自体は成功とする
      console.warn(
        `Failed to update worker status for pane ${this._id.value}:`,
        statusUpdateResult.error.message,
        `\nDerivation: ${
          captureDetectionResult.derivationReasoning.join(", ")
        }`,
      );
    }

    return { ok: true, data: undefined };
  }

  /**
   * ペインが新しいタスクに利用可能かを判定
   *
   * @returns 利用可能性
   */
  isAvailableForNewTask(): boolean {
    if (!this._captureState) {
      return false; // capture状態未評価の場合は利用不可
    }

    return this._captureState.isAvailableForNewTask();
  }

  /**
   * Capture状態のサマリー取得（デバッグ・表示用）
   */
  getCaptureStateSummary(): {
    activity: string;
    input: string;
    timestamp: string;
    available: boolean;
  } | null {
    if (!this._captureState) {
      return null;
    }

    const summary = this._captureState.getSummary();
    return {
      ...summary,
      available: this.isAvailableForNewTask(),
    };
  }

  /**
   * Determines if this pane should be cleared based on its status.
   *
   * According to requirements, only DONE and IDLE panes should be cleared.
   * Following DDD principles, this business rule is encapsulated within the aggregate.
   *
   * @returns boolean - true if pane should be cleared
   */
  shouldBeCleared(): boolean {
    return this._status.kind === "DONE" || this._status.kind === "IDLE";
  }

  /**
   * Clear this pane using the provided clear service.
   *
   * This method delegates the actual clearing to the infrastructure layer
   * while maintaining domain logic about when and how clearing should occur.
   * The aggregate maintains its boundary by controlling the clearing process.
   *
   * @param clearService - The service to perform the actual clearing
   * @param strategy - The clearing strategy to use
   * @returns Promise<ClearOperationResult> - The result of the clear operation
   */
  async clearSelf(
    clearService: PaneClearService,
    strategy: ClearStrategy,
  ): Promise<ClearOperationResult> {
    // Business rule: Only clear if the pane should be cleared
    if (!this.shouldBeCleared()) {
      return {
        kind: "Skipped",
        paneId: this._id.value,
        reason:
          `Pane status is ${this._status.kind}, not in clearable state (DONE/IDLE)`,
      };
    }

    return await clearService.clearPane(this._id.value, strategy);
  }

  /**
   * Verify if this pane is properly cleared.
   *
   * @param clearService - The service to perform the verification
   * @returns Promise<ClearVerificationResult> - The verification result
   */
  async verifyClearState(
    clearService: PaneClearService,
  ): Promise<ClearVerificationResult> {
    return await clearService.verifyClearState(this._id.value);
  }

  // =============================================================================
  // イベント駆動メソッド - Paneが自分自身で何をするべきか知っている
  // =============================================================================

  /**
   * 自身の30秒サイクル処理を実行
   *
   * Paneが自分自身で何をするべきかを知っている状態を実現。
   * 各ペインは自身の状態に応じて適切なアクションを決定する。
   */
  async processCycleEvent(
    eventDispatcher: import("./events.ts").EventDispatcher,
    tmuxRepository?: ITmuxRepository,
  ): Promise<void> {
    const { DomainEventFactory } = await import("./events.ts");

    // 1. 自身の状態に応じたEnter送信判定
    if (this.shouldSendEnter()) {
      const enterEvent = DomainEventFactory.createPaneEnterSendRequestedEvent(
        this._id.value,
        this.determineEnterReason(),
      );
      await eventDispatcher.dispatch(enterEvent);
    }

    // 2. 自身のクリア必要性判定
    if (this.shouldBeCleared()) {
      const clearEvent = DomainEventFactory.createPaneClearRequestedEvent(
        this._id.value,
        this._status.kind === "IDLE" ? "IDLE_STATE" : "DONE_STATE",
        "CLEAR_COMMAND",
      );
      await eventDispatcher.dispatch(clearEvent);
    }

    // 3. タイトル更新が必要か判定
    if (tmuxRepository && this.shouldUpdateTitle()) {
      await this.updateTitleIfNeeded(tmuxRepository, eventDispatcher);
    }

    // 4. キャプチャ状態更新イベント発行（状態が変更されている場合）
    if (this._captureState) {
      const summary = this.getCaptureStateSummary();
      if (summary) {
        const captureEvent = DomainEventFactory
          .createPaneCaptureStateUpdatedEvent(
            this._id.value,
            summary.activity as "WORKING" | "IDLE" | "NOT_EVALUATED",
            summary.input as
              | "EMPTY"
              | "HAS_INPUT"
              | "NO_INPUT_FIELD"
              | "PARSE_ERROR",
            summary.available,
          );
        await eventDispatcher.dispatch(captureEvent);
      }
    }
  }

  /**
   * Enter送信が必要かを判定
   */
  private shouldSendEnter(): boolean {
    // 非アクティブペインで、IDLE状態またはINPUT欄が空の場合
    return !this._isActive &&
      (this._status.kind === "IDLE" || this.hasEmptyInput());
  }

  /**
   * Enter送信の理由を決定
   */
  private determineEnterReason():
    | "REGULAR_CYCLE"
    | "INPUT_COMPLETION"
    | "COMMAND_EXECUTION" {
    if (this._status.kind === "IDLE") {
      return "INPUT_COMPLETION";
    }
    if (this.hasEmptyInput()) {
      return "COMMAND_EXECUTION";
    }
    return "REGULAR_CYCLE";
  }

  /**
   * 入力欄が空かどうかを判定
   */
  private hasEmptyInput(): boolean {
    const summary = this.getCaptureStateSummary();
    return summary?.input === "EMPTY";
  }

  /**
   * タイトル更新が必要かを判定
   */
  private shouldUpdateTitle(): boolean {
    // ステータスが変更された場合、または定期更新が必要な場合
    return this._status.kind !== "UNKNOWN";
  }

  /**
   * 必要に応じてタイトルを更新
   */
  private async updateTitleIfNeeded(
    tmuxRepository: ITmuxRepository,
    eventDispatcher: import("./events.ts").EventDispatcher,
  ): Promise<void> {
    try {
      const currentTitleResult = await tmuxRepository.getTitle(this._id.value);
      if (currentTitleResult.ok) {
        const currentTitle = currentTitleResult.data;
        const expectedTitle = this.generateExpectedTitle();

        if (currentTitle !== expectedTitle) {
          const oldTitle = this._title;
          this._title = expectedTitle;

          const { DomainEventFactory } = await import("./events.ts");
          const titleEvent = DomainEventFactory.createPaneTitleChangedEvent(
            this._id.value,
            oldTitle,
            expectedTitle,
          );
          await eventDispatcher.dispatch(titleEvent);
        }
      }
    } catch (error) {
      // タイトル更新エラーは非致命的なので、ログ出力のみ
      console.warn(
        `Failed to update title for pane ${this._id.value}: ${error}`,
      );
    }
  }

  /**
   * 期待されるタイトルを生成
   */
  private generateExpectedTitle(): string {
    const statusIcon = this.getStatusIcon();
    const roleName = this._name?.value || "unknown";
    return `${statusIcon} ${roleName} | ${this._status.kind}`;
  }

  /**
   * ステータスに応じたアイコンを取得
   */
  private getStatusIcon(): string {
    switch (this._status.kind) {
      case "WORKING":
        return "🔄";
      case "IDLE":
        return "⏸️";
      case "DONE":
        return "✅";
      case "BLOCKED":
        return "🚫";
      case "TERMINATED":
        return "❌";
      case "UNKNOWN":
        return "❓";
      default:
        return "❓";
    }
  }

  /**
   * ステータス変更時のイベント発行を含む更新
   */
  async updateStatusWithEvent(
    newStatus: WorkerStatus,
    eventDispatcher: import("./events.ts").EventDispatcher,
    changedBy: "monitoring-cycle" | "manual" | "system" = "monitoring-cycle",
  ): Promise<void> {
    const oldStatus = this._status;

    // 既存のupdateStatusを呼び出し
    this.updateStatus(newStatus);

    // ステータス変更イベントを発行
    const { DomainEventFactory } = await import("./events.ts");
    const statusEvent = DomainEventFactory.createPaneStatusChangedEvent(
      this._id.value,
      oldStatus,
      newStatus,
      changedBy,
    );
    await eventDispatcher.dispatch(statusEvent);
  }

  // ...existing code...
}
