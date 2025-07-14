/**
 * アプリケーション層
 *
 * DDDアーキテクチャの4層構造におけるアプリケーション層。
 * ドメインロジックのオーケストレーションと外部サービスとの協調を担当。
 */

import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";
import { Pane } from "../domain/pane.ts";
import {
  MonitoringCycle,
  PaneId,
  type PaneName as _PaneName,
} from "../domain/value_objects.ts";
import {
  MonitoringCycleService,
  PaneCollection,
  PaneNamingService,
  StatusTransitionService,
} from "../domain/services.ts";
import type { WorkerStatus } from "../models.ts";

// =============================================================================
// インフラストラクチャ層のインターフェース定義
// =============================================================================

/**
 * tmuxセッション操作のインターフェース
 */
export interface ITmuxSessionRepository {
  discoverPanes(sessionName?: string): Promise<Result<RawPaneData[], Error>>;
  executeTmuxCommand(command: string[]): Promise<Result<string, Error>>;
}

/**
 * ペインコンテンツ監視のインターフェース
 */
export interface IPaneContentMonitor {
  captureContent(paneId: string): Promise<Result<string, Error>>;
  hasContentChanged(paneId: string, previousContent: string): boolean;
}

/**
 * 外部通信のインターフェース
 */
export interface IPaneCommunicator {
  sendMessage(paneId: string, message: string): Promise<Result<void, Error>>;
  sendCommand(paneId: string, command: string): Promise<Result<void, Error>>;
}

/**
 * 生のペインデータ
 */
export interface RawPaneData {
  paneId: string;
  active: string;
  currentCommand: string;
  title: string;
  sessionName: string;
  windowIndex: string;
  windowName: string;
  paneIndex: string;
  tty: string;
  pid: string;
  currentPath: string;
  zoomed: string;
  width: string;
  height: string;
  startCommand: string;
}

// =============================================================================
// MonitoringApplicationService - 監視業務のオーケストレーション
// =============================================================================

/**
 * 監視アプリケーションサービス
 *
 * DDDのアプリケーションサービスとして、監視業務の全体的な流れを制御。
 * ドメインロジックを組み合わせて具体的なユースケースを実現する。
 */
export class MonitoringApplicationService {
  private readonly _tmuxRepository: ITmuxSessionRepository;
  private readonly _contentMonitor: IPaneContentMonitor;
  private readonly _communicator: IPaneCommunicator;
  private readonly _paneCollection: PaneCollection;
  private _cycleService: MonitoringCycleService | null = null;

  constructor(
    tmuxRepository: ITmuxSessionRepository,
    contentMonitor: IPaneContentMonitor,
    communicator: IPaneCommunicator,
  ) {
    this._tmuxRepository = tmuxRepository;
    this._contentMonitor = contentMonitor;
    this._communicator = communicator;
    this._paneCollection = new PaneCollection();
  }

  // =============================================================================
  // 主要ユースケース
  // =============================================================================

