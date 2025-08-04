/**
 * 監視エンジン
 *
 * Domain-Driven Designアーキテクチャに基づいた
 * イベント駆動監視エンジンの実装。
 */

import type { PaneCollection } from "../domain/services.ts";
import { MonitoringApplicationService } from "./monitoring_service.ts";
import { InfrastructureAdapterFactory } from "../infrastructure/adapters.ts";
import { PaneDataProcessor } from "../infrastructure/panes.ts";
import type { MonitoringOptions } from "../core/models.ts";
import type { CommandExecutor, Logger } from "../infrastructure/services.ts";
import type { Result, ValidationError } from "../core/types.ts";
import { createError } from "../core/types.ts";

// イベント駆動アーキテクチャのインポート
import { SimpleDomainEventDispatcher } from "../domain/event_dispatcher.ts";
import { MonitoringCycleCoordinator } from "../domain/monitoring_cycle_coordinator.ts";
import { globalCancellationToken } from "../core/cancellation.ts";
import {
  EnterSendEventHandler,
  PaneClearEventHandler,
  PaneTitleUpdateEventHandler,
} from "../infrastructure/event_handlers.ts";

/**
 * 監視エンジン
 */
export class MonitoringEngine {
  private readonly _appService: MonitoringApplicationService;
  private readonly _logger: Logger;
  private readonly _eventDispatcher: SimpleDomainEventDispatcher;
  private readonly _cycleCoordinator: MonitoringCycleCoordinator;

  constructor(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ) {
    this._logger = logger;

    // イベント駆動アーキテクチャのセットアップ
    this._eventDispatcher = new SimpleDomainEventDispatcher(logger);

    // イベントハンドラーの登録
    this.registerEventHandlers(commandExecutor, logger);

    // アーキテクチャのセットアップ
    const adapters = InfrastructureAdapterFactory.createAllAdapters(
      commandExecutor,
      logger,
    );

    // PaneDataProcessorを作成
    const paneDataProcessor = new PaneDataProcessor(commandExecutor, logger);

    this._appService = new MonitoringApplicationService(
      adapters.tmuxRepository,
      adapters.communicator,
      paneDataProcessor,
      adapters.captureDetectionService,
    );

    this._cycleCoordinator = new MonitoringCycleCoordinator(
      this._eventDispatcher,
      logger,
    );

    // MonitoringApplicationServiceをCycleCoordinatorに注入
    this._cycleCoordinator.setAppService(this._appService);
  }

  /**
   * 監視開始 - イベント駆動アーキテクチャでPaneが自分自身の責務を知る
   */
  async monitor(options: MonitoringOptions): Promise<void> {
    this._logger.info("🚀 Starting event-driven monitoring");

    try {
      const startResult = await this._appService.startMonitoring(
        undefined, // sessionName
        30, // intervalSeconds
        options.shouldStartClaude(), // shouldStartClaude
      );
      if (!startResult.ok) {
        this._logger.error(`Failed to start: ${startResult.error.message}`);
        return;
      }

      const cycleResult = await this._cycleCoordinator.startCycle();
      if (!cycleResult.ok) {
        this._logger.error(
          `Failed to start cycle: ${cycleResult.error.message}`,
        );
        return;
      }

      await this.monitoringLoop();
    } catch (error) {
      this._logger.error(`Monitoring error: ${error}`);
      throw error;
    }
  }

