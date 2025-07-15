import { createError, type Result, type ValidationError } from "./types.ts";
import {
  Pane,
  PaneDetail,
  type WorkerStatus,
  WorkerStatusParser,
} from "./models.ts";
import type { CommandExecutor, Logger } from "./services.ts";
import { WORKER_STATUS_TYPES } from "./config.ts";
import { comparePaneIds, getPaneNameById, sortPaneIds } from "./utils.ts";

// =============================================================================
// Pane Processing and Management
// =============================================================================

/**
 * Processes and parses pane data from tmux command output.
 *
 * Handles the parsing of tmux pane information strings into structured data objects
 * with comprehensive validation and error handling using Result types.
 *
 * @example
 * ```typescript
 * const processor = new PaneDataProcessor(commandExecutor);
 * const result = processor.parsePaneInfo("session:window.pane command");
 * if (result.ok) {
 *   console.log("Parsed pane:", result.data);
 * }
 * ```
 */
export class PaneDataProcessor {
  constructor(private commandExecutor: CommandExecutor) {}

  parsePaneInfo(
    line: string,
  ): Result<Pane, ValidationError & { message: string }> {
    if (!line || line.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    const parts = line.split(" ");
    if (parts.length < 2) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: line,
          expected: "pane_id active_flag [command] [title]",
        }),
      };
    }

    const paneId = parts[0];
    const activeStr = parts[1];
    const command = parts.length > 2 ? parts[2] : undefined;
    const title = parts.length > 3 ? parts.slice(3).join(" ") : undefined;

    const active = activeStr === "1";
    return Pane.create(paneId, active, command, title);
  }

  async getPaneDetail(
    paneId: string,
    _logger: Logger,
  ): Promise<Result<PaneDetail, ValidationError & { message: string }>> {
    const commandResult = await this.commandExecutor.executeTmuxCommand(
      `tmux display -p -t "${paneId}" -F 'Session: #{session_name}
Window: #{window_index} #{window_name}
Pane ID: #{pane_id}
Pane Index: #{pane_index}
TTY: #{pane_tty}
PID: #{pane_pid}
Current Command: #{pane_current_command}
Current Path: #{pane_current_path}
Title: #{pane_title}
Active: #{pane_active}
Zoomed: #{window_zoomed_flag}
Pane Width: #{pane_width}
Pane Height: #{pane_height}
Start Command: #{pane_start_command}'`,
    );

    if (!commandResult.ok) {
      return { ok: false, error: commandResult.error };
    }

    const lines = commandResult.data.split("\n");
    const rawData = {
      sessionName: "",
      windowIndex: "",
      windowName: "",
      paneId: "",
      paneIndex: "",
      tty: "",
      pid: "",
      currentCommand: "",
      currentPath: "",
      title: "",
      active: "",
      zoomed: "",
      width: "",
      height: "",
      startCommand: "",
    };

    for (const line of lines) {
      const [key, ...valueParts] = line.split(": ");
      const value = valueParts.join(": ");

      switch (key) {
        case "Session":
          rawData.sessionName = value;
          break;
        case "Window": {
          const windowParts = value.split(" ");
          rawData.windowIndex = windowParts[0];
          rawData.windowName = windowParts.slice(1).join(" ");
          break;
        }
        case "Pane ID":
          rawData.paneId = value;
          break;
        case "Pane Index":
          rawData.paneIndex = value;
          break;
        case "TTY":
          rawData.tty = value;
          break;
        case "PID":
          rawData.pid = value;
          break;
        case "Current Command":
          rawData.currentCommand = value;
          break;
        case "Current Path":
          rawData.currentPath = value;
          break;
        case "Title":
          rawData.title = value;
          break;
        case "Active":
          rawData.active = value;
          break;
        case "Zoomed":
          rawData.zoomed = value;
          break;
        case "Pane Width":
          rawData.width = value;
          break;
        case "Pane Height":
          rawData.height = value;
          break;
        case "Start Command":
          rawData.startCommand = value;
          break;
      }
    }

    return PaneDetail.create(
      rawData.sessionName,
      rawData.windowIndex,
      rawData.windowName,
      rawData.paneId,
      rawData.paneIndex,
      rawData.tty,
      rawData.pid,
      rawData.currentCommand,
      rawData.currentPath,
      rawData.title,
      rawData.active,
      rawData.zoomed,
      rawData.width,
      rawData.height,
      rawData.startCommand,
    );
  }

  countSessionOccurrences(sessionNames: string[]): Map<string, number> {
    const sessionCounts = new Map<string, number>();
    for (const session of sessionNames) {
      sessionCounts.set(session, (sessionCounts.get(session) || 0) + 1);
    }
    return sessionCounts;
  }

  findMostFrequentSession(sessionCounts: Map<string, number>): string {
    let maxCount = 0;
    let mostActiveSession = "";
    for (const [session, count] of sessionCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveSession = session;
      }
    }
    return mostActiveSession;
  }

  /**
   * Get the actual visible content of a pane for clear state verification
   * @param paneId - The pane ID to capture content from
   * @param logger - Logger instance
   * @returns Promise<Result<string, ValidationError & { message: string }>> - The pane content
   */
  async getPaneContent(
    paneId: string,
    logger: Logger,
  ): Promise<Result<string, ValidationError & { message: string }>> {
    try {
      // Capture last few lines of pane content
      const commandResult = await this.commandExecutor.executeTmuxCommand(
        `tmux capture-pane -t "${paneId}" -p -S -10`,
      );

      if (!commandResult.ok) {
        logger.warn(
          `Failed to capture pane content for ${paneId}: ${commandResult.error.message}`,
        );
        return { ok: false, error: commandResult.error };
      }

      return { ok: true, data: commandResult.data };
    } catch (error) {
      const errorMessage = `Error capturing pane content: ${error}`;
      logger.error(errorMessage);
      return {
        ok: false,
        error: {
          kind: "CommandFailed" as const,
          message: errorMessage,
          command: `tmux capture-pane -t "${paneId}" -p -S -10`,
          stderr: String(error),
        },
      };
    }
  }
}