  /**
   * 監視セッションの開始
   *
   * 1. セッション発見
   * 2. ペイン分類
   * 3. 監視サイクル開始
   */
  async startMonitoring(
    sessionName?: string,
    intervalSeconds: number = 30,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      // フェーズ1: セッション発見とペイン作成
      const discoveryResult = await this.discoverAndCreatePanes(sessionName);
      if (!discoveryResult.ok) {
        return discoveryResult;
      }

      // フェーズ2: ペイン分類と命名
      const classificationResult = await this.classifyAndNamePanes();
      if (!classificationResult.ok) {
        return classificationResult;
      }

      // フェーズ3: 監視サイクル開始
      const cycleResult = MonitoringCycle.create("Discovery", intervalSeconds);
      if (!cycleResult.ok) {
        return {
          ok: false,
          error: cycleResult.error,
        };
      }

      this._cycleService = new MonitoringCycleService(
        cycleResult.data,
        this._paneCollection,
      );

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "monitoring startup",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * 単一監視サイクルの実行
   *
   * 30秒間隔での監視処理を実行
   */
  async executeSingleCycle(): Promise<
    Result<MonitoringCycleResult, ValidationError & { message: string }>
  > {
    if (!this._cycleService) {
      return {
        ok: false,
        error: createError({
          kind: "IllegalState",
          currentState: "not initialized",
          expectedState: "monitoring started",
        }),
      };
    }

    try {
      // 現在のフェーズを実行
      const phaseResult = this._cycleService.executeCurrentPhase();
      if (!phaseResult.ok) {
        return phaseResult;
      }

      // 具体的な監視処理
      const monitoringResult = await this.executeMonitoringPhase();
      if (!monitoringResult.ok) {
        return monitoringResult;
      }

      // サイクルを次に進める
      const advanceResult = this._cycleService.advance();
      if (!advanceResult.ok) {
        return advanceResult;
      }

      const result: MonitoringCycleResult = {
        phase: this._cycleService.currentCycle.phase,
        cycleCount: this._cycleService.currentCycle.cycleCount,
        statusChanges: monitoringResult.data.statusChanges,
        newlyIdlePanes: monitoringResult.data.newlyIdlePanes,
        newlyWorkingPanes: monitoringResult.data.newlyWorkingPanes,
      };

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "monitoring cycle execution",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * ペインステータスの一括更新
   */
  updatePaneStatuses(
    statusUpdates: Map<string, WorkerStatus>,
  ): Result<StatusUpdateResult, ValidationError & { message: string }> {
    try {
      const paneStatusMap = new Map<string, WorkerStatus>();
      const changedPanes: string[] = [];

      // PaneIdに変換してバリデーション
      for (const [paneIdStr, status] of statusUpdates.entries()) {
        const paneIdResult = PaneId.create(paneIdStr);
        if (!paneIdResult.ok) {
          return {
            ok: false,
            error: paneIdResult.error,
          };
        }

        const pane = this._paneCollection.getPane(paneIdResult.data);
        if (!pane) {
          continue; // 存在しないペインはスキップ
        }

        // ステータスが実際に変更される場合のみ記録
        if (pane.status.kind !== status.kind) {
          changedPanes.push(paneIdStr);
        }

        paneStatusMap.set(paneIdStr, status);
      }

      // ドメインサービスによる一括更新
      const panes = Array.from(statusUpdates.keys())
        .map((paneIdStr) => {
          const paneIdResult = PaneId.create(paneIdStr);
          return paneIdResult.ok
            ? this._paneCollection.getPane(paneIdResult.data)
            : null;
        })
        .filter((pane): pane is Pane => pane !== null);

      const updateResult = StatusTransitionService.updateMultipleStatuses(
        panes,
        paneStatusMap,
      );

      if (!updateResult.ok) {
        return updateResult;
      }

      const result: StatusUpdateResult = {
        updatedCount: paneStatusMap.size,
        changedPanes,
        newIdlePanes: this.getNewlyIdlePanes(),
        newDonePanes: this.getNewlyDonePanes(),
      };

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "updatePaneStatuses",
          details: `Failed to update pane statuses: ${error}`,
        }),
      };
    }
  }

