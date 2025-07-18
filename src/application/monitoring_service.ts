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
  private readonly _captureDetectionService?:
    import("../domain/capture_detection_service.ts").CaptureDetectionService;

  constructor(
    tmuxRepository: ITmuxSessionRepository,
    communicator: IPaneCommunicator,
    captureDetectionService?:
      import("../domain/capture_detection_service.ts").CaptureDetectionService,
  ) {
    this._tmuxRepository = tmuxRepository;
    this._communicator = communicator;
    this._paneCollection = new PaneCollection();
    this._captureDetectionService = captureDetectionService;
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

    return { ok: true, data: undefined };
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
      console.log(`🔍 DEBUG: Found ${allPanes.length} panes:`);
      allPanes.slice(0, 5).forEach((pane) => {
        const statusStr = pane.status.kind || "unknown";
        console.log(
          `  - ${pane.id.value}: ${
            pane.name?.value || "unnamed"
          } (active: ${pane.isActive}) status: ${statusStr}`,
        );
      });
      if (allPanes.length > 5) {
        console.log(`  ... and ${allPanes.length - 5} more panes`);
      }
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

export interface MonitoringStats {
  totalPanes: number;
  activePanes: number;
  workingPanes: number;
  idlePanes: number;
  donePanes: number;
  terminatedPanes: number;
  availableForTask: number;
}
