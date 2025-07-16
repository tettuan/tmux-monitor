/**
 * Pane content monitoring and status tracking module
 *
 * Implements 30-second interval monitoring of pane content changes
 * to determine WORKING/IDLE status and update pane titles accordingly.
 *
 * 【統合版】: 統合CaptureDetectionServiceを使用してcapture機能を統一
 */

import type { CommandExecutor, Logger } from "./services.ts";
import type { Result, ValidationError } from "./types.ts";
import { createError } from "./types.ts";
import {
  CaptureDetectionService,
  InMemoryCaptureHistory,
} from "./domain/capture_detection_service.ts";
import { TmuxCaptureAdapter } from "./infrastructure/unified_capture_adapter.ts";
import type { CaptureDetectionResult } from "./domain/capture_detection_service.ts";

/**
 * 【統合版】Pane監視結果
 * 古いPaneCaptureとPaneMonitorResultを統合し、CaptureDetectionResultを使用
 */
export interface PaneMonitorResult {
  readonly paneId: string;
  readonly status: "WORKING" | "IDLE";
  readonly hasChanges: boolean;
  readonly captureDetectionResult?: CaptureDetectionResult;
  readonly timestamp: Date;
}

/**
 * CommandExecutorアダプター
 * unified_capture_adapter.tsのICommandExecutorに適合させる
 */
class CommandExecutorAdapter {
  constructor(private executor: CommandExecutor) {}

  async execute(command: string[]): Promise<Result<string, Error>> {
    const result = await this.executor.execute(command);
    if (result.ok) {
      return { ok: true, data: result.data };
    } else {
      return { ok: false, error: new Error(result.error.message) };
    }
  }
}

/**
 * 【統合版】Pane content monitor that tracks changes over time
 *
 * 統合CaptureDetectionServiceを使用してcapture機能を一元化。
 * 既存のPaneCapture履歴管理から新しいサービスベースの実装に移行。
 */
export class PaneContentMonitor {
  private readonly captureDetectionService: CaptureDetectionService;

  constructor(
    private commandExecutor: CommandExecutor,
    private logger: Logger,
  ) {
    // 統合サービスの初期化
    const commandAdapter = new CommandExecutorAdapter(commandExecutor);
    const captureAdapter = new TmuxCaptureAdapter(commandAdapter);
    const captureHistory = new InMemoryCaptureHistory();
    this.captureDetectionService = new CaptureDetectionService(
      captureAdapter,
      captureHistory,
    );
  }

  /**
   * Create a new PaneContentMonitor instance
   */
  static create(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): PaneContentMonitor {
    return new PaneContentMonitor(commandExecutor, logger);
  }