  /**
   * アクティブペインへの報告送信
   */
  async reportToActivePane(
    message: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
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

    try {
      const result = await this._communicator.sendMessage(
        activePane.id.value,
        message,
      );

      if (!result.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommunicationFailed",
            target: "active pane",
            details:
              `Failed to send message to active pane: ${result.error.message}`,
          }),
        };
      }

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "reportToActivePane",
          details: `Unexpected error during reporting: ${error}`,
        }),
      };
    }
  }

  // =============================================================================
  // 内部ヘルパーメソッド
  // =============================================================================

  /**
   * セッション発見とペイン作成
   */
  private async discoverAndCreatePanes(
    sessionName?: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    const panesResult = await this._tmuxRepository.discoverPanes(sessionName);
    if (!panesResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "RepositoryError",
          operation: "discoverPanes",
          details: `Failed to discover panes: ${panesResult.error.message}`,
        }),
      };
    }

    // 既存ペインをクリア
    this._paneCollection.getAllPanes().forEach((pane) => {
      this._paneCollection.removePane(pane.id);
    });

    // 新しいペインを作成・追加
    for (const rawPane of panesResult.data) {
      const paneResult = Pane.fromTmuxData(
        rawPane.paneId,
        rawPane.active === "1",
        rawPane.currentCommand,
        rawPane.title,
      );

      if (paneResult.ok) {
        const addResult = this._paneCollection.addPane(paneResult.data);
        if (!addResult.ok) {
          return addResult;
        }
      }
    }

    return { ok: true, data: undefined };
  }

  /**
   * ペイン分類と命名
   */
  private classifyAndNamePanes(): Result<
    void,
    ValidationError & { message: string }
  > {
    const allPanes = this._paneCollection.getAllPanes();
    let workerCount = 0;

    for (const pane of allPanes) {
      const context = {
        sessionPaneCount: allPanes.length,
        existingWorkerCount: workerCount,
      };

      const nameResult = PaneNamingService.suggestName(pane, context);
      if (!nameResult.ok) {
        continue; // 命名失敗は続行
      }

      // 重複チェック
      if (
        !PaneNamingService.checkNameUniqueness(
          nameResult.data,
          this._paneCollection,
        )
      ) {
        continue; // 重複は続行
      }

      const assignResult = pane.assignName(nameResult.data);
      if (assignResult.ok && nameResult.data.isWorker()) {
        workerCount++;
      }
    }

    return { ok: true, data: undefined };
  }

  /**
   * 監視フェーズの実行
   */
  private async executeMonitoringPhase(): Promise<
    Result<MonitoringPhaseResult, ValidationError & { message: string }>
  > {
    const targetPanes = this._paneCollection.getMonitoringTargets();
    const statusChanges: Array<
      { paneId: string; oldStatus: string; newStatus: string }
    > = [];
    const newlyIdlePanes: string[] = [];
    const newlyWorkingPanes: string[] = [];

    for (const pane of targetPanes) {
      try {
        // コンテンツ変化の検出
        const contentResult = await this._contentMonitor.captureContent(
          pane.id.value,
        );
        if (!contentResult.ok) {
          continue; // エラーは続行
        }

        // ステータスの推論
        const hasChanges = this._contentMonitor.hasContentChanged(
          pane.id.value,
          contentResult.data,
        );

        const context = {
          hasContentChanges: hasChanges,
          isActive: pane.isActive,
          commandType: this.classifyCommand(pane.currentCommand),
        };

        const suggestedStatus = StatusTransitionService.suggestNextStatus(
          pane,
          context,
        );

        // ステータス更新
        const oldStatus = pane.status.kind;
        const updateResult = pane.updateStatus(suggestedStatus);

        if (updateResult.ok && oldStatus !== suggestedStatus.kind) {
          statusChanges.push({
            paneId: pane.id.value,
            oldStatus,
            newStatus: suggestedStatus.kind,
          });

          if (suggestedStatus.kind === "IDLE") {
            newlyIdlePanes.push(pane.id.value);
          } else if (suggestedStatus.kind === "WORKING") {
            newlyWorkingPanes.push(pane.id.value);
          }
        }
      } catch (_error) {
        // 個別ペインのエラーは続行
        continue;
      }
    }

    const result: MonitoringPhaseResult = {
      statusChanges,
      newlyIdlePanes,
      newlyWorkingPanes,
    };

    return { ok: true, data: result };
  }

  /**
   * コマンドの分類
   */
  private classifyCommand(command: string): string {
    const cmd = command.toLowerCase();

    if (["zsh", "bash", "sh", "fish"].includes(cmd)) {
      return "shell";
    }

    if (cmd.includes("node") || cmd.includes("npm") || cmd.includes("yarn")) {
      return "nodejs";
    }

    if (cmd.includes("vim") || cmd.includes("nano") || cmd.includes("code")) {
      return "editor";
    }

    return "other";
  }

  /**
   * 新しくアイドルになったペインの取得
   */
  private getNewlyIdlePanes(): string[] {
    return this._paneCollection.getPanesByStatus("IDLE")
      .map((pane) => pane.id.value);
  }

  /**
   * 新しく完了したペインの取得
   */
  private getNewlyDonePanes(): string[] {
    return this._paneCollection.getPanesByStatus("DONE")
      .map((pane) => pane.id.value);
  }

  // =============================================================================
  // クエリメソッド
  // =============================================================================

  /**
   * ペインコレクションの取得（読み取り専用）
   */
  getPaneCollection(): PaneCollection {
    return this._paneCollection;
  }

  /**
   * 監視統計の取得
   */
  getMonitoringStats(): MonitoringStats {
    const allPanes = this._paneCollection.getAllPanes();

    return {
      totalPanes: allPanes.length,
      activePanes: allPanes.filter((p) => p.isActive).length,
      workingPanes: allPanes.filter((p) => p.isWorking()).length,
      idlePanes: allPanes.filter((p) => p.isIdle()).length,
      donePanes: allPanes.filter((p) => p.isDone()).length,
      terminatedPanes: allPanes.filter((p) => p.isTerminated()).length,
      availableForTask: allPanes.filter((p) => p.canAssignTask()).length,
    };
  }
}

// =============================================================================
// 結果型の定義
// =============================================================================

export interface MonitoringCycleResult {
  phase: string;
  cycleCount: number;
  statusChanges: Array<
    { paneId: string; oldStatus: string; newStatus: string }
  >;
  newlyIdlePanes: string[];
  newlyWorkingPanes: string[];
}

export interface StatusUpdateResult {
  updatedCount: number;
  changedPanes: string[];
  newIdlePanes: string[];
  newDonePanes: string[];
}

export interface MonitoringPhaseResult {
  statusChanges: Array<
    { paneId: string; oldStatus: string; newStatus: string }
  >;
  newlyIdlePanes: string[];
  newlyWorkingPanes: string[];
}

export interface MonitoringStats {
  totalPanes: number;
  activePanes: number;
  workingPanes: number;
  idlePanes: number;
  donePanes: number;
  terminatedPanes: number;
  availableForTask: number;
}