/**
 * Analyzes pane status and extracts meaningful information from pane data.
 *
 * Provides analysis capabilities for determining pane types, command classifications,
 * and status extraction from tmux pane titles and commands.
 *
 * @example
 * ```typescript
 * const analyzer = new StatusAnalyzer(logger);
 * const isNode = analyzer.isNodeCommand("node server.js");
 * const status = analyzer.extractStatusFromTitle("WORKING - Processing");
 * ```
 */
export class StatusAnalyzer {
  constructor(private logger: Logger) {}

  isNodeCommand(command: string): boolean {
    // Edge case handling: null, undefined, or empty command
    if (!command || typeof command !== "string") {
      return false;
    }

    // Normalize command string (trim and lowercase for comparison)
    const normalizedCommand = command.trim().toLowerCase();
    if (normalizedCommand === "") {
      return false;
    }

    // Node.js runtime and package managers
    const nodePatterns = [
      "node",
      "nodejs",
      "npm",
      "npx",
      "yarn",
      "pnpm",
      "deno",
      "bun",
    ];

    // Framework and build tools
    const frameworkPatterns = [
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

    // Test for exact matches or as part of commands
    const allPatterns = [...nodePatterns, ...frameworkPatterns];

    try {
      return allPatterns.some((pattern) => {
        return normalizedCommand === pattern ||
          normalizedCommand.includes(`${pattern} `) ||
          normalizedCommand.includes(`/${pattern}`);
      });
    } catch (error) {
      this.logger.error(
        `Error in isNodeCommand for command "${command}":`,
        error,
      );
      return false;
    }
  }

  extractStatusFromTitle(title: string): WorkerStatus {
    if (!title || typeof title !== "string") {
      return WorkerStatusParser.parse("UNKNOWN");
    }

    const normalizedTitle = title.trim().toUpperCase();
    
    // デバッグ用：タイトルと検出ロジックを出力
    console.log(`🎯 DEBUG Status extraction: title="${title}" normalized="${normalizedTitle}"`);

    for (const status of WORKER_STATUS_TYPES) {
      if (normalizedTitle.includes(status)) {
        console.log(`✅ Status found: ${status} in "${normalizedTitle}"`);
        return WorkerStatusParser.parse(status);
      }
    }

    console.log(`❌ No status found in: "${normalizedTitle}"`);
    return WorkerStatusParser.parse("UNKNOWN");
  }

  determineStatus(paneDetail: PaneDetail): WorkerStatus {
    try {
      const command = paneDetail.currentCommand || "";
      const title = paneDetail.title || "";
      const pid = paneDetail.pid || "";

      // Strategy 1: First check if status is already explicitly in title
      const existingStatus = this.extractStatusFromTitle(title);
      if (existingStatus.kind !== "UNKNOWN") {
        return existingStatus;
      }

      // Strategy 2: Determine status based on command patterns with priority

      // Check for terminated/dead processes (pid might indicate this)
      if (pid === "0" || pid === "" || command === "") {
        return WorkerStatusParser.parse("TERMINATED");
      }

      // Check for shell commands (typically idle)
      const shellCommands = ["zsh", "bash", "sh", "fish", "tcsh", "csh"];
      if (shellCommands.includes(command)) {
        return WorkerStatusParser.parse("IDLE");
      }

      // Check for active development tools and processes
      const activeCommands = [
        "claude",
        "cld",
        "vi",
        "vim",
        "nvim",
        "nano",
        "emacs",
        "code",
        "cursor",
      ];
      if (activeCommands.some((cmd) => command.includes(cmd))) {
        return WorkerStatusParser.parse("WORKING");
      }

      // Check for build/test processes (working state)
      const buildTestPatterns = [
        "test",
        "build",
        "compile",
        "bundle",
        "jest",
        "vitest",
        "mocha",
        "cypress",
        "webpack",
        "vite",
        "rollup",
        "esbuild",
        "tsc",
        "typescript",
      ];
      if (buildTestPatterns.some((pattern) => command.includes(pattern))) {
        return WorkerStatusParser.parse("WORKING");
      }

      // Check for Node.js related processes
      if (this.isNodeCommand(command)) {
        // Check for specific Node.js states
        if (
          command.includes("watch") || command.includes("dev") ||
          command.includes("start")
        ) {
          return WorkerStatusParser.parse("WORKING");
        }
        if (command.includes("install") || command.includes("update")) {
          return WorkerStatusParser.parse("WORKING");
        }
        return WorkerStatusParser.parse("WORKING"); // Default for Node commands
      }

      // Default to WORKING for any other active process
      return WorkerStatusParser.parse("WORKING");
    } catch (error) {
      this.logger.error("Error in determineStatus:", error);
      return WorkerStatusParser.parse("UNKNOWN");
    }
  }
}

/**
 * Manages tmux pane discovery, classification, and state management.
 *
 * Handles the discovery of tmux panes, classification into main and target panes,
 * and maintains pane state throughout the monitoring process.
 *
 * @example
 * ```typescript
 * const manager = new PaneManager(logger);
 * const result = await manager.discoverPanes("session1");
 * if (result.ok) {
 *   const mainPanes = manager.getMainPanes();
 *   const targetPanes = manager.getTargetPanes();
 * }
 * ```
 */
export class PaneManager {
  private mainPane: Pane | null = null;
  private panes: Pane[] = [];
  private paneNames: Map<string, string> = new Map(); // paneId -> paneName

