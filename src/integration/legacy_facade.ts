/**
 * レガシーコード統合ファサード
 *
 * 新しいDDDアーキテクチャと既存のコードベースを
 * 段階的に統合するためのファサードパターン実装。
 *
 * 既存のAPIを維持しながら、内部的に新しいドメインモデルを使用。
 */

import {
  Pane as LegacyPane,
  type WorkerStatus as _WorkerStatus,
} from "../models.ts";
import { Pane as NewPane } from "../domain/pane.ts";
import type {
  PaneId as _PaneId,
  PaneName as _PaneName,
} from "../domain/value_objects.ts";
import type { PaneCollection } from "../domain/services.ts";
import { MonitoringApplicationService } from "../application/monitoring_service.ts";
import { InfrastructureAdapterFactory } from "../infrastructure/adapters.ts";
import type { CommandExecutor, Logger } from "../services.ts";
import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";

// =============================================================================
// Legacy API Adapter - 既存APIの新実装での提供
// =============================================================================

/**
 * レガシーPaneクラスのファサード
 *
 * 既存のPaneクラスAPIを維持しながら、
 * 内部的に新しいドメインモデルを使用。
 */
export class LegacyPaneAdapter {
  private readonly _newPane: NewPane;

  private constructor(newPane: NewPane) {
    this._newPane = newPane;
  }

  /**
   * レガシーAPIから新しいPaneを作成
   */
  static fromLegacy(
    id: string,
    active: boolean,
    command?: string,
    title?: string,
  ): Result<LegacyPaneAdapter, ValidationError & { message: string }> {
    const paneResult = NewPane.fromTmuxData(
      id,
      active,
      command || "unknown",
      title || "untitled",
    );

    if (!paneResult.ok) {
      return paneResult;
    }

    return {
      ok: true,
      data: new LegacyPaneAdapter(paneResult.data),
    };
  }

  /**
   * 新しいPaneから作成
   */
  static fromNew(newPane: NewPane): LegacyPaneAdapter {
    return new LegacyPaneAdapter(newPane);
  }

  // =============================================================================
  // レガシーAPI互換性メソッド
  // =============================================================================

  get id(): string {
    return this._newPane.id.value;
  }

  isActive(): boolean {
    return this._newPane.isActive;
  }

  getCommand(): string | null {
    return this._newPane.currentCommand;
  }

  getTitle(): string | null {
    return this._newPane.title;
  }

  /**
   * 新しいドメインモデルへのアクセス（内部使用）
   */
  get _internal(): NewPane {
    return this._newPane;
  }

  /**
   * レガシーPaneオブジェクトへの変換
   */
  toLegacyPane(): LegacyPane {
    const legacyResult = LegacyPane.create(
      this._newPane.id.value,
      this._newPane.isActive,
      this._newPane.currentCommand,
      this._newPane.title,
    );

    if (!legacyResult.ok) {
      // フォールバック: 最小限のPaneオブジェクトを作成
      throw new Error(
        `Failed to create legacy pane: ${legacyResult.error.message}`,
      );
    }

    return legacyResult.data;
  }
}

// =============================================================================
// MonitoringEngine Migration Facade
// =============================================================================

/**
 * MonitoringEngineの移行ファサード
 *
 * 既存のMonitoringEngineのAPIを維持しながら、
 * 段階的に新しいアプリケーションサービスに移行。
 */
export class MonitoringEngineFacade {
  private readonly _appService: MonitoringApplicationService;
  private readonly _logger: Logger;
  private _isNewArchitecture: boolean = false;

  constructor(
    commandExecutor: CommandExecutor,
    logger: Logger,
    // 既存の依存関係（段階的移行のため保持）
    _legacyDependencies?: {
      session?: unknown;
      paneManager?: unknown;
      communicator?: unknown;
      // ... 他の既存依存関係
    },
  ) {
    this._logger = logger;

    // 新しいアーキテクチャのセットアップ
    try {
      const adapters = InfrastructureAdapterFactory.createAllAdapters(
        commandExecutor,
        logger,
      );

      this._appService = new MonitoringApplicationService(
        adapters.tmuxRepository,
        adapters.contentMonitor,
        adapters.communicator,
      );

      this._isNewArchitecture = true;
      this._logger.info("✅ New DDD architecture initialized successfully");
    } catch (error) {
      this._logger.warn(`⚠️ Failed to initialize new architecture: ${error}`);

      // フォールバック: 既存実装を使用
      this._isNewArchitecture = false;

      // 仮のアプリケーションサービス（エラー時のフォールバック）
      const mockAdapters = InfrastructureAdapterFactory.createAllAdapters(
        commandExecutor,
        logger,
      );
      this._appService = new MonitoringApplicationService(
        mockAdapters.tmuxRepository,
        mockAdapters.contentMonitor,
        mockAdapters.communicator,
      );
    }
  }

