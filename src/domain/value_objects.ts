/**
 * ドメイン値オブジェクト定義
 *
 * DDDドキュメントの設計原則に基づいた値オブジェクトの実装
 * - 不変性の保証
 * - Smart Constructorによる制約の強制
 * - Result型による失敗の明示的表現
 */

import { createError, type Result, type ValidationError } from "../types.ts";

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
    if (trimmed.includes("manager") || trimmed.includes("mgr")) {
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
            `PaneName must contain role indicator (manager/worker/secretary), got: ${trimmed}`,
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