  constructor(private logger: Logger) {}

  separate(
    allPanes: Pane[],
  ): Result<void, ValidationError & { message: string }> {
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

    this.mainPane = allPanes.find((pane) => pane.isActive()) || null;
    const targetPanes = allPanes.filter((pane) => !pane.isActive());

    // Sort target panes by pane ID numerically
    this.panes = targetPanes.sort((a, b) => comparePaneIds(a.id, b.id));

    // Assign names to panes based on sorted order
    this.assignPaneNames();

    this.logger.info(`Main pane: ${this.mainPane?.id || "none"}`);
    this.logger.info(`Target panes: ${this.panes.map((p) => p.id).join(", ")}`);

    return { ok: true, data: undefined };
  }

  /**
   * Assigns names to panes based on their sorted order
   */
  private assignPaneNames(): void {
    this.paneNames.clear();

    // Create a sorted list of all pane IDs
    const allPaneIds: string[] = [];
    if (this.mainPane) {
      allPaneIds.push(this.mainPane.id);
    }
    allPaneIds.push(...this.panes.map((p) => p.id));

    // Sort all pane IDs numerically
    const sortedPaneIds = sortPaneIds(allPaneIds);

    // Assign names based on position in sorted list
    sortedPaneIds.forEach((paneId, _index) => {
      const paneName = getPaneNameById(paneId, sortedPaneIds);
      this.paneNames.set(paneId, paneName);
    });

    // Log pane name assignments
    this.logger.info("Pane name assignments:");
    for (const [paneId, paneName] of this.paneNames.entries()) {
      this.logger.info(`  ${paneId} -> ${paneName}`);
    }
  }