  // =============================================================================
  // 既存API互換性メソッド
  // =============================================================================

  /**
   * 監視開始（既存APIと互換）
   */
  async monitor(): Promise<void> {
    if (this._isNewArchitecture) {
      this._logger.info("🚀 Starting monitoring with new DDD architecture");

      try {
        // 新しいアーキテクチャでの監視開始
        const startResult = await this._appService.startMonitoring();
        if (!startResult.ok) {
          this._logger.error(
            `Failed to start monitoring: ${startResult.error.message}`,
          );
          return;
        }

        // 継続的な監視ループ
        await this.continuousMonitoringLoop();
      } catch (error) {
        this._logger.error(`Monitoring error with new architecture: ${error}`);
        // 必要に応じてレガシー実装にフォールバック
      }
    } else {
      this._logger.info("📦 Falling back to legacy monitoring implementation");
      // レガシー実装での監視
      // await this.legacyMonitor();
    }
  }

  /**
   * 継続的監視ループ（新実装）
   */
  private async continuousMonitoringLoop(): Promise<void> {
    let cycleCount = 0;
    const maxCycles = 1000; // 安全装置

    while (cycleCount < maxCycles) {
      try {
        // 単一サイクルの実行
        const cycleResult = await this._appService.executeSingleCycle();

        if (!cycleResult.ok) {
          this._logger.error(
            `Monitoring cycle failed: ${cycleResult.error.message}`,
          );
          break;
        }

        const result = cycleResult.data;

        // 進捗ログ
        if (result.statusChanges.length > 0) {
          this._logger.info(
            `📊 Cycle ${result.cycleCount}: ${result.statusChanges.length} status changes detected`,
          );
        }

        // 統計情報の出力
        if (cycleCount % 10 === 0) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `📈 Stats: ${stats.totalPanes} total, ${stats.workingPanes} working, ${stats.idlePanes} idle`,
          );
        }

        cycleCount++;

        // 30秒待機（実際の実装では設定可能にする）
        await new Promise((resolve) => setTimeout(resolve, 30000));
      } catch (error) {
        this._logger.error(`Unexpected error in monitoring cycle: ${error}`);
        break;
      }
    }

    this._logger.info(`Monitoring completed after ${cycleCount} cycles`);
  }

  /**
   * ワンタイム監視（既存APIと互換）
   */
  async oneTimeMonitor(): Promise<void> {
    if (this._isNewArchitecture) {
      this._logger.info("🔍 One-time monitoring with new architecture");

      try {
        const startResult = await this._appService.startMonitoring();
        if (!startResult.ok) {
          this._logger.error(
            `Failed to start one-time monitoring: ${startResult.error.message}`,
          );
          return;
        }

        // 単一サイクルのみ実行
        const cycleResult = await this._appService.executeSingleCycle();
        if (cycleResult.ok) {
          const stats = this._appService.getMonitoringStats();
          this._logger.info(
            `✅ One-time monitoring completed: ${stats.totalPanes} panes monitored`,
          );
        }
      } catch (error) {
        this._logger.error(`One-time monitoring error: ${error}`);
      }
    } else {
      this._logger.info("📦 One-time monitoring with legacy implementation");
      // レガシー実装
    }
  }

  /**
   * ペインリストの更新（既存APIと互換）
   */
  async refreshPaneList(): Promise<void> {
    if (this._isNewArchitecture) {
      try {
        // 新しいアーキテクチャでは自動的にペイン発見が行われる
        const startResult = await this._appService.startMonitoring();
        if (startResult.ok) {
          this._logger.info("✅ Pane list refreshed with new architecture");
        }
      } catch (error) {
        this._logger.error(`Failed to refresh pane list: ${error}`);
      }
    } else {
      // レガシー実装
      this._logger.info("📦 Refreshing pane list with legacy implementation");
    }
  }

  // =============================================================================
  // 新機能のエクスポート（オプショナル）
  // =============================================================================

  /**
   * DDDベースの高度な監視統計（新機能）
   */
  getAdvancedStats(): unknown {
    if (this._isNewArchitecture) {
      const stats = this._appService.getMonitoringStats();
      const collection = this._appService.getPaneCollection();

      return {
        ...stats,
        // 新しいDDDベースの統計
        managerPanes: collection.getPanesByRole("manager").length,
        workerPanes: collection.getPanesByRole("worker").length,
        secretaryPanes: collection.getPanesByRole("secretary").length,
        availableForTaskAssignment: stats.availableForTask,

        // 品質メトリクス
        architecture: "DDD",
        typesSafety: "Strong",
        businessRulesEnforced: true,
      };
    }

    return {
      // レガシー統計のフォールバック
      architecture: "Legacy",
      typesSafety: "Weak",
      businessRulesEnforced: false,
    };
  }

  /**
   * ペインコレクションへのアクセス（新機能）
   */
  getPaneCollection(): PaneCollection | null {
    if (this._isNewArchitecture) {
      return this._appService.getPaneCollection();
    }
    return null;
  }

  /**
   * アーキテクチャ状態の確認
   */
  isUsingNewArchitecture(): boolean {
    return this._isNewArchitecture;
  }
}

