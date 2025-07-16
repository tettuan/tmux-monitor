/**
 * 監視エンジン
 *
 * Domain-Driven Designアーキテクチャに基づいた
 * 監視エンジンの実装。
 */

import type { PaneCollection } from "./domain/services.ts";
import { MonitoringApplicationService } from "./application/monitoring_service.ts";
import { InfrastructureAdapterFactory } from "./infrastructure/adapters.ts";
import type { CommandExecutor, Logger } from "./services.ts";
import type { Result, ValidationError } from "./types.ts";
import { createError } from "./types.ts";

/**
 * 監視エンジン
 */
export class MonitoringEngine {
  private readonly _appService: MonitoringApplicationService;
  private readonly _logger: Logger;

  constructor(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ) {
    this._logger = logger;

    // アーキテクチャのセットアップ
    const adapters = InfrastructureAdapterFactory.createAllAdapters(
      commandExecutor,
      logger,
    );

    this._appService = new MonitoringApplicationService(
      adapters.tmuxRepository,
      adapters.contentMonitor,
      adapters.communicator,
    );
  }

  /**
   * 監視開始
   */
  async monitor(): Promise<void> {
    this._logger.info("🚀 Starting monitoring");

    try {
      const startResult = await this._appService.startMonitoring();
      if (!startResult.ok) {
        this._logger.error(
          `Failed to start monitoring: ${startResult.error.message}`,
        );
        return;
      }

      await this.continuousMonitoringLoop();
    } catch (error) {
      this._logger.error(`Monitoring error: ${error}`);
      throw error;
    }
  }

  /**
   * 継続的監視ループ
   */
  private async continuousMonitoringLoop(): Promise<void> {
    let cycleCount = 0;
    const maxCycles = 1000;

    // 初回統計情報の表示
    const initialStats = this._appService.getMonitoringStats();
    this._logger.info(
      `🎯 Initial state: ${initialStats.totalPanes} total panes, ${initialStats.workingPanes} working, ${initialStats.idlePanes} idle`,
    );

    while (cycleCount < maxCycles) {
      try {
        const cycleResult = await this._appService.executeSingleCycle();

        if (!cycleResult.ok) {
          this._logger.error(
            `Monitoring cycle failed: ${cycleResult.error.message}`,
          );
          break;
        }

        const result = cycleResult.data;

        // より詳細なサイクル情報をログ出力
        this._logger.info(
          `📊 Cycle ${result.cycleCount} (${result.phase}): ${result.statusChanges.length} status changes`,
        );

        if (result.statusChanges.length > 0) {
          this._logger.info(
            `📊 Status changes: ${result.newlyWorkingPanes.length} newly working, ${result.newlyIdlePanes.length} newly idle`,
          );
        }

        if (cycleCount % 10 === 0) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `📈 Stats: ${stats.totalPanes} total, ${stats.workingPanes} working, ${stats.idlePanes} idle`,
          );
        }

        // デバッグ用：より詳細なログを追加
        if (cycleCount <= 3) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `🔍 Debug Cycle ${cycleCount}: ${stats.totalPanes} total, ${stats.workingPanes} working, ${stats.idlePanes} idle`,
          );
        }

        cycleCount++;
        // デバッグ用：最初の数サイクルは短い間隔で実行
        const interval = cycleCount <= 5 ? 5000 : 30000;
        this._logger.info(`⏱️ Next cycle in ${interval / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, interval));
      } catch (error) {
        this._logger.error(
          `Unexpected error in monitoring cycle: ${error}`,
        );
        break;
      }
    }

    this._logger.info(`Monitoring completed after ${cycleCount} cycles`);
  }

  /**
   * ワンタイム監視
   */
  async oneTimeMonitor(): Promise<void> {
    this._logger.info("🔍 One-time monitoring");

    try {
      const startResult = await this._appService.startMonitoring();
      if (!startResult.ok) {
        this._logger.error(
          `Failed to start one-time monitoring: ${startResult.error.message}`,
        );
        return;
      }

      const cycleResult = await this._appService.executeSingleCycle();
      if (cycleResult.ok) {
        const stats = this._appService.getMonitoringStats();
        this._logger.info(
          `✅ One-time monitoring completed: ${stats.totalPanes} panes monitored`,
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
   * 高度な監視統計
   */
  getAdvancedStats() {
    const stats = this._appService.getMonitoringStats();
    const collection = this._appService.getPaneCollection();

    return {
      ...stats,
      managerPanes: collection.getPanesByRole("manager").length,
      workerPanes: collection.getPanesByRole("worker").length,
      secretaryPanes: collection.getPanesByRole("secretary").length,
      architecture: "Domain-Driven Design",
      typesSafety: "Strong",
      businessRulesEnforced: true,
    };
  }

  /**
   * ペインコレクションへのアクセス
   */
  getPaneCollection(): PaneCollection {
    return this._appService.getPaneCollection();
  }

  /**
   * ドメインサービスの状態確認
   */
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
   * 継続的監視開始（application.ts互換性のため）
   */
  async startContinuousMonitoring(): Promise<void> {
    await this.monitor();
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
      const { PaneCommunicator } = await import("./communication.ts");
      const { CommandExecutor } = await import("./services.ts");

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
}
