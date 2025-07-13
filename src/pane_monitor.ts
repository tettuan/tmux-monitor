/**
 * Pane content monitoring and status tracking module
 *
 * Implements 30-second interval monitoring of pane content changes
 * to determine WORKING/IDLE status and update pane titles accordingly.
 */

import type { CommandExecutor, Logger } from "./services.ts";
import type { Result, ValidationError } from "./types.ts";
import { createError } from "./types.ts";

/**
 * Pane content capture for comparison
 */
export interface PaneCapture {
  paneId: string;
  content: string;
  timestamp: Date;
}

/**
 * Pane monitoring status
 */
export type PaneMonitorStatus = "WORKING" | "IDLE";

/**
 * Pane monitoring result
 */
export interface PaneMonitorResult {
  paneId: string;
  status: PaneMonitorStatus;
  hasChanges: boolean;
  lastCapture?: PaneCapture;
  previousCapture?: PaneCapture;
}

/**
 * Pane content monitor that tracks changes over time
 */
export class PaneContentMonitor {
  private captures: Map<string, PaneCapture[]> = new Map();
  private readonly maxCaptureHistory = 10; // Keep last 10 captures per pane

  constructor(
    private commandExecutor: CommandExecutor,
    private logger: Logger,
  ) {}

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
   * Capture pane content using tmux capture-pane command
   */
  async capturePane(
    paneId: string,
  ): Promise<Result<PaneCapture, ValidationError & { message: string }>> {
    try {
      const result = await this.commandExecutor.execute([
        "tmux",
        "capture-pane",
        "-t",
        paneId,
        "-p", // print to stdout
      ]);

      if (!result.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: `tmux capture-pane -t ${paneId} -p`,
            stderr: result.error.message,
          }),
        };
      }

      const capture: PaneCapture = {
        paneId,
        content: result.data,
        timestamp: new Date(),
      };

      // Store capture in history
      this.storeCaptureInHistory(paneId, capture);

      return { ok: true, data: capture };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux capture-pane -t ${paneId} -p`,
          stderr: `Failed to capture pane ${paneId}: ${error}`,
        }),
      };
    }
  }

  /**
   * Compare current pane content with previous capture
   */
  async monitorPane(
    paneId: string,
  ): Promise<Result<PaneMonitorResult, ValidationError & { message: string }>> {
    const captureResult = await this.capturePane(paneId);
    if (!captureResult.ok) {
      return { ok: false, error: captureResult.error };
    }

    const currentCapture = captureResult.data;
    const paneHistory = this.captures.get(paneId) || [];

    // For first capture, assume IDLE (no previous data to compare)
    if (paneHistory.length <= 1) {
      this.logger.info(
        `[MONITOR] First capture for pane ${paneId}, defaulting to IDLE`,
      );
      return {
        ok: true,
        data: {
          paneId,
          status: "IDLE",
          hasChanges: false,
          lastCapture: currentCapture,
        },
      };
    }

    // Compare with previous capture
    const previousCapture = paneHistory[paneHistory.length - 2]; // Second to last
    const hasChanges = this.hasContentChanged(previousCapture, currentCapture);
    const status: PaneMonitorStatus = hasChanges ? "WORKING" : "IDLE";

    this.logger.info(
      `[MONITOR] Pane ${paneId}: ${status} (changes: ${hasChanges})`,
    );

    return {
      ok: true,
      data: {
        paneId,
        status,
        hasChanges,
        lastCapture: currentCapture,
        previousCapture,
      },
    };
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
        });
      }
    }

    return results;
  }

  /**
   * Check if content has changed between two captures
   */
  private hasContentChanged(
    previous: PaneCapture,
    current: PaneCapture,
  ): boolean {
    if (!previous || !current) return false;

    // Normalize content for comparison (trim whitespace and normalize line endings)
    const prevContent = this.normalizeContent(previous.content);
    const currContent = this.normalizeContent(current.content);

    return prevContent !== currContent;
  }

  /**
   * Normalize content for comparison
   */
  private normalizeContent(content: string): string {
    return content
      .trim()
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\s+$/gm, ""); // Remove trailing whitespace from each line
  }

  /**
   * Store capture in pane history with size limit
   */
  private storeCaptureInHistory(paneId: string, capture: PaneCapture): void {
    let history = this.captures.get(paneId) || [];

    history.push(capture);

    // Keep only recent captures
    if (history.length > this.maxCaptureHistory) {
      history = history.slice(-this.maxCaptureHistory);
    }

    this.captures.set(paneId, history);
  }

  /**
   * Get capture history for a pane
   */
  getCaptureHistory(paneId: string): PaneCapture[] {
    return this.captures.get(paneId) || [];
  }

  /**
   * Clear capture history for a pane
   */
  clearPaneHistory(paneId: string): void {
    this.captures.delete(paneId);
  }

  /**
   * Clear all capture history
   */
  clearAllHistory(): void {
    this.captures.clear();
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
   * Update pane title with status information
   */
  async updatePaneTitle(
    paneId: string,
    status: PaneMonitorStatus,
    originalTitle?: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
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

      const newTitle = `[${status}] ${baseTitle}`;

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
  ): Promise<void> {
    for (const result of monitorResults) {
      const originalTitle = originalTitles?.get(result.paneId);
      const titleResult = await this.updatePaneTitle(
        result.paneId,
        result.status,
        originalTitle,
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
   */
  cleanTitle(title: string): string {
    if (!title) return "";

    // Remove patterns like [WORKING], [IDLE], [TERMINATED], etc.
    // Also handle multiple prefixes that might have accumulated
    let cleaned = title;
    let previousLength = 0;

    // Keep cleaning until no more changes occur (handles multiple prefixes)
    while (cleaned.length !== previousLength) {
      previousLength = cleaned.length;
      cleaned = cleaned.replace(
        /^\[(?:WORKING|IDLE|TERMINATED|DONE|UNKNOWN)\]\s*/,
        "",
      ).trim();
    }

    return cleaned;
  }

  /**
   * Get current pane title for cleaning
   */
  private async getCurrentPaneTitle(paneId: string): Promise<string> {
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
