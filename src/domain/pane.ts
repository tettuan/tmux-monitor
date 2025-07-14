/**
 * Pane集約ルート
 *
 * DDDドキュメントの設計原則に基づく中核ドメイン概念。
 * tmuxにおける「作業の最小単位」として、Claude Codeの稼働状態を
 * 観測・制御する境界そのものを表現する。
 */

import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";
import { PaneId, type PaneName } from "./value_objects.ts";
import type { WorkerStatus } from "../models.ts";

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

    // Pane作成
    return Pane.create(
      paneIdResult.data,
      isActive,
      command || "unknown",
      title || "untitled",
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

  // =============================================================================
  // ドメインロジック（ビジネスルールの実装）
  // =============================================================================

  /**
   * ステータス更新（ビジネスルール適用）
   */
  updateStatus(
    newStatus: WorkerStatus,
  ): Result<void, ValidationError & { message: string }> {
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
      "UNKNOWN": ["IDLE", "WORKING", "BLOCKED", "DONE", "TERMINATED"],
      "IDLE": ["WORKING", "BLOCKED", "TERMINATED"],
      "WORKING": ["IDLE", "DONE", "BLOCKED", "TERMINATED"],
      "BLOCKED": ["IDLE", "WORKING", "TERMINATED"],
      "DONE": ["IDLE", "WORKING"],
      "TERMINATED": ["IDLE", "WORKING"], // 復活可能
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
}