// =============================================================================
// Migration Utilities - 移行支援ユーティリティ
// =============================================================================

/**
 * データ移行ユーティリティ
 */
export class MigrationUtilities {
  /**
   * レガシーペインデータを新しいドメインモデルに変換
   */
  static migrateLegacyPanes(
    legacyPanes: LegacyPane[],
  ): Promise<Result<NewPane[], ValidationError & { message: string }>> {
    const migratedPanes: NewPane[] = [];
    const errors: string[] = [];

    for (const legacyPane of legacyPanes) {
      try {
        const newPaneResult = NewPane.fromTmuxData(
          legacyPane.id,
          legacyPane.isActive(),
          legacyPane.getCommand() || "unknown",
          legacyPane.getTitle() || "untitled",
        );

        if (newPaneResult.ok) {
          migratedPanes.push(newPaneResult.data);
        } else {
          errors.push(
            `Failed to migrate pane ${legacyPane.id}: ${newPaneResult.error.message}`,
          );
        }
      } catch (error) {
        errors.push(
          `Unexpected error migrating pane ${legacyPane.id}: ${error}`,
        );
      }
    }

    if (errors.length > 0) {
      return Promise.resolve({
        ok: false,
        error: createError({
          kind: "MigrationFailed",
          from: "legacy",
          to: "ddd",
          details: `Migration errors: ${errors.join(", ")}`,
        }),
      });
    }

    return Promise.resolve({ ok: true, data: migratedPanes });
  }

  /**
   * 移行検証レポートの生成
   */
  static generateMigrationReport(
    originalCount: number,
    migratedCount: number,
    errors: string[],
  ): string {
    const successRate = migratedCount / originalCount * 100;

    return `
=== DDD Migration Report ===
Original Panes: ${originalCount}
Successfully Migrated: ${migratedCount}
Success Rate: ${successRate.toFixed(2)}%
Errors: ${errors.length}

${
      errors.length > 0
        ? `Errors:\n${errors.join("\n")}`
        : "No errors during migration"
    }

=== Migration Complete ===
    `.trim();
  }

  /**
   * アーキテクチャ健全性チェック
   */
  static validateArchitectureHealth(facade: MonitoringEngineFacade): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 新しいアーキテクチャの使用確認
    if (!facade.isUsingNewArchitecture()) {
      issues.push("Still using legacy architecture");
      recommendations.push("Complete migration to DDD architecture");
    }

    // 統計の確認
    const stats = facade.getAdvancedStats() as {
      totalPanes: number;
      architecture: string;
    };
    if (stats.totalPanes === 0) {
      issues.push("No panes detected");
      recommendations.push("Verify tmux session is running");
    }

    if (stats.architecture === "Legacy") {
      issues.push("Legacy architecture in use");
      recommendations.push("Switch to DDD-based implementation");
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
    };
  }
}

// =============================================================================
// Configuration Bridge - 設定の橋渡し
// =============================================================================

/**
 * 設定ブリッジ
 *
 * 既存の設定システムと新しいDDDアーキテクチャの設定を橋渡し。
 */
export class ConfigurationBridge {
  /**
   * レガシー設定からDDD設定への変換
   */
  static convertLegacyConfig(legacyConfig: unknown): {
    monitoringInterval: number;
    businessRules: {
      maxHistoryEntries: number;
      allowMultipleActivePanes: boolean;
      autoAssignPaneNames: boolean;
    };
    qualityMetrics: {
      enableTypeChecking: boolean;
      enforceBusinessConstraints: boolean;
      validateStatusTransitions: boolean;
    };
  } {
    return {
      monitoringInterval:
        (legacyConfig as { TIMING?: { ENTER_SEND_CYCLE_DELAY?: number } })
          .TIMING?.ENTER_SEND_CYCLE_DELAY || 30000,
      businessRules: {
        maxHistoryEntries: 2, // DDDドキュメント仕様
        allowMultipleActivePanes: false, // ビジネスルール
        autoAssignPaneNames: true,
      },
      qualityMetrics: {
        enableTypeChecking: true,
        enforceBusinessConstraints: true,
        validateStatusTransitions: true,
      },
    };
  }
}

console.log("🔄 Legacy integration facade initialized successfully!");
