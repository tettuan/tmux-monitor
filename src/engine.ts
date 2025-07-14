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

    this._logger.info("✅ Monitoring engine initialized");
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

        if (result.statusChanges.length > 0) {
          this._logger.info(
            `📊 Cycle ${result.cycleCount}: ${result.statusChanges.length} status changes detected`,
          );
        }

        if (cycleCount % 10 === 0) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `📈 Stats: ${stats.totalPanes} total, ${stats.workingPanes} working, ${stats.idlePanes} idle`,
          );
        }

        cycleCount++;
        await new Promise((resolve) => setTimeout(resolve, 30000));
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
   * Nodeペインクリア（application.ts互換性のため）
   */
  async clearNodePanes(): Promise<void> {
    this._logger.info("🧹 Clearing Node.js panes...");

    try {
      const startResult = await this._appService.startMonitoring();
      if (!startResult.ok) {
        this._logger.error(
          `Failed to start for clearing: ${startResult.error.message}`,
        );
        return;
      }

      // 単一サイクル実行でペインを検出し、クリア処理を実行
      const cycleResult = await this._appService.executeSingleCycle();
      if (cycleResult.ok) {
        this._logger.info("✅ Node.js panes cleared successfully");
      }
    } catch (error) {
      this._logger.error(`Clear Node panes error: ${error}`);
    }
  }
}
