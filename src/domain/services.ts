/**
 * ドメインサービス
 *
 * 複数の集約にまたがるビジネスロジックや、
 * 単一の集約に属さない概念を扱うサービス。
 */

import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";
import type { Pane } from "./pane.ts";
import {
  type MonitoringCycle,
  type PaneId,
  PaneName,
} from "./value_objects.ts";
import type { WorkerStatus } from "../models.ts";

// =============================================================================
// PaneCollection - ペイン群の管理
// =============================================================================

/**
 * ペインコレクション
 *
 * 複数のペインを管理し、セッション全体の一貫性を保証する。
 * アクティブペインの一意性などの制約を強制する。
 */
export class PaneCollection {
  private readonly _panes: Map<string, Pane> = new Map();
  private _activePane: Pane | null = null;

  /**
   * ペインの追加
   */
  addPane(pane: Pane): Result<void, ValidationError & { message: string }> {
    // ビジネスルール: アクティブペインは1つのみ
    if (pane.isActive) {
      if (this._activePane && !this._activePane.equals(pane)) {
        return {
          ok: false,
          error: createError({
            kind: "BusinessRuleViolation",
            rule: "SingleActivePane",
            context: "Only one active pane is allowed per session",
          }),
        };
      }
      this._activePane = pane;
    }

    this._panes.set(pane.id.value, pane);
    return { ok: true, data: undefined };
  }

  /**
   * ペインの削除
   */
  removePane(paneId: PaneId): boolean {
    const pane = this._panes.get(paneId.value);
    if (!pane) {
      return false;
    }

    if (pane.isActive) {
      this._activePane = null;
    }

    return this._panes.delete(paneId.value);
  }

  /**
   * ペインの取得
   */
  getPane(paneId: PaneId): Pane | null {
    return this._panes.get(paneId.value) || null;
  }

  /**
   * すべてのペイン取得
   */
  getAllPanes(): Pane[] {
    return Array.from(this._panes.values());
  }

  /**
   * アクティブペイン取得
   */
  getActivePane(): Pane | null {
    return this._activePane;
  }

  /**
   * ターゲットペイン取得（非アクティブペイン）
   */
  getTargetPanes(): Pane[] {
    return Array.from(this._panes.values()).filter((pane) => !pane.isActive);
  }

  /**
   * 役割別ペイン取得
   */
  getPanesByRole(role: "manager" | "worker" | "secretary"): Pane[] {
    return Array.from(this._panes.values()).filter((pane) =>
      pane.name && pane.name.role === role
    );
  }

  /**
   * ステータス別ペイン取得
   */
  getPanesByStatus(statusKind: string): Pane[] {
    return Array.from(this._panes.values()).filter((pane) =>
      pane.status.kind === statusKind
    );
  }

  /**
   * タスク割当可能ペイン取得
   */
  getAvailableForTaskAssignment(): Pane[] {
    return Array.from(this._panes.values()).filter((pane) =>
      pane.canAssignTask()
    );
  }

  /**
   * 監視対象ペイン取得
   */
  getMonitoringTargets(): Pane[] {
    return Array.from(this._panes.values()).filter((pane) =>
      pane.shouldBeMonitored()
    );
  }

  /**
   * ペイン数取得
   */
  get count(): number {
    return this._panes.size;
  }
}

// =============================================================================
// StatusTransitionService - ステータス遷移のドメインサービス
// =============================================================================

/**
 * ステータス遷移サービス
 *
 * 複雑なステータス遷移ロジックを管理する。
 * ビジネスルールに基づいた遷移の検証と実行。
 */
export class StatusTransitionService {
  /**
   * バッチステータス更新
   *
   * 複数のペインのステータスを一括で更新し、
   * 全体の一貫性を保証する。
   */
  static updateMultipleStatuses(
    panes: Pane[],
    statusUpdates: Map<string, WorkerStatus>,
  ): Result<void, ValidationError & { message: string }> {
    // フェーズ1: すべての遷移の妥当性を事前検証
    for (const pane of panes) {
      const newStatus = statusUpdates.get(pane.id.value);
      if (newStatus) {
        // 個別ペインの遷移検証はPaneクラス内で行われる
        const result = pane.updateStatus(newStatus);
        if (!result.ok) {
          return result;
        }
      }
    }

    return { ok: true, data: undefined };
  }

  /**
   * 条件付きステータス更新
   *
   * 特定の条件を満たす場合のみステータスを更新する。
   */
  static conditionalStatusUpdate(
    pane: Pane,
    newStatus: WorkerStatus,
    condition: (pane: Pane) => boolean,
  ): Result<boolean, ValidationError & { message: string }> {
    if (!condition(pane)) {
      return { ok: true, data: false }; // 条件不一致は正常
    }

    const result = pane.updateStatus(newStatus);
    if (!result.ok) {
      return result;
    }

    return { ok: true, data: true };
  }

