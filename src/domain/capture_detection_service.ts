/**
 * Capture Detection Domain Service
 *
 * capture変化検出に関するドメインサービス。
 * 点在していたビジネスロジックを統合し、DDD設計に従った
 * 単一責任のcapture変化検出を提供。
 */

import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";
import type {
  ICaptureAdapter,
  PaneCaptureResult,
} from "../infrastructure/unified_capture_adapter.ts";
import {
  type ActivityStatus,
  CaptureState,
  InputFieldState,
  StatusComparison,
  StatusContextBuilder,
  StatusMapping,
} from "./value_objects.ts";
import type { WorkerStatus } from "../models.ts";

// =============================================================================
// ドメインサービスインターフェース
// =============================================================================

/**
 * Capture変化検出結果
 */
export interface CaptureDetectionResult {
  readonly paneId: string;
  readonly captureResult: PaneCaptureResult;
  readonly activityStatus: ActivityStatus;
  readonly captureState: CaptureState;
  readonly derivedWorkerStatus: WorkerStatus;
  readonly derivationReasoning: readonly string[];
  readonly previousContent: string | null;
  readonly hasContentChanged: boolean;
  readonly timestamp: Date;
}

/**
 * Capture履歴管理
 */
export interface ICaptureHistory {
  getPreviousContent(paneId: string): string | null;
  storeCaptureContent(paneId: string, content: string): void;
  clearHistory(paneId?: string): void;
  getHistorySize(paneId: string): number;
}

// =============================================================================
// Capture履歴管理実装
// =============================================================================

/**
 * InMemoryCaptureHistory
 *
 * メモリベースのcapture履歴管理。
 * 各ペインの前回capture内容を保持。
 */
export class InMemoryCaptureHistory implements ICaptureHistory {
  private readonly history = new Map<string, string>();

  getPreviousContent(paneId: string): string | null {
    return this.history.get(paneId) || null;
  }

  storeCaptureContent(paneId: string, content: string): void {
    this.history.set(paneId, content);
  }

  clearHistory(paneId?: string): void {
    if (paneId) {
      this.history.delete(paneId);
    } else {
      this.history.clear();
    }
  }

  getHistorySize(paneId: string): number {
    return this.history.has(paneId) ? 1 : 0;
  }
}

// =============================================================================
// Capture Detection Domain Service
// =============================================================================

/**
 * CaptureDetectionService
 *
 * capture変化検出のドメインサービス。
 *
 * 【責任】:
 * 1. capture実行のオーケストレーション
 * 2. 変化検出のビジネスロジック
 * 3. ActivityStatus → WorkerStatus変換
 * 4. 統合状態の生成
 *
 * 【設計原則】:
 * - ドメインロジックの集約
 * - 技術詳細の抽象化
 * - 型安全な状態管理
 *
 * @example
 * ```typescript
 * const service = new CaptureDetectionService(adapter, history);
 * const result = await service.detectChanges("%1", ["vim", "Editor"]);
 * if (result.ok) {
 *   console.log("Activity:", result.data.activityStatus.kind);
 *   console.log("Worker Status:", result.data.derivedWorkerStatus.kind);
 * }
 * ```
 */
export class CaptureDetectionService {
  constructor(
    private readonly captureAdapter: ICaptureAdapter,
    private readonly captureHistory: ICaptureHistory,
  ) {}