  /**
   * 【統合版】Monitor single pane using CaptureDetectionService
   *
   * 既存のcapturePane + monitorPaneを統合し、
   * CaptureDetectionServiceを使用して統一的な監視を実行。
   */
  async monitorPane(
    paneId: string,
  ): Promise<Result<PaneMonitorResult, ValidationError & { message: string }>> {
    try {
      // 統合capture検出サービスを使用
      const detectionResult = await this.captureDetectionService.detectChanges(
        paneId,
      );

      if (!detectionResult.ok) {
        this.logger.warn(
          `[MONITOR] Failed to detect changes for pane ${paneId}: ${detectionResult.error.message}`,
        );
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `capture detection for pane ${paneId}`,
            stderr: detectionResult.error.message,
          }),
        };
      }

      const detection = detectionResult.data;

      // ActivityStatusからモニタリングステータスを判定
      const activityStatus = detection.captureState.activityStatus;
      const hasChanges = activityStatus.kind === "WORKING";
      const status: "WORKING" | "IDLE" = hasChanges ? "WORKING" : "IDLE";

      this.logger.info(
        `[MONITOR] Pane ${paneId}: ${status} (activity: ${activityStatus.kind})`,
      );

      const result: PaneMonitorResult = {
        paneId,
        status,
        hasChanges,
        captureDetectionResult: detection,
        timestamp: new Date(),
      };

      return { ok: true, data: result };
    } catch (error) {
      this.logger.error(
        `[MONITOR] Unexpected error monitoring pane ${paneId}: ${error}`,
      );
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "monitorPane",
          details: `Unexpected error: ${error}`,
        }),
      };
    }
  }

  /**
   * Monitor multiple panes and return their statuses
   */
  async monitorPanes(paneIds: string[]): Promise<PaneMonitorResult[]> {
    const results: PaneMonitorResult[] = [];

    for (const paneId of paneIds) {
      const result = await this.monitorPane(paneId);
      if (result.ok) {
        results.push(result.data);
      } else {
        this.logger.warn(
          `Failed to monitor pane ${paneId}: ${result.error.message}`,
        );
        // Add error result as IDLE status
        results.push({
          paneId,
          status: "IDLE",
          hasChanges: false,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * 【廃止予定】Legacy methods - replaced by CaptureDetectionService
   *
   * 以下のメソッドは統合版で非推奨。CaptureDetectionServiceを直接使用すること。
   */

  getCaptureHistory(
    paneId: string,
  ): Array<{ content: string; timestamp: Date }> {
    this.logger.warn(
      `getCaptureHistory is deprecated for pane ${paneId}. Use CaptureDetectionService instead.`,
    );
    return [];
  }

  clearPaneHistory(paneId: string): void {
    this.logger.warn(
      `clearPaneHistory is deprecated for pane ${paneId}. History is managed by CaptureDetectionService.`,
    );
  }

  clearAllHistory(): void {
    this.logger.warn(
      "clearAllHistory is deprecated. History is managed by CaptureDetectionService.",
    );
  }
}

/**
 * Pane title manager for updating pane titles based on status
 */
export class PaneTitleManager {
  constructor(
    private commandExecutor: CommandExecutor,
    private logger: Logger,
  ) {}

  /**
   * Create a new PaneTitleManager instance
   */
  static create(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): PaneTitleManager {
    return new PaneTitleManager(commandExecutor, logger);
  }

  /**
   * Check if a pane exists
   */
  private async paneExists(paneId: string): Promise<boolean> {
    try {
      const result = await this.commandExecutor.execute([
        "tmux",
        "list-panes",
        "-a",
        "-F",
        "#{pane_id}",
      ]);

      if (!result.ok) {
        return false;
      }

      const existingPanes = result.data.split("\n").filter((id) =>
        id.trim() !== ""
      );
      return existingPanes.includes(paneId);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Update pane title with status information and pane name
   */
  async updatePaneTitle(
    paneId: string,
    status: "WORKING" | "IDLE",
    originalTitle?: string,
    paneName?: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      // Check if pane exists before attempting to update title
      if (!(await this.paneExists(paneId))) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux select-pane -t ${paneId}`,
            stderr: `Pane ${paneId} does not exist`,
          }),
        };
      }

      // Get current title and clean it from existing status prefixes
      let baseTitle: string;
      if (originalTitle) {
        baseTitle = this.cleanTitle(originalTitle);
      } else {
        const currentTitle = await this.getCurrentPaneTitle(paneId);
        const cleanedTitle = this.cleanTitle(currentTitle);

        // If cleaning didn't change the title (no status prefix was present), use the current title as-is
        // Only fallback to "tmux" if the title is completely empty
        if (cleanedTitle === "") {
          baseTitle = currentTitle || "tmux";
        } else {
          baseTitle = cleanedTitle;
        }
      }

      // Create title with status, pane name (if provided), and base title
      let newTitle: string;
      if (paneName) {
        newTitle = `[${status}] ${paneName}: ${baseTitle}`;
      } else {
        newTitle = `[${status}] ${baseTitle}`;
      }

      const result = await this.commandExecutor.execute([
        "tmux",
        "select-pane",
        "-t",
        paneId,
        "-T",
        newTitle,
      ]);

      if (!result.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux select-pane -t ${paneId} -T "${newTitle}"`,
            stderr: result.error.message,
          }),
        };
      }

      this.logger.info(`[TITLE] Updated pane ${paneId} title to: ${newTitle}`);
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux select-pane -t ${paneId} -T`,
          stderr: `Failed to update title for pane ${paneId}: ${error}`,
        }),
      };
    }
  }

  /**
   * Update multiple pane titles based on monitoring results
   */
  async updatePaneTitles(
    monitorResults: PaneMonitorResult[],
    originalTitles?: Map<string, string>,
    paneNames?: Map<string, string>,
  ): Promise<void> {
    for (const result of monitorResults) {
      const originalTitle = originalTitles?.get(result.paneId);
      const paneName = paneNames?.get(result.paneId);
      const titleResult = await this.updatePaneTitle(
        result.paneId,
        result.status,
        originalTitle,
        paneName,
      );

      if (!titleResult.ok) {
        this.logger.warn(
          `Failed to update title for pane ${result.paneId}: ${titleResult.error.message}`,
        );
      }
    }
  }

  /**
   * Restore original pane title (remove status prefix)
   */
  async restorePaneTitle(
    paneId: string,
    originalTitle: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      // Check if pane exists before attempting to restore title
      if (!(await this.paneExists(paneId))) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux select-pane -t ${paneId}`,
            stderr: `Pane ${paneId} does not exist`,
          }),
        };
      }

      const result = await this.commandExecutor.execute([
        "tmux",
        "select-pane",
        "-t",
        paneId,
        "-T",
        originalTitle,
      ]);

      if (!result.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux select-pane -t ${paneId} -T "${originalTitle}"`,
            stderr: result.error.message,
          }),
        };
      }

      this.logger.info(
        `[TITLE] Restored pane ${paneId} title to: ${originalTitle}`,
      );
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux select-pane -t ${paneId} -T`,
          stderr: `Failed to restore title for pane ${paneId}: ${error}`,
        }),
      };
    }
  }

  /**
   * Remove existing status prefix from title to prevent duplication
   * Also handles repeated role names like "role: role: role:"
   */
  cleanTitle(title: string): string {
    if (!title) return "";

    let cleaned = title;
    let previousLength = 0;

    // Keep cleaning until no more changes occur (handles multiple prefixes and role duplications)
    while (cleaned.length !== previousLength) {
      previousLength = cleaned.length;

      // Remove status prefixes like [WORKING], [IDLE], [TERMINATED], etc.
      // Also remove status with timestamps like [DONE 07/14 22:08]
      cleaned = cleaned.replace(
        /^\[(?:WORKING|IDLE|TERMINATED|DONE|UNKNOWN)(?:\s+\d{2}\/\d{2}\s+\d{2}:\d{2})?\]\s*/,
        "",
      ).trim();

      // Remove repeated role names like "manager1: manager1: manager1:"
      // Match any word followed by colon that repeats
      cleaned = cleaned.replace(
        /^(\w+):\s*(\1:\s*)+/g,
        "$1: ",
      ).trim();

      // Remove repeated role names like "worker3: worker3: worker3:"
      cleaned = cleaned.replace(
        /^(\w+\d*):\s*(\1:\s*)+/g,
        "$1: ",
      ).trim();
    }

    return cleaned;
  }

  /**
   * Get current pane title for cleaning
   */
  private async getCurrentPaneTitle(paneId: string): Promise<string> {
    // Check if pane exists first
    if (!(await this.paneExists(paneId))) {
      return "tmux"; // fallback for non-existent panes
    }

    const result = await this.commandExecutor.execute([
      "tmux",
      "display",
      "-p",
      "-t",
      paneId,
      "-F",
      "#{pane_title}",
    ]);

    if (result.ok) {
      return result.data.trim();
    }
    return "tmux"; // fallback
  }
}
