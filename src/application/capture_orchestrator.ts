/**
 * Capture Orchestrator - アプリケーション層
 *
 * 点在していたcapture機能を統合し、一元的なcapture処理を提供。
 * DDD設計に従い、ドメインサービスを活用してアプリケーション機能を実現。
 */

import type { Result, ValidationError } from "../core/types.ts";
import { createError } from "../core/types.ts";
import { CaptureDetectionService } from "../domain/capture_detection_service.ts";
import {
  type ICommandExecutor,
  TmuxCaptureAdapter,
} from "../infrastructure/unified_capture_adapter.ts";
import { InMemoryCaptureHistory } from "../domain/capture_detection_service.ts";
import type { Pane } from "../domain/pane.ts";

/**
 * Capture処理の統合設定
 */
export interface CaptureOrchestratorConfig {
  /** capture間隔（秒） */
  readonly captureIntervalSeconds: number;
  /** capture履歴保持数（ペインごと） */
  readonly maxHistoryPerPane: number;
  /** エラー時のリトライ回数 */
  readonly maxRetries: number;
}

/**
 * Capture処理結果サマリー
 */
export interface CaptureProcessResult {
  /** 処理したペイン数 */
  readonly processedPanes: number;
  /** 成功したペイン数 */
  readonly successfulPanes: number;
  /** エラーが発生したペイン */
  readonly errorPanes: Array<{
    paneId: string;
    error: string;
  }>;
  /** 変化が検出されたペイン */
  readonly changedPanes: string[];
  /** 処理時間（ミリ秒） */
  readonly processingTimeMs: number;
}

// CaptureOrchestrator実装

/**
 * CaptureOrchestrator
 *
 * アプリケーション層でのcapture処理オーケストレーション。
 * 複数のペインに対する統合的なcapture処理を管理し、
 * 既存の分散実装を置き換える。
 *
 * 主な責務：
 * 1. 複数ペインの一括capture処理
 * 2. エラーハンドリングとリトライ制御
 * 3. パフォーマンス監視
 * 4. 統計情報の提供
 *
 * 使用例：
 * ```typescript
 * const orchestrator = new CaptureOrchestrator(config, commandExecutor);
 * const result = await orchestrator.processAllPanes(panes);
 * console.log(`Processed ${result.processedPanes} panes`);
 * ```
 */
import { globalCancellationToken } from "../core/cancellation.ts";

export class CaptureOrchestrator {
  private readonly captureDetectionService: CaptureDetectionService;

  constructor(
    private readonly config: CaptureOrchestratorConfig,
    private readonly commandExecutor: ICommandExecutor,
  ) {
    // 統合サービスの初期化
    const captureAdapter = new TmuxCaptureAdapter(commandExecutor);
    const captureHistory = new InMemoryCaptureHistory();
    this.captureDetectionService = new CaptureDetectionService(
      captureAdapter,
      captureHistory,
    );
  }

  /**
   * 全ペインのcapture処理（一括実行）
   *
   * 複数のペインに対して統合されたcapture処理を実行し、
   * 各ペインの状態を更新する。
   */
  async processAllPanes(
    panes: Pane[],
  ): Promise<
    Result<CaptureProcessResult, ValidationError & { message: string }>
  > {
    const startTime = Date.now();
    let successfulPanes = 0;
    const errorPanes: Array<{ paneId: string; error: string }> = [];
    const changedPanes: string[] = [];

    try {
      // 並列処理でパフォーマンス向上
      const promises = panes.map(async (pane) => {
        // Check cancellation before processing each pane
        if (globalCancellationToken.isCancelled()) {
          return;
        }
        const result = await this.processSinglePane(pane);
        if (result.ok) {
          successfulPanes++;
          if (result.data.hasChanged) {
            changedPanes.push(pane.id.value);
          }
        } else {
          errorPanes.push({
            paneId: pane.id.value,
            error: result.error.message,
          });
        }
        return result;
      });

      // Check for cancellation before waiting for all promises
      if (globalCancellationToken.isCancelled()) {
        return {
          ok: false,
          error: createError({
            kind: "InvalidState",
            current: "cancelled",
            expected: "running",
          }),
        };
      }
      
      await Promise.all(promises);

      const processingTimeMs = Date.now() - startTime;

      const summary: CaptureProcessResult = {
        processedPanes: panes.length,
        successfulPanes,
        errorPanes,
        changedPanes,
        processingTimeMs,
      };

      return { ok: true, data: summary };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          constraint: `Unexpected error during batch processing: ${error}`,
          input: `panes: ${panes.length}`,
        }),
      };
    }
  }

  /**
   * 単一ペインのcapture処理
   *
   * 統合CaptureDetectionServiceを使用してペインの
   * capture状態を検出・更新する。
   */
  async processSinglePane(
    pane: Pane,
  ): Promise<
    Result<{ hasChanged: boolean }, ValidationError & { message: string }>
  > {
    let retries = 0;

    while (retries <= this.config.maxRetries) {
      try {
        // 統合capture検出サービスを使用
        const detectionResult = await this.captureDetectionService
          .detectChanges(pane.id.value);

        if (!detectionResult.ok) {
          retries++;
          if (retries > this.config.maxRetries) {
            return {
              ok: false,
              error: createError({
                kind: "ValidationFailed",
                constraint:
                  `Failed after ${this.config.maxRetries} retries: ${detectionResult.error.message}`,
                input: `paneId: ${pane.id.value}`,
              }),
            };
          }
          continue; // リトライ
        }

        // ペインのcapture状態を更新（統合版を使用）
        const updateResult = pane.updateCaptureStateFromDetection(
          detectionResult.data,
        );

        if (!updateResult.ok) {
          return {
            ok: false,
            error: createError({
              kind: "ValidationFailed",
              constraint:
                `Failed to update pane state: ${updateResult.error.message}`,
              input: `paneId: ${pane.id.value}`,
            }),
          };
        }

        // 変化検出の判定
        const hasChanged =
          detectionResult.data.captureState.activityStatus.kind === "WORKING";

        return { ok: true, data: { hasChanged } };
      } catch (error) {
        retries++;
        if (retries > this.config.maxRetries) {
          return {
            ok: false,
            error: createError({
              kind: "ValidationFailed",
              constraint:
                `Unexpected error after ${this.config.maxRetries} retries: ${error}`,
              input: `paneId: ${pane.id.value}`,
            }),
          };
        }
      }
    }

    // Should never reach here
    return {
      ok: false,
      error: createError({
        kind: "ValidationFailed",
        constraint: "Unexpected control flow",
        input: `paneId: ${pane.id.value}`,
      }),
    };
  }

  /**
   * capture処理統計の取得
   *
   * パフォーマンス監視用の統計情報を提供。
   */
  getStatistics(): {
    readonly config: CaptureOrchestratorConfig;
    readonly serviceStatus: string;
  } {
    return {
      config: this.config,
      serviceStatus: "ready",
    };
  }
}

// デフォルト設定

/**
 * デフォルトのCaptureOrchestrator設定
 */
export const DEFAULT_CAPTURE_CONFIG: CaptureOrchestratorConfig = {
  captureIntervalSeconds: 30,
  maxHistoryPerPane: 10,
  maxRetries: 2,
};
