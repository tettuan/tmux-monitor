/**
 * アプリケーション層
 *
 * DDDアーキテクチャの4層構造におけるアプリケーション層。
 * ドメインロジックのオーケストレーションと外部サービスとの協調を担当。
 */

import type { Result, ValidationError } from "../core/types.ts";
import { createError } from "../core/types.ts";
import { Pane } from "../domain/pane.ts";
import { PaneId, type PaneName as _PaneName } from "../domain/value_objects.ts";
import {
  PaneCollection,
  PaneNamingService,
  StatusTransitionService,
} from "../domain/services.ts";
import type { WorkerStatus } from "../core/models.ts";

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
 * 外部通信のインターフェース
 */
export interface IPaneCommunicator {
  sendMessage(paneId: string, message: string): Promise<Result<void, Error>>;
  sendCommand(paneId: string, command: string): Promise<Result<void, Error>>;
  sendClearCommand(paneId: string): Promise<Result<void, Error>>;
  startClaudeIfNotRunning(
    panes: import("../core/models.ts").PaneDetail[],
  ): Promise<void>;
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
  private readonly _communicator: IPaneCommunicator;
  private readonly _paneCollection: PaneCollection;
  private readonly _paneDataProcessor:
    import("../infrastructure/panes.ts").PaneDataProcessor;
  private readonly _captureDetectionService?:
    import("../domain/capture_detection_service.ts").CaptureDetectionService;
  private readonly _captureOrchestrator?:
    import("./capture_orchestrator.ts").CaptureOrchestrator;