  /**
   * ステータス遷移の推奨提案
   *
   * 現在の状態とコンテキストに基づいて、
   * 次に遷移すべきステータスを提案する。
   */
  static suggestNextStatus(
    pane: Pane,
    context: {
      hasContentChanges: boolean;
      isActive: boolean;
      commandType: string;
    },
  ): WorkerStatus {
    // ビジネスロジック: コンテキストに基づくステータス推論
    if (context.isActive) {
      return { kind: "WORKING" };
    }

    if (context.hasContentChanges) {
      return { kind: "WORKING" };
    }

    if (pane.status.kind === "WORKING" && !context.hasContentChanges) {
      return { kind: "IDLE" };
    }

    if (context.commandType === "shell") {
      return { kind: "IDLE" };
    }

    return pane.status; // 変更なし
  }
}

// =============================================================================
// MonitoringCycleService - 監視サイクル管理
// =============================================================================

/**
 * 監視サイクル管理サービス
 *
 * MonitoringCycleの進行と、ペインコレクションとの連携を管理する。
 */
export class MonitoringCycleService {
  private _currentCycle: MonitoringCycle;
  private readonly _paneCollection: PaneCollection;

  constructor(
    initialCycle: MonitoringCycle,
    paneCollection: PaneCollection,
  ) {
    this._currentCycle = initialCycle;
    this._paneCollection = paneCollection;
  }

  /**
   * 現在のサイクル取得
   */
  get currentCycle(): MonitoringCycle {
    return this._currentCycle;
  }

  /**
   * サイクルの進行
   */
  advance(): Result<void, ValidationError & { message: string }> {
    // 前提条件チェック
    if (!this._currentCycle.canProceedToNext()) {
      return {
        ok: false,
        error: createError({
          kind: "BusinessRuleViolation",
          rule: "CyclePhaseTransition",
          context: `Cannot proceed from phase ${this._currentCycle.phase}`,
        }),
      };
    }

    const nextCycleResult = this._currentCycle.advance();
    if (!nextCycleResult.ok) {
      return nextCycleResult;
    }

    this._currentCycle = nextCycleResult.data;
    return { ok: true, data: undefined };
  }

  /**
   * フェーズ別実行
   */
  executeCurrentPhase(): Result<void, ValidationError & { message: string }> {
    switch (this._currentCycle.phase) {
      case "Discovery":
        return this.executeDiscovery();
      case "Classification":
        return this.executeClassification();
      case "Tracking":
        return this.executeTracking();
      case "Reporting":
        return this.executeReporting();
    }
  }

  /**
   * 発見フェーズの実行
   */
  private executeDiscovery(): Result<
    void,
    ValidationError & { message: string }
  > {
    // セッション発見ロジック
    // 実際の実装では外部サービスと連携
    return { ok: true, data: undefined };
  }

  /**
   * 分類フェーズの実行
   */
  private executeClassification(): Result<
    void,
    ValidationError & { message: string }
  > {
    // ペイン分類ロジック
    const _panes = this._paneCollection.getAllPanes();

    // アクティブペインとターゲットペインの分離は
    // PaneCollectionで既に管理されている

    return { ok: true, data: undefined };
  }

  /**
   * 追跡フェーズの実行
   */
  private executeTracking(): Result<
    void,
    ValidationError & { message: string }
  > {
    // ステータス追跡ロジック
    const targetPanes = this._paneCollection.getMonitoringTargets();

    for (const _pane of targetPanes) {
      // 実際の監視処理
      // 外部サービスと連携してコンテンツ変化を検出
    }

    return { ok: true, data: undefined };
  }

  /**
   * 報告フェーズの実行
   */
  private executeReporting(): Result<
    void,
    ValidationError & { message: string }
  > {
    // 報告ロジック
    const activePane = this._paneCollection.getActivePane();
    if (!activePane) {
      return {
        ok: false,
        error: createError({
          kind: "BusinessRuleViolation",
          rule: "ActivePaneRequired",
          context: "No active pane found for reporting",
        }),
      };
    }

    return { ok: true, data: undefined };
  }
}

// =============================================================================
// PaneNamingService - ペイン命名サービス
// =============================================================================

/**
 * ペイン命名サービス
 *
 * ペインの自動命名と役割の割り当てを管理する。
 */
export class PaneNamingService {
  /**
   * 自動命名
   *
   * ペインの特性に基づいて適切な名前を提案する。
   */
  static suggestName(
    pane: Pane,
    context: {
      sessionPaneCount: number;
      existingWorkerCount: number;
    },
  ): Result<PaneName, ValidationError & { message: string }> {
    // ビジネスルール: アクティブペインはmanagerに
    if (pane.isActive) {
      return PaneName.create("manager-main");
    }

    // コマンドに基づく役割判定
    const command = pane.currentCommand.toLowerCase();

    if (command.includes("secretary") || command.includes("sec")) {
      return PaneName.create("secretary-1");
    }

    // デフォルトはworker
    const workerIndex = context.existingWorkerCount + 1;
    return PaneName.create(`worker-${workerIndex}`);
  }

  /**
   * 名前の重複チェック
   */
  static checkNameUniqueness(
    proposedName: PaneName,
    paneCollection: PaneCollection,
  ): boolean {
    const allPanes = paneCollection.getAllPanes();
    return !allPanes.some((pane) =>
      pane.name && pane.name.equals(proposedName)
    );
  }
}