  /**
   * Get the assigned name for a pane
   */
  getPaneName(paneId: string): string | undefined {
    return this.paneNames.get(paneId);
  }

  /**
   * Get all pane name assignments
   */
  getAllPaneNames(): Map<string, string> {
    return new Map(this.paneNames);
  }

  getMainPane(): Pane | null {
    return this.mainPane;
  }

  getTargetPanes(): Pane[] {
    return this.panes;
  }

  getTargetPaneIds(): string[] {
    return this.panes.map((p) => p.id);
  }
}

/**
 * Manages and tracks pane status changes over time.
 *
 * Maintains a history of pane status changes and provides utilities for
 * detecting status transitions and retrieving changed panes.
 *
 * @example
 * ```typescript
 * const statusManager = new PaneStatusManager();
 * const hasChanged = statusManager.updateStatus("pane1", { kind: "WORKING" });
 * const changedPanes = statusManager.getChangedPanes();
 * ```
 */
export class PaneStatusManager {
  private statusMap: Map<
    string,
    { current: WorkerStatus; previous?: WorkerStatus }
  > = new Map();

  updateStatus(paneId: string, newStatus: WorkerStatus): boolean {
    const existing = this.statusMap.get(paneId);

    if (!existing) {
      this.statusMap.set(paneId, { current: newStatus });
      return true; // New pane is a change
    }

    if (!WorkerStatusParser.isEqual(existing.current, newStatus)) {
      this.statusMap.set(paneId, {
        current: newStatus,
        previous: existing.current,
      });
      return true; // Status changed
    }

    return false; // No change
  }

  getChangedPanes(): Array<{ paneId: string; status: WorkerStatus }> {
    const result: Array<{ paneId: string; status: WorkerStatus }> = [];

    for (const [paneId, info] of this.statusMap.entries()) {
      if (info.previous !== undefined) {
        result.push({ paneId, status: info.current });
      }
    }

    return result;
  }

  clearChangeFlags(): void {
    for (const [paneId, info] of this.statusMap.entries()) {
      this.statusMap.set(paneId, { current: info.current });
    }
  }

  getDonePanes(): string[] {
    const result: string[] = [];
    for (const [paneId, info] of this.statusMap.entries()) {
      if (info.current.kind === "DONE") {
        result.push(paneId);
      }
    }
    return result;
  }

  getDoneAndIdlePanes(): string[] {
    const result: string[] = [];
    for (const [paneId, info] of this.statusMap.entries()) {
      if (info.current.kind === "DONE" || info.current.kind === "IDLE") {
        result.push(paneId);
      }
    }
    return result;
  }

  getStatus(paneId: string): WorkerStatus | undefined {
    const info = this.statusMap.get(paneId);
    return info?.current;
  }
}