  /**
   * ペインの変化検出とステータス統合
   *
   * @param paneId - 対象ペインID
   * @param contextHints - コンテキストヒント[title, command, ...]
   * @returns 統合検出結果
   */
  async detectChanges(
    paneId: string,
    contextHints: string[] = [],
  ): Promise<
    Result<CaptureDetectionResult, ValidationError & { message: string }>
  > {
    try {
      // 1. Capture実行
      const captureResult = await this.captureAdapter.capturePane(paneId);
      if (!captureResult.ok) {
        return {
          ok: false,
          error: createError({
            kind: "ValidationFailed",
            input: paneId,
            constraint:
              `Failed to capture pane: ${captureResult.error.message}`,
          }),
        };
      }

      const capture = captureResult.data;
      const currentContent = capture.content;
      const captureLines = capture.lines;

      // 2. 前回コンテンツとの比較（STATUS観点）
      const previousContent = this.captureHistory.getPreviousContent(paneId);
      const statusComparisonResult = StatusComparison.create(
        previousContent,
        currentContent,
      );
      if (!statusComparisonResult.ok) {
        return {
          ok: false,
          error: statusComparisonResult.error,
        };
      }

      // 3. 入力欄解析（INPUT観点）
      const inputFieldStateResult = InputFieldState.create([...captureLines]);
      if (!inputFieldStateResult.ok) {
        return {
          ok: false,
          error: inputFieldStateResult.error,
        };
      }

      // 4. CaptureState統合
      const captureStateResult = CaptureState.create(
        statusComparisonResult.data,
        inputFieldStateResult.data,
      );
      if (!captureStateResult.ok) {
        return {
          ok: false,
          error: captureStateResult.error,
        };
      }

      // 5. StatusContext構築
      const statusContext = StatusContextBuilder.create()
        .withCaptureContent([...captureLines])
        .withTitleHints(contextHints.slice(0, 1)) // 最初の要素をタイトル
        .withCommandHints(contextHints.slice(1)) // 残りをコマンド
        .build();

      // 6. ActivityStatus → WorkerStatus変換
      const activityStatus = captureStateResult.data.activityStatus;
      const statusMappingResult = StatusMapping.create(
        activityStatus,
        statusContext,
      );
      if (!statusMappingResult.ok) {
        return {
          ok: false,
          error: statusMappingResult.error,
        };
      }

      const derivedWorkerStatus = statusMappingResult.data.deriveWorkerStatus();
      const derivationInfo = statusMappingResult.data.getDerivationInfo();

      // 7. 履歴更新
      this.captureHistory.storeCaptureContent(paneId, currentContent);

      // 8. 結果構築
      const detectionResult: CaptureDetectionResult = {
        paneId,
        captureResult: capture,
        activityStatus,
        captureState: captureStateResult.data,
        derivedWorkerStatus,
        derivationReasoning: derivationInfo.reasoning,
        previousContent,
        hasContentChanged: statusComparisonResult.data.hasChanges,
        timestamp: new Date(),
      };

      return { ok: true, data: detectionResult };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "detectChanges",
          details: `Unexpected error in capture detection: ${error}`,
        }),
      };
    }
  }

  /**
   * 複数ペインの一括変化検出
   */
  async detectMultipleChanges(
    paneIds: string[],
    contextHintsMap: Map<string, string[]> = new Map(),
  ): Promise<
    Result<
      Map<string, CaptureDetectionResult>,
      ValidationError & { message: string }
    >
  > {
    const results = new Map<string, CaptureDetectionResult>();
    const errors: string[] = [];

    // 並行実行
    const promises = paneIds.map(async (paneId) => {
      const contextHints = contextHintsMap.get(paneId) || [];
      const result = await this.detectChanges(paneId, contextHints);

      if (result.ok) {
        results.set(paneId, result.data);
      } else {
        errors.push(`${paneId}: ${result.error.message}`);
      }
    });

    await Promise.all(promises);

    // エラーハンドリング
    if (errors.length > 0) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: paneIds.join(", "),
          constraint: `Failed to detect changes for some panes: ${
            errors.join("; ")
          }`,
        }),
      };
    }

    return { ok: true, data: results };
  }

  /**
   * 特定ペインの履歴クリア
   */
  clearPaneHistory(paneId: string): void {
    this.captureHistory.clearHistory(paneId);
  }

  /**
   * 全履歴クリア
   */
  clearAllHistory(): void {
    this.captureHistory.clearHistory();
  }

  /**
   * ペインの履歴サイズ取得
   */
  getPaneHistorySize(paneId: string): number {
    return this.captureHistory.getHistorySize(paneId);
  }
}