  constructor(
    tmuxRepository: ITmuxSessionRepository,
    communicator: IPaneCommunicator,
    paneDataProcessor: import("../infrastructure/panes.ts").PaneDataProcessor,
    captureDetectionService?:
      import("../domain/capture_detection_service.ts").CaptureDetectionService,
    captureOrchestrator?:
      import("./capture_orchestrator.ts").CaptureOrchestrator,
  ) {
    this._tmuxRepository = tmuxRepository;
    this._communicator = communicator;
    this._paneDataProcessor = paneDataProcessor;
    this._paneCollection = new PaneCollection();
    this._captureDetectionService = captureDetectionService;
    this._captureOrchestrator = captureOrchestrator;
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
    _intervalSeconds: number = 30,
    shouldStartClaude: boolean = false,
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

      // フェーズ2.5: Claude起動チェック（ペイン作成後）
      if (shouldStartClaude) {
        console.log(
          `DEBUG: shouldStartClaude is true, proceeding with Claude startup check`,
        );
        const allPanes = this._paneCollection.getAllPanes();
        console.log(
          `DEBUG: Found ${allPanes.length} panes for Claude startup check`,
        );

        if (allPanes.length > 0) {
          // PaneDetailの完全な情報を取得
          const paneDetails = [];
          for (const pane of allPanes) {
            const detailResult = await this._paneDataProcessor.getPaneDetail(
              pane.id.value,
              {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
              }, // Mock logger
            );
            if (detailResult.ok) {
              paneDetails.push(detailResult.data);
            }
          }

          console.log(
            `DEBUG: Collected ${paneDetails.length} pane details for Claude startup`,
          );
          if (paneDetails.length > 0) {
            console.log(
              `DEBUG: Calling startClaudeIfNotRunning with ${paneDetails.length} panes`,
            );
            await this._communicator.startClaudeIfNotRunning(paneDetails);
          }
        }
      } else {
        console.log(
          `DEBUG: shouldStartClaude is false, skipping Claude startup check`,
        );
      }

      // フェーズ3: 監視サイクル開始
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
   * ペイン分類と命名（順序型役割割り当て）
   *
   * 全域性原則に基づき、pane ID数値順に従って設定値配列から役割名を割り当てる。
   */
  private classifyAndNamePanes(): Result<
    void,
    ValidationError & { message: string }
  > {
    const allPanes = this._paneCollection.getAllPanes();

    if (allPanes.length === 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidState",
          current: "no_panes",
          expected: "at_least_one_pane",
        }),
      };
    }

    // pane ID数値順にソート
    const sortedPanes = allPanes.sort((a, b) => {
      const aNum = parseInt(a.id.value.replace("%", ""), 10);
      const bNum = parseInt(b.id.value.replace("%", ""), 10);
      return aNum - bNum;
    });

    // 順序型役割割り当て
    const assignmentResult = PaneNamingService.assignSequentialNames(
      sortedPanes,
    );
    if (!assignmentResult.ok) {
      return assignmentResult;
    }

    // 各ペインに名前を割り当て
    let successCount = 0;
    const assignments = assignmentResult.data;

    for (const pane of sortedPanes) {
      const assignedName = assignments.get(pane.id.value);
      if (assignedName) {
        const assignResult = pane.assignName(assignedName);
        if (assignResult.ok) {
          successCount++;
        }
      }
    }

    // 部分的成功も許容（全域性原則）
    console.log(
      `✅ Assigned names to ${successCount}/${sortedPanes.length} panes`,
    );

    // 初回起動時のペイン一覧表示
    this.displayInitialPaneAssignments(sortedPanes);

    return { ok: true, data: undefined };
  }

  /**
   * 初回起動時のペイン役割割り当て結果表示
   */
  private displayInitialPaneAssignments(sortedPanes: Pane[]): void {
    console.log("\n📋 Initial Pane Assignments:");
    console.log("=".repeat(75));

    sortedPanes.forEach((pane) => {
      const roleName = pane.name?.value || "unnamed";
      const statusStr = pane.status.kind || "unknown";
      const activeMarker = pane.isActive ? "🟢" : "⚪";
      const commandPreview = pane.currentCommand.length > 25
        ? pane.currentCommand.substring(0, 22) + "..."
        : pane.currentCommand;

      // Role情報を取得
      const roleType = pane.name?.role || "unknown";
      const isWorker = pane.name?.isWorker() || false;
      const shouldClear = pane.shouldBeCleared();
      const clearMarker = shouldClear ? "🧹" : "⛔";
      const workerMarker = isWorker ? "⚡" : "👑";

      console.log(
        `${activeMarker} ${pane.id.value}: ${roleName.padEnd(12)} | ` +
          `${workerMarker} ${roleType.padEnd(9)} | ` +
          `status: ${statusStr.padEnd(8)} | ` +
          `${clearMarker} | cmd: ${commandPreview}`,
      );
    });

    console.log("=".repeat(75));
    console.log(`Total: ${sortedPanes.length} panes assigned`);
    console.log(
      `Legend: 🟢=active ⚪=inactive | ⚡=worker 👑=manager/secretary | 🧹=clearable ⛔=protected\n`,
    );
  }

  /**
   * 監視フェーズの実行
   */
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

    // デバッグ用：ペインの詳細情報をログ出力（LOG_LEVEL=DEBUG時のみ）
    const logLevel = Deno.env.get("LOG_LEVEL");
    if (logLevel === "DEBUG" && allPanes.length > 0) {
      console.log(`🔍 DEBUG: Found ${allPanes.length} panes (complete list):`);
      allPanes.forEach((pane) => {
        const statusStr = pane.status.kind || "unknown";
        const roleName = pane.name?.value || "unnamed";
        const canAssignTask = pane.canAssignTask();
        const shouldBeCleared = pane.shouldBeCleared();
        const isWorking = pane.isWorking();
        const isIdle = pane.isIdle();
        const isDone = pane.isDone();

        console.log(
          `  - ${pane.id.value}: ${roleName} | status: ${statusStr} | ` +
            `active: ${pane.isActive} | working: ${isWorking} | idle: ${isIdle} | ` +
            `done: ${isDone} | canAssign: ${canAssignTask} | shouldClear: ${shouldBeCleared} | ` +
            `cmd: ${pane.currentCommand}`,
        );
      });
    }

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

  /**
   * 全ペインのcapture処理実行
   *
   * MonitoringCycleCoordinatorから呼び出されるcapture処理の統合ポイント
   */
  async processAllPanesCapture(): Promise<
    Result<
      { changedPanes: string[]; processedPanes: number },
      ValidationError & { message: string }
    >
  > {
    const allPanes = this._paneCollection.getAllPanes();

    if (this._captureOrchestrator) {
      // CaptureOrchestratorを使用した統合処理
      const captureResult = await this._captureOrchestrator.processAllPanes(
        allPanes,
      );
      if (captureResult.ok) {
        return {
          ok: true,
          data: {
            changedPanes: captureResult.data.changedPanes,
            processedPanes: captureResult.data.processedPanes,
          },
        };
      } else {
        return { ok: false, error: captureResult.error };
      }
    } else if (this._captureDetectionService) {
      // フォールバック: CaptureDetectionServiceを直接使用
      const changedPaneIds: string[] = [];
      for (const pane of allPanes) {
        const detectionResult = await this._captureDetectionService
          .detectChanges(
            pane.id.value,
            [pane.title, pane.currentCommand],
          );

        if (detectionResult.ok) {
          const updateResult = pane.updateCaptureStateFromDetection(
            detectionResult.data,
          );
          if (updateResult.ok && detectionResult.data.hasContentChanged) {
            changedPaneIds.push(pane.id.value);
          }
        }
      }

      return {
        ok: true,
        data: {
          changedPanes: changedPaneIds,
          processedPanes: allPanes.length,
        },
      };
    } else {
      return {
        ok: false,
        error: createError({
          kind: "BusinessRuleViolation",
          rule: "CaptureServiceRequired",
          context: "No capture service available for processing",
        }),
      };
    }
  }

  /**
   * Node.jsペインのクリア実行
   *
   * DDDの原則に従い、Pane集約が自身のクリア判定とクリア実行を行う。
   * アプリケーション層はオーケストレーションのみを担当。
   */
  async clearNodePanes(): Promise<
    Result<NodeClearResult, ValidationError & { message: string }>
  > {
    try {
      // 1. 現在のペイン状況を取得
      const discoveryResult = await this._tmuxRepository.discoverPanes();
      if (!discoveryResult.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommunicationFailed",
            target: "tmux session",
            details: discoveryResult.error.message,
          }, "Failed to discover panes for clearing"),
        };
      }

      // 2. ペインコレクションの構築
      const nodePanes: Pane[] = [];
      const detectedNodePanes: {
        paneId: string;
        command: string;
        status: string;
      }[] = [];

      for (const rawPaneData of discoveryResult.data) {
        const paneResult = Pane.fromTmuxData(
          rawPaneData.paneId,
          rawPaneData.active === "1",
          rawPaneData.currentCommand,
          rawPaneData.title,
        );

        if (paneResult.ok) {
          const pane = paneResult.data;

          // Node.jsコマンドかつクリア対象のペインのみを選択
          if (this.isNodeCommand(rawPaneData.currentCommand)) {
            detectedNodePanes.push({
              paneId: rawPaneData.paneId,
              command: rawPaneData.currentCommand,
              status: pane.status.kind,
            });

            if (pane.shouldBeCleared()) {
              nodePanes.push(pane);
            }
          }
        }
      }

      // Node.jsペインの検出状況をログ出力
      if (detectedNodePanes.length > 0) {
        console.log(`🔍 Detected ${detectedNodePanes.length} Node.js panes:`);
        for (const nodePane of detectedNodePanes) {
          console.log(
            `   - ${nodePane.paneId}: ${nodePane.command} (${nodePane.status})`,
          );
        }
        console.log(
          `📝 Clear targets: ${nodePanes.length} panes (DONE/IDLE only)`,
        );
      } else {
        console.log(`🔍 No Node.js panes detected`);
      }

      // 3. クリア戦略の作成（インフラストラクチャ層から）
      const { TmuxClearService } = await import(
        "../infrastructure/tmux_clear_service.ts"
      );
      const clearService = new TmuxClearService(
        this._tmuxRepository,
        this._communicator,
      );

      const clearStrategy = {
        kind: "DirectClear" as const,
        retryOnFailure: true,
        maxRetries: 3,
        verifyAfterClear: true,
      };

      // 4. 各ペインのクリア実行
      const clearResults = [];
      for (const pane of nodePanes) {
        const clearResult = await pane.clearSelf(clearService, clearStrategy);
        clearResults.push(clearResult);
      }

      // 5. 結果の集計
      const successCount = clearResults.filter((r) =>
        r.kind === "Success"
      ).length;
      const failedCount = clearResults.filter((r) =>
        r.kind === "Failed"
      ).length;
      const skippedCount =
        clearResults.filter((r) => r.kind === "Skipped").length;

      return {
        ok: true,
        data: {
          totalProcessed: nodePanes.length,
          successCount,
          failedCount,
          skippedCount,
          results: clearResults,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "clearNodePanes",
          details: `${error}`,
        }, `Unexpected error during Node.js pane clearing: ${error}`),
      };
    }
  }

  /**
   * Node.jsコマンドの判定ヘルパー
   */
  private isNodeCommand(command: string): boolean {
    if (!command || typeof command !== "string") {
      return false;
    }

    const normalizedCommand = command.trim().toLowerCase();
    if (normalizedCommand === "") {
      return false;
    }

    const nodePatterns = [
      "node",
      "nodejs",
      "npm",
      "npx",
      "yarn",
      "pnpm",
      "deno",
      "bun",
      "next",
      "nuxt",
      "vite",
      "webpack",
      "rollup",
      "tsc",
      "typescript",
      "ts-node",
      "jest",
      "vitest",
      "mocha",
      "cypress",
      "eslint",
      "prettier",
      "nodemon",
    ];

    return nodePatterns.some((pattern) => {
      return normalizedCommand === pattern ||
        normalizedCommand.includes(`${pattern} `) ||
        normalizedCommand.includes(`/${pattern}`);
    });
  }

  // =============================================================================
  // 30秒毎ステータス報告機能
  // =============================================================================

  /**
   * 30秒毎のステータス報告の実行判定と送信
   *
   * 報告トリガー:
   * 1. IDLEペインへのclear実行
   * 2. いずれかのペインのステータス変更
   *
   * 報告事項がない場合はSkip
   */
  async executePeriodicStatusReport(
    clearsExecuted: number,
    statusChanges: number,
  ): Promise<
    Result<PeriodicReportResult, ValidationError & { message: string }>
  > {
    try {
      // 報告トリガーの判定
      const shouldReport = clearsExecuted > 0 || statusChanges > 0;

      if (!shouldReport) {
        return {
          ok: true,
          data: {
            executed: false,
            reason: "No significant changes detected",
            clearsExecuted: 0,
            statusChanges: 0,
            timestamp: new Date(),
          },
        };
      }

      // 報告メッセージの作成
      const reportMessage = this.createStatusReportMessage(
        clearsExecuted,
        statusChanges,
      );

      // アクティブペインへの報告送信
      const reportResult = await this.reportToActivePane(reportMessage);

      if (!reportResult.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommunicationFailed",
            target: "active pane",
            details:
              `Failed to send periodic report: ${reportResult.error.message}`,
          }),
        };
      }

      return {
        ok: true,
        data: {
          executed: true,
          reason: "Status changes or clears detected",
          clearsExecuted,
          statusChanges,
          reportMessage,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "executePeriodicStatusReport",
          details: `Unexpected error during periodic reporting: ${error}`,
        }),
      };
    }
  }

  /**
   * ステータス報告メッセージの作成
   */
  private createStatusReportMessage(
    clearsExecuted: number,
    statusChanges: number,
  ): string {
    const stats = this.getMonitoringStats();
    const timestamp = new Date().toLocaleTimeString("ja-JP");

    let message = `📊 [${timestamp}] tmux-monitor Status Report\n`;

    // 主要な変更情報
    if (clearsExecuted > 0) {
      message += `🧹 Cleared ${clearsExecuted} IDLE panes\n`;
    }
    if (statusChanges > 0) {
      message += `📈 ${statusChanges} pane status changes detected\n`;
    }

    // 現在の統計情報
    message += `\n📋 Current Status:\n`;
    message += `  Total: ${stats.totalPanes} panes\n`;

    // ステータス別pane ID羅列
    const allPanes = this._paneCollection.getAllPanes();
    const workingPanes = allPanes.filter((p) => p.isWorking());
    const idlePanes = allPanes.filter((p) => p.isIdle());
    const donePanes = allPanes.filter((p) => p.isDone());

    if (workingPanes.length > 0) {
      const workingIds = workingPanes.map((p) => p.id.value).join(", ");
      message += `  ⚡ Working (${workingPanes.length}): ${workingIds}\n`;
    }

    if (idlePanes.length > 0) {
      const idleIds = idlePanes.map((p) => p.id.value).join(", ");
      message += `  💤 Idle (${idlePanes.length}): ${idleIds}\n`;
    }

    if (donePanes.length > 0) {
      const doneIds = donePanes.map((p) => p.id.value).join(", ");
      message += `  ✅ Done (${donePanes.length}): ${doneIds}\n`;
    }

    message += `  🎯 Available for tasks: ${stats.availableForTask}\n`;

    return message;
  }
}

// =============================================================================
// 結果型の定義
// =============================================================================

export interface StatusUpdateResult {
  updatedCount: number;
  changedPanes: string[];
  newIdlePanes: string[];
  newDonePanes: string[];
}

/**
 * Node.jsペインクリア結果
 */
export interface NodeClearResult {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  results: import("../domain/clear_domain.ts").ClearOperationResult[];
  timestamp: Date;
}

/**
 * 30秒毎の定期報告結果
 */
export interface PeriodicReportResult {
  executed: boolean;
  reason: string;
  clearsExecuted: number;
  statusChanges: number;
  reportMessage?: string;
  timestamp: Date;
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