  /**
   * メインループ - Paneが自分自身で何をするべきかを知っている状態を実現
   */
  private async monitoringLoop(): Promise<void> {
    let cycleCount = 0;
    const maxCycles = 1000;

    const initialStats = this._appService.getMonitoringStats();
    this._logger.info(
      `🎯 Initial: ${initialStats.totalPanes} panes, ${initialStats.workingPanes} working, ${initialStats.idlePanes} idle`,
    );

    while (cycleCount < maxCycles && !globalCancellationToken.isCancelled()) {
      // Debug: Check cancellation state at loop start
      if (Deno.env.get("LOG_LEVEL") === "DEBUG") {
        console.log(`[DEBUG] MonitoringLoop: Cycle ${cycleCount + 1}, Cancelled: ${globalCancellationToken.isCancelled()}`);
      }
      try {
        const paneCollection = this._appService.getPaneCollection();
        const cycleResult = await this._cycleCoordinator.executeSingleCycle(
          paneCollection,
        );

        if (!cycleResult.ok) {
          this._logger.error(`Cycle failed: ${cycleResult.error.message}`);
          break;
        }

        const result = cycleResult.data;
        this._logger.info(
          `🔄 Cycle ${result.cycleNumber}: ${result.totalProcessed} panes, ${result.statusChanges} changes, ${result.entersSent} enters, ${result.clearsExecuted} clears`,
        );

        if (result.errors.length > 0) {
          this._logger.warn(`⚠️ Errors: ${result.errors.join(", ")}`);
        }

        if (result.cycleNumber % 10 === 0) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `📈 Stats: ${stats.totalPanes} total, ${stats.workingPanes} working, ${stats.idlePanes} idle`,
          );
        }

        cycleCount++;
        
        // Use cancellable delay instead of setTimeout
        if (Deno.env.get("LOG_LEVEL") === "DEBUG") {
          console.log(`[DEBUG] MonitoringLoop: Starting delay of ${result.nextCycleDelay}ms, Current cancellation: ${globalCancellationToken.isCancelled()}`);
        }
        
        const interrupted = await globalCancellationToken.delay(result.nextCycleDelay);
        
        if (Deno.env.get("LOG_LEVEL") === "DEBUG") {
          console.log(`[DEBUG] MonitoringLoop: Delay completed, Interrupted: ${interrupted}, Cancellation: ${globalCancellationToken.isCancelled()}`);
        }
        if (interrupted) {
          this._logger.info("🛑 Monitoring interrupted by user");
          break;
        }
      } catch (error) {
        this._logger.error(`Unexpected error: ${error}`);
        break;
      }
    }

    this._cycleCoordinator.stopCycle();
    this._logger.info(`Monitoring completed after ${cycleCount} cycles`);
    
    // If cancelled, ensure we exit
    if (globalCancellationToken.isCancelled()) {
      if (Deno.env.get("LOG_LEVEL") === "DEBUG") {
        console.log("[DEBUG] MonitoringLoop: Exiting due to cancellation");
      }
      // Give a small delay for cleanup then exit
      setTimeout(() => {
        Deno.exit(0);
      }, 100);
    }
  }

  /**
   * ワンタイム監視 - イベント駆動アーキテクチャで統一
   */
  async oneTimeMonitor(options?: MonitoringOptions): Promise<void> {
    this._logger.info("🔍 One-time monitoring");

    try {
      // optionsが渡されない場合はデフォルトを作成
      if (!options) {
        const { MonitoringOptions } = await import("../core/models.ts");
        options = MonitoringOptions.create(
          false, // continuous
          null, // scheduledTime
          null, // instructionFile
          false, // killAllPanes
          false, // clearPanes
          false, // clearAllPanes
          false, // startClaude
        );
      }

      const startResult = await this._appService.startMonitoring(
        undefined, // sessionName
        30, // intervalSeconds
        options.shouldStartClaude(), // shouldStartClaude
      );
      if (!startResult.ok) {
        this._logger.error(
          `Failed to start one-time monitoring: ${startResult.error.message}`,
        );
        return;
      }

      const paneCollection = this._appService.getPaneCollection();
      const cycleResult = await this._cycleCoordinator.executeSingleCycle(
        paneCollection,
      );
      if (cycleResult.ok) {
        const result = cycleResult.data;
        this._logger.info(
          `✅ One-time monitoring completed: ${result.totalProcessed} panes, ${result.statusChanges} changes`,
        );
      }
    } catch (error) {
      this._logger.error(`One-time monitoring error: ${error}`);
      throw error;
    }
  }

  /**
   * ペインリストの更新
   */
  async refreshPaneList(): Promise<void> {
    try {
      const startResult = await this._appService.startMonitoring();
      if (startResult.ok) {
        this._logger.info("✅ Pane list refreshed");
      }
    } catch (error) {
      this._logger.error(`Failed to refresh pane list: ${error}`);
      throw error;
    }
  }

  /**
   * 統計とアクセサ
   */
  getAdvancedStats() {
    const stats = this._appService.getMonitoringStats();
    const collection = this._appService.getPaneCollection();
    return {
      ...stats,
      managerPanes: collection.getPanesByRole("manager").length,
      workerPanes: collection.getPanesByRole("worker").length,
      secretaryPanes: collection.getPanesByRole("secretary").length,
      architecture: "Event-Driven DDD",
      typesSafety: "Totality",
    };
  }

  getPaneCollection(): PaneCollection {
    return this._appService.getPaneCollection();
  }
  getEventDispatcher(): SimpleDomainEventDispatcher {
    return this._eventDispatcher;
  }
  getCycleCoordinator(): MonitoringCycleCoordinator {
    return this._cycleCoordinator;
  }

  getDomainServiceHealth() {
    const stats = this._appService.getMonitoringStats();
    return {
      isHealthy: stats.totalPanes > 0,
      domainObjectCount: stats.totalPanes,
      businessRulesActive: true,
      lastCycleResult: "success",
    };
  }

  /**
   * 互換性メソッド
   */
  async startContinuousMonitoring(): Promise<void> {
    // デフォルトのMonitoringOptionsを作成（Claude自動起動なし）
    const { MonitoringOptions } = await import("../core/models.ts");
    const defaultOptions = MonitoringOptions.create(
      true, // continuous
      null, // scheduledTime
      null, // instructionFile
      false, // killAllPanes
      false, // clearPanes
      false, // clearAllPanes
      false, // startClaude
    );
    await this.monitor(defaultOptions);
  }

  /**
   * 指示ファイルパスをメインペインに送信
   *
   * 全域性原則に基づき、指示ファイルパスをメッセージとして送信。
   * ファイル内容は読み取らず、パスのみを送信するため--allow-read権限は不要。
   */
  async sendInstructionFileToMainPane(
    instructionFilePath: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    this._logger.info(
      `📝 Sending instruction file path to main pane: ${instructionFilePath}`,
    );

    try {
      // セッション開始（ペイン情報を取得するため）
      const startResult = await this._appService.startMonitoring();
      if (!startResult.ok) {
        return {
          ok: false,
          error: createError(
            {
              kind: "BusinessRuleViolation",
              rule: "MonitoringRequired",
              context:
                "Cannot send instruction without active monitoring session",
            },
            `Failed to start monitoring for instruction sending: ${startResult.error.message}`,
          ),
        };
      }

      // アクティブペインの取得
      const collection = this._appService.getPaneCollection();
      const activePane = collection.getActivePane();

      if (!activePane) {
        return {
          ok: false,
          error: createError({
            kind: "BusinessRuleViolation",
            rule: "ActivePaneRequired",
            context: "Main pane must be active to receive instructions",
          }, "No active pane found to send instruction file"),
        };
      }

      // 指示ファイルパスをメッセージとして送信（ファイル読み取り権限不要）
      const { PaneCommunicator } = await import(
        "../infrastructure/communication.ts"
      );
      const { CommandExecutor } = await import("../infrastructure/services.ts");

      const communicator = PaneCommunicator.create(
        new CommandExecutor(),
        this._logger,
      );
      const instructionMessage =
        `Follow the instruction file: ${instructionFilePath}`;
      const sendResult = await communicator.sendToPane(
        activePane.id.value,
        instructionMessage,
      );

      if (!sendResult.ok) {
        return {
          ok: false,
          error: createError(
            {
              kind: "CommunicationFailed",
              target: "main pane",
              details:
                `Failed to send instruction message: ${sendResult.error.message}`,
            },
            `Failed to send instruction file path to main pane: ${sendResult.error.message}`,
          ),
        };
      }

      this._logger.info(
        `✅ Instruction file path sent successfully to main pane ${activePane.id.value}`,
      );
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "sendInstructionFileToMainPane",
          details: `Unexpected error: ${error}`,
        }, `Unexpected error while sending instruction file: ${error}`),
      };
    }
  }

  /**
   * Nodeペインクリア（DDDアーキテクチャに基づく実装）
   */
  async clearNodePanes(): Promise<void> {
    this._logger.info("🧹 Clearing Node.js panes...");

    try {
      const clearResult = await this._appService.clearNodePanes();

      if (!clearResult.ok) {
        this._logger.error(
          `Failed to clear Node.js panes: ${clearResult.error.message}`,
        );
        return;
      }

      const result = clearResult.data;

      // 結果をカテゴリごとに分類
      const successfulPanes: string[] = [];
      const failedPanes: string[] = [];
      const skippedPanes: string[] = [];

      for (const clearResult of result.results) {
        switch (clearResult.kind) {
          case "Success":
            successfulPanes.push(clearResult.paneId);
            this._logger.debug(
              `✅ ${clearResult.paneId}: Cleared successfully in ${clearResult.duration}ms`,
            );
            break;
          case "Failed":
            failedPanes.push(clearResult.paneId);
            this._logger.warn(
              `❌ ${clearResult.paneId}: Failed - ${clearResult.error}`,
            );
            break;
          case "Skipped":
            skippedPanes.push(clearResult.paneId);
            this._logger.debug(
              `⏭️ ${clearResult.paneId}: Skipped - ${clearResult.reason}`,
            );
            break;
        }
      }

      // IDリスト付きでサマリーを表示
      this._logger.info(`✅ Clear operation completed:`);
      this._logger.info(`   - Total processed: ${result.totalProcessed}`);

      if (successfulPanes.length > 0) {
        this._logger.info(
          `   - Successful: ${result.successCount} (id: ${
            successfulPanes.join(",")
          })`,
        );
      } else {
        this._logger.info(`   - Successful: ${result.successCount}`);
      }

      if (failedPanes.length > 0) {
        this._logger.info(
          `   - Failed: ${result.failedCount} (id: ${failedPanes.join(",")})`,
        );
      } else {
        this._logger.info(`   - Failed: ${result.failedCount}`);
      }

      if (skippedPanes.length > 0) {
        this._logger.info(
          `   - Skipped: ${result.skippedCount} (id: ${
            skippedPanes.join(",")
          })`,
        );
      } else {
        this._logger.info(`   - Skipped: ${result.skippedCount}`);
      }
    } catch (error) {
      this._logger.error(`Clear Node panes error: ${error}`);
    }
  }

  /**
   * イベントハンドラーの登録
   */
  private registerEventHandlers(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): void {
    // Enter送信イベントハンドラーの登録
    const enterHandler = new EnterSendEventHandler(
      commandExecutor,
      logger,
    );
    this._eventDispatcher.subscribe("PaneEnterSendRequested", enterHandler);

    // ペインクリアイベントハンドラーの登録
    const clearHandler = new PaneClearEventHandler(
      commandExecutor,
      logger,
    );
    this._eventDispatcher.subscribe("PaneClearRequested", clearHandler);

    // ペインタイトル更新イベントハンドラーの登録
    const titleHandler = new PaneTitleUpdateEventHandler(
      commandExecutor,
      logger,
    );
    this._eventDispatcher.subscribe("PaneTitleChanged", titleHandler);

    logger.info(
      "✅ Event handlers registered: Enter, Clear, Title handlers",
    );
  }
}
