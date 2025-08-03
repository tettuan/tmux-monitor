/**
 * Refactored Pane Infrastructure - DDD and Totality Principles Implementation
 *
 * This refactored version implements:
 * - Total functions with comprehensive Result types
 * - Smart constructors for all value objects
 * - Type-safe parsing with proper validation
 * - Clear separation of infrastructure and domain concerns
 * - Domain value objects for all pane attributes
 * - Discriminated unions for state representation
 * - Comprehensive error handling using ValidationError types
 */

import {
  createError,
  getDefaultMessage,
  type Result,
  type ValidationError,
  type ValidationResult,
} from "../core/types.ts";
import {
  PaneDetail,
  type WorkerStatus,
  WorkerStatusParser,
} from "../core/models.ts";
import { Pane } from "../domain/pane.ts";
import { PaneId } from "../domain/value_objects.ts";
import type { CommandExecutor, Logger } from "./services.ts";
import { WORKER_STATUS_TYPES } from "../core/config.ts";

// =============================================================================
// Domain Value Objects for Pane Infrastructure
// =============================================================================

/**
 * Tmux Pane Identifier Value Object
 *
 * Represents a tmux pane ID with proper validation and type safety.
 * Ensures all pane IDs conform to tmux format (%number).
 */
class TmuxPaneId {
  private constructor(private readonly _value: string) {}

  static create(value: string): ValidationResult<TmuxPaneId> {
    if (!value || value.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Pane ID cannot be empty"),
      };
    }

    const trimmed = value.trim();
    if (!trimmed.match(/^%\d+$/)) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: trimmed,
          expected: "tmux pane format (%number)",
        }),
      };
    }

    return { ok: true, data: new TmuxPaneId(trimmed) };
  }

  get value(): string {
    return this._value;
  }

  equals(other: TmuxPaneId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

/**
 * Pane Active State Value Object
 *
 * Represents whether a pane is active with proper validation.
 */
class PaneActiveState {
  private constructor(private readonly _isActive: boolean) {}

  static create(activeFlag: string): ValidationResult<PaneActiveState> {
    if (!activeFlag || activeFlag.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Active flag cannot be empty"),
      };
    }

    const trimmed = activeFlag.trim();
    if (trimmed !== "0" && trimmed !== "1") {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: trimmed,
          expected: "0 or 1",
        }),
      };
    }

    return { ok: true, data: new PaneActiveState(trimmed === "1") };
  }

  get isActive(): boolean {
    return this._isActive;
  }

  toString(): string {
    return this._isActive ? "1" : "0";
  }
}

/**
 * Pane Command Value Object
 *
 * Represents a pane command with validation and categorization.
 */
class PaneCommand {
  private constructor(
    private readonly _command: string,
    private readonly _category: CommandCategory,
  ) {}

  static create(command: string): ValidationResult<PaneCommand> {
    if (!command || command.trim() === "") {
      // Allow empty commands but mark as unknown
      return {
        ok: true,
        data: new PaneCommand("unknown", { kind: "Unknown" }),
      };
    }

    const trimmed = command.trim();
    const category = PaneCommand._categorizeCommand(trimmed);

    return { ok: true, data: new PaneCommand(trimmed, category) };
  }

  private static _categorizeCommand(command: string): CommandCategory {
    const lowerCommand = command.toLowerCase();

    // Shell commands
    const shellCommands = ["zsh", "bash", "sh", "fish", "tcsh", "csh"];
    if (shellCommands.includes(lowerCommand)) {
      return { kind: "Shell", shell: command };
    }

    // Development tools
    const devTools = [
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
    if (devTools.some((tool) => lowerCommand.includes(tool))) {
      return { kind: "Development", tool: command };
    }

    // Node.js related
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
    if (nodePatterns.some((pattern) => lowerCommand.includes(pattern))) {
      return { kind: "NodeJS", command };
    }

    // Build/Test processes
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
    if (buildTestPatterns.some((pattern) => lowerCommand.includes(pattern))) {
      return { kind: "BuildTest", process: command };
    }

    return { kind: "Other", command };
  }

  get command(): string {
    return this._command;
  }

  get category(): CommandCategory {
    return this._category;
  }

  isShell(): boolean {
    return this._category.kind === "Shell";
  }

  isDevelopment(): boolean {
    return this._category.kind === "Development";
  }

  isNodeJS(): boolean {
    return this._category.kind === "NodeJS";
  }

  isBuildTest(): boolean {
    return this._category.kind === "BuildTest";
  }

  toString(): string {
    return this._command;
  }
}

/**
 * Command Category Discriminated Union
 *
 * Represents different categories of commands with type safety.
 */
type CommandCategory =
  | { kind: "Shell"; shell: string }
  | { kind: "Development"; tool: string }
  | { kind: "NodeJS"; command: string }
  | { kind: "BuildTest"; process: string }
  | { kind: "Other"; command: string }
  | { kind: "Unknown" };

/**
 * Pane Title Value Object
 *
 * Represents a pane title with validation and status extraction capabilities.
 */
class PaneTitle {
  private constructor(
    private readonly _title: string,
    private readonly _extractedStatus: WorkerStatus | null,
  ) {}

  static create(title: string): ValidationResult<PaneTitle> {
    if (!title || title.trim() === "") {
      return {
        ok: true,
        data: new PaneTitle("untitled", null),
      };
    }

    const trimmed = title.trim();
    const extractedStatus = PaneTitle._extractStatusFromTitle(trimmed);

    return { ok: true, data: new PaneTitle(trimmed, extractedStatus) };
  }

  private static _extractStatusFromTitle(title: string): WorkerStatus | null {
    const normalizedTitle = title.toUpperCase();

    for (const statusType of WORKER_STATUS_TYPES) {
      if (normalizedTitle.includes(statusType)) {
        return WorkerStatusParser.parse(statusType);
      }
    }

    return null;
  }

  get title(): string {
    return this._title;
  }

  get extractedStatus(): WorkerStatus | null {
    return this._extractedStatus;
  }

  hasStatusIndicator(): boolean {
    return this._extractedStatus !== null;
  }

  toString(): string {
    return this._title;
  }
}

/**
 * Tmux Line Parser Result
 *
 * Represents the result of parsing a tmux command output line.
 */
type TmuxLineParseResult = Result<{
  paneId: TmuxPaneId;
  activeState: PaneActiveState;
  command: PaneCommand;
  title: PaneTitle;
}, ValidationError & { message: string }>;

/**
 * Tmux Pane Data Value Object
 *
 * Aggregates all parsed pane information with validation.
 */
class TmuxPaneData {
  private constructor(
    private readonly _paneId: TmuxPaneId,
    private readonly _activeState: PaneActiveState,
    private readonly _command: PaneCommand,
    private readonly _title: PaneTitle,
  ) {}

  static create(
    paneId: TmuxPaneId,
    activeState: PaneActiveState,
    command: PaneCommand,
    title: PaneTitle,
  ): ValidationResult<TmuxPaneData> {
    return {
      ok: true,
      data: new TmuxPaneData(paneId, activeState, command, title),
    };
  }

  get paneId(): TmuxPaneId {
    return this._paneId;
  }

  get activeState(): PaneActiveState {
    return this._activeState;
  }

  get command(): PaneCommand {
    return this._command;
  }

  get title(): PaneTitle {
    return this._title;
  }

  /**
   * Convert to domain Pane object
   */
  toDomainPane(): ValidationResult<Pane> {
    const paneIdResult = PaneId.create(this._paneId.value);
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    return Pane.create(
      paneIdResult.data,
      this._activeState.isActive,
      this._command.command,
      this._title.title,
      this._title.extractedStatus || { kind: "UNKNOWN" },
    );
  }
}

// =============================================================================
// Smart Constructors for Pane Detail Parsing
// =============================================================================

/**
 * Session Name Value Object
 */
class SessionName {
  private constructor(private readonly _value: string) {}

  static create(value: string): ValidationResult<SessionName> {
    if (!value || value.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Session name cannot be empty"),
      };
    }

    return { ok: true, data: new SessionName(value.trim()) };
  }

  get value(): string {
    return this._value;
  }
}

/**
 * Window Index Value Object
 */
class WindowIndex {
  private constructor(private readonly _value: number) {}

  static create(value: string): ValidationResult<WindowIndex> {
    if (!value || value.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Window index cannot be empty"),
      };
    }

    const parsed = parseInt(value.trim(), 10);
    if (isNaN(parsed) || parsed < 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: value,
          expected: "non-negative integer",
        }),
      };
    }

    return { ok: true, data: new WindowIndex(parsed) };
  }

  get value(): number {
    return this._value;
  }

  toString(): string {
    return this._value.toString();
  }
}

/**
 * Process ID Value Object
 */
class ProcessId {
  private constructor(private readonly _value: number) {}

  static create(value: string): ValidationResult<ProcessId> {
    if (!value || value.trim() === "") {
      return { ok: true, data: new ProcessId(0) }; // Allow empty PID as 0
    }

    const parsed = parseInt(value.trim(), 10);
    if (isNaN(parsed) || parsed < 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: value,
          expected: "non-negative integer",
        }),
      };
    }

    return { ok: true, data: new ProcessId(parsed) };
  }

  get value(): number {
    return this._value;
  }

  toString(): string {
    return this._value.toString();
  }

  isTerminated(): boolean {
    return this._value === 0;
  }
}

/**
 * Pane Dimensions Value Object
 */
class PaneDimensions {
  private constructor(
    private readonly _width: number,
    private readonly _height: number,
  ) {}

  static create(
    width: string,
    height: string,
  ): ValidationResult<PaneDimensions> {
    const widthNum = parseInt(width.trim(), 10);
    const heightNum = parseInt(height.trim(), 10);

    if (isNaN(widthNum) || widthNum <= 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: width,
          expected: "positive integer",
        }),
      };
    }

    if (isNaN(heightNum) || heightNum <= 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: height,
          expected: "positive integer",
        }),
      };
    }

    return { ok: true, data: new PaneDimensions(widthNum, heightNum) };
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  toString(): string {
    return `${this._width}x${this._height}`;
  }
}

// =============================================================================
// Type-Safe Parsers
// =============================================================================

/**
 * Tmux Line Parser
 *
 * Parses tmux command output lines into typed value objects.
 * Implements totality by handling all possible input cases.
 */
class TmuxLineParser {
  /**
   * Parse a single tmux pane information line
   *
   * Expected format: "pane_id active_flag [command] [title]"
   */
  static parsePaneInfoLine(line: string): TmuxLineParseResult {
    if (!line || line.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Tmux line cannot be empty"),
      };
    }

    const parts = line.trim().split(" ");
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

    // Parse pane ID
    const paneIdResult = TmuxPaneId.create(parts[0]);
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    // Parse active state
    const activeStateResult = PaneActiveState.create(parts[1]);
    if (!activeStateResult.ok) {
      return activeStateResult;
    }

    // Parse command (optional)
    const commandStr = parts.length > 2 ? parts[2] : "";
    const commandResult = PaneCommand.create(commandStr);
    if (!commandResult.ok) {
      return commandResult;
    }

    // Parse title (optional)
    const titleStr = parts.length > 3 ? parts.slice(3).join(" ") : "";
    const titleResult = PaneTitle.create(titleStr);
    if (!titleResult.ok) {
      return titleResult;
    }

    return {
      ok: true,
      data: {
        paneId: paneIdResult.data,
        activeState: activeStateResult.data,
        command: commandResult.data,
        title: titleResult.data,
      },
    };
  }
}

/**
 * Tmux Detail Parser
 *
 * Parses detailed tmux display output into structured data.
 */
class TmuxDetailParser {
  /**
   * Parse tmux display command output into structured data
   */
  static parseDetailOutput(
    output: string,
  ): ValidationResult<Map<string, string>> {
    if (!output || output.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Tmux detail output cannot be empty"),
      };
    }

    const lines = output.split("\n");
    const data = new Map<string, string>();

    for (const line of lines) {
      const colonIndex = line.indexOf(": ");
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 2);

      if (key && value !== undefined) {
        data.set(key, value);
      }
    }

    return { ok: true, data };
  }

  /**
   * Extract and validate required fields from parsed data
   */
  static extractPaneDetailFields(
    data: Map<string, string>,
  ): ValidationResult<{
    sessionName: SessionName;
    windowIndex: WindowIndex;
    windowName: string;
    paneId: TmuxPaneId;
    paneIndex: string;
    tty: string;
    pid: ProcessId;
    currentCommand: PaneCommand;
    currentPath: string;
    title: PaneTitle;
    active: PaneActiveState;
    zoomed: string;
    dimensions: PaneDimensions;
    startCommand: string;
  }> {
    // Extract and validate session name
    const sessionNameResult = SessionName.create(data.get("Session") || "");
    if (!sessionNameResult.ok) {
      return sessionNameResult;
    }

    // Extract and validate window information
    const windowValue = data.get("Window") || "";
    const windowParts = windowValue.split(" ");
    const windowIndexResult = WindowIndex.create(windowParts[0] || "");
    if (!windowIndexResult.ok) {
      return windowIndexResult;
    }

    // Extract and validate pane ID
    const paneIdResult = TmuxPaneId.create(data.get("Pane ID") || "");
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    // Extract and validate PID
    const pidResult = ProcessId.create(data.get("PID") || "");
    if (!pidResult.ok) {
      return pidResult;
    }

    // Extract and validate command
    const commandResult = PaneCommand.create(data.get("Current Command") || "");
    if (!commandResult.ok) {
      return commandResult;
    }

    // Extract and validate title
    const titleResult = PaneTitle.create(data.get("Title") || "");
    if (!titleResult.ok) {
      return titleResult;
    }

    // Extract and validate active state
    const activeResult = PaneActiveState.create(data.get("Active") || "");
    if (!activeResult.ok) {
      return activeResult;
    }

    // Extract and validate dimensions
    const dimensionsResult = PaneDimensions.create(
      data.get("Pane Width") || "0",
      data.get("Pane Height") || "0",
    );
    if (!dimensionsResult.ok) {
      return dimensionsResult;
    }

    return {
      ok: true,
      data: {
        sessionName: sessionNameResult.data,
        windowIndex: windowIndexResult.data,
        windowName: windowParts.slice(1).join(" "),
        paneId: paneIdResult.data,
        paneIndex: data.get("Pane Index") || "",
        tty: data.get("TTY") || "",
        pid: pidResult.data,
        currentCommand: commandResult.data,
        currentPath: data.get("Current Path") || "",
        title: titleResult.data,
        active: activeResult.data,
        zoomed: data.get("Zoomed") || "",
        dimensions: dimensionsResult.data,
        startCommand: data.get("Start Command") || "",
      },
    };
  }
}

// =============================================================================
// Total Function Status Analysis
// =============================================================================

/**
 * Status Analysis Configuration
 *
 * Configuration for status determination logic.
 */
interface StatusAnalysisConfig {
  readonly shellCommands: readonly string[];
  readonly activeCommands: readonly string[];
  readonly buildTestPatterns: readonly string[];
  readonly nodePatterns: readonly string[];
}

/**
 * Default Status Analysis Configuration
 */
const DEFAULT_STATUS_CONFIG: StatusAnalysisConfig = {
  shellCommands: ["zsh", "bash", "sh", "fish", "tcsh", "csh"],
  activeCommands: [
    "claude",
    "cld",
    "vi",
    "vim",
    "nvim",
    "nano",
    "emacs",
    "code",
    "cursor",
  ],
  buildTestPatterns: [
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
  ],
  nodePatterns: [
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
  ],
};

/**
 * Status Determination Context
 *
 * Context information for status determination.
 */
interface StatusDeterminationContext {
  readonly command: PaneCommand;
  readonly title: PaneTitle;
  readonly pid: ProcessId;
  readonly config: StatusAnalysisConfig;
}

/**
 * Total Status Analyzer
 *
 * Implements total functions for status analysis with comprehensive
 * error handling and type safety.
 */
class TotalStatusAnalyzer {
  private constructor(
    private readonly config: StatusAnalysisConfig,
    private readonly logger: Logger,
  ) {}

  static create(
    logger: Logger,
    config: StatusAnalysisConfig = DEFAULT_STATUS_CONFIG,
  ): TotalStatusAnalyzer {
    return new TotalStatusAnalyzer(config, logger);
  }

  /**
   * Determine worker status from pane detail with total function guarantee
   */
  determineStatus(paneDetail: PaneDetail): ValidationResult<WorkerStatus> {
    try {
      // Create value objects with validation
      const commandResult = PaneCommand.create(paneDetail.currentCommand || "");
      if (!commandResult.ok) {
        return commandResult;
      }

      const titleResult = PaneTitle.create(paneDetail.title || "");
      if (!titleResult.ok) {
        return titleResult;
      }

      const pidResult = ProcessId.create(paneDetail.pid || "");
      if (!pidResult.ok) {
        return pidResult;
      }

      const context: StatusDeterminationContext = {
        command: commandResult.data,
        title: titleResult.data,
        pid: pidResult.data,
        config: this.config,
      };

      // Strategy 1: Check for explicit status in title
      if (context.title.hasStatusIndicator()) {
        const extractedStatus = context.title.extractedStatus!;
        this.logger.debug(
          `Status extracted from title: ${
            WorkerStatusParser.toString(extractedStatus)
          }`,
        );
        return { ok: true, data: extractedStatus };
      }

      // Strategy 2: Determine from process and command patterns
      const statusResult = this._analyzeCommandAndProcess(context);

      if (statusResult.ok) {
        this.logger.debug(
          `Status determined for pane ${paneDetail.paneId}: ${
            WorkerStatusParser.toString(statusResult.data)
          }`,
        );
      }

      return statusResult;
    } catch (error) {
      this.logger.error("Error in status determination:", error);
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "determineStatus",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Analyze command and process to determine status
   */
  private _analyzeCommandAndProcess(
    context: StatusDeterminationContext,
  ): ValidationResult<WorkerStatus> {
    // Check for terminated processes
    if (context.pid.isTerminated() || context.command.command === "") {
      return {
        ok: true,
        data: { kind: "TERMINATED", reason: "Process terminated" },
      };
    }

    // Check for shell commands (typically idle)
    if (this._isShellCommand(context.command, context.config)) {
      return { ok: true, data: { kind: "IDLE" } };
    }

    // Check for active development tools
    if (this._isActiveCommand(context.command, context.config)) {
      return {
        ok: true,
        data: { kind: "WORKING", details: "Development tool active" },
      };
    }

    // Check for build/test processes
    if (this._isBuildTestCommand(context.command, context.config)) {
      return {
        ok: true,
        data: { kind: "WORKING", details: "Build/test process" },
      };
    }

    // Check for Node.js processes
    if (this._isNodeCommand(context.command, context.config)) {
      const nodeStatus = this._analyzeNodeCommand(context.command);
      return { ok: true, data: nodeStatus };
    }

    // Default to WORKING for any other active process
    return { ok: true, data: { kind: "WORKING", details: "Active process" } };
  }

  /**
   * Check if command is a shell command
   */
  private _isShellCommand(
    command: PaneCommand,
    config: StatusAnalysisConfig,
  ): boolean {
    return config.shellCommands.includes(command.command.toLowerCase());
  }

  /**
   * Check if command is an active development command
   */
  private _isActiveCommand(
    command: PaneCommand,
    config: StatusAnalysisConfig,
  ): boolean {
    const lowerCommand = command.command.toLowerCase();
    return config.activeCommands.some((cmd) => lowerCommand.includes(cmd));
  }

  /**
   * Check if command is a build/test command
   */
  private _isBuildTestCommand(
    command: PaneCommand,
    config: StatusAnalysisConfig,
  ): boolean {
    const lowerCommand = command.command.toLowerCase();
    return config.buildTestPatterns.some((pattern) =>
      lowerCommand.includes(pattern)
    );
  }

  /**
   * Check if command is a Node.js related command
   */
  private _isNodeCommand(
    command: PaneCommand,
    config: StatusAnalysisConfig,
  ): boolean {
    const lowerCommand = command.command.toLowerCase();
    return config.nodePatterns.some((pattern) =>
      lowerCommand.includes(pattern)
    );
  }

  /**
   * Analyze Node.js command for specific status
   */
  private _analyzeNodeCommand(command: PaneCommand): WorkerStatus {
    const lowerCommand = command.command.toLowerCase();

    if (
      lowerCommand.includes("watch") || lowerCommand.includes("dev") ||
      lowerCommand.includes("start")
    ) {
      return { kind: "WORKING", details: "Node.js development server" };
    }

    if (lowerCommand.includes("install") || lowerCommand.includes("update")) {
      return { kind: "WORKING", details: "Package management" };
    }

    return { kind: "WORKING", details: "Node.js process" };
  }

  /**
   * Extract status from title with total function guarantee
   */
  extractStatusFromTitle(title: string): ValidationResult<WorkerStatus> {
    try {
      const titleResult = PaneTitle.create(title);
      if (!titleResult.ok) {
        return titleResult;
      }

      const extractedStatus = titleResult.data.extractedStatus;
      if (extractedStatus) {
        return { ok: true, data: extractedStatus };
      }

      return {
        ok: true,
        data: { kind: "UNKNOWN", lastKnownState: "No status found in title" },
      };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "extractStatusFromTitle",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }
}

// =============================================================================
// Refactored Pane Data Processor with DDD Principles
// =============================================================================

/**
 * Refactored Pane Data Processor
 *
 * Implements DDD and totality principles:
 * - All functions are total (handle all inputs)
 * - Smart constructors for value objects
 * - Type-safe parsing with Result types
 * - Clear separation of infrastructure and domain concerns
 * - Comprehensive error handling
 */
export class RefactoredPaneDataProcessor {
  private readonly statusAnalyzer: TotalStatusAnalyzer;

  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {
    this.statusAnalyzer = TotalStatusAnalyzer.create(logger);
  }

  /**
   * Parse pane information with total function guarantee
   *
   * This method handles all possible inputs and returns meaningful results.
   */
  parsePaneInfo(line: string): ValidationResult<Pane> {
    // Parse the line into typed components
    const parseResult = TmuxLineParser.parsePaneInfoLine(line);
    if (!parseResult.ok) {
      return parseResult;
    }

    // Create tmux pane data
    const tmuxDataResult = TmuxPaneData.create(
      parseResult.data.paneId,
      parseResult.data.activeState,
      parseResult.data.command,
      parseResult.data.title,
    );
    if (!tmuxDataResult.ok) {
      return tmuxDataResult;
    }

    // Convert to domain pane
    return tmuxDataResult.data.toDomainPane();
  }

  /**
   * Get pane detail with comprehensive error handling
   */
  async getPaneDetail(
    paneId: string,
    logger: Logger,
  ): Promise<ValidationResult<PaneDetail>> {
    // Validate pane ID first
    const paneIdResult = TmuxPaneId.create(paneId);
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    try {
      // Execute tmux command
      const commandResult = await this.commandExecutor.executeTmuxCommand(
        `tmux display -p -t "${paneIdResult.data.value}" -F 'Session: #{session_name}
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
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: "tmux display",
            stderr: getDefaultMessage(commandResult.error) ||
              "Unknown command error",
          }),
        };
      }

      // Parse the output
      const parseResult = TmuxDetailParser.parseDetailOutput(
        commandResult.data,
      );
      if (!parseResult.ok) {
        return parseResult;
      }

      // Extract fields
      const fieldsResult = TmuxDetailParser.extractPaneDetailFields(
        parseResult.data,
      );
      if (!fieldsResult.ok) {
        return fieldsResult;
      }

      const fields = fieldsResult.data;

      // Create PaneDetail using the existing factory method
      return PaneDetail.create(
        fields.sessionName.value,
        fields.windowIndex.toString(),
        fields.windowName,
        fields.paneId.value,
        fields.paneIndex,
        fields.tty,
        fields.pid.toString(),
        fields.currentCommand.command,
        fields.currentPath,
        fields.title.title,
        fields.active.toString(),
        fields.zoomed,
        fields.dimensions.width.toString(),
        fields.dimensions.height.toString(),
        fields.startCommand,
      );
    } catch (error) {
      logger.error("Unexpected error in getPaneDetail:", error);
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "getPaneDetail",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Count session occurrences with total function guarantee
   */
  countSessionOccurrences(
    sessionNames: string[],
  ): ValidationResult<Map<string, number>> {
    try {
      if (!sessionNames || !Array.isArray(sessionNames)) {
        return {
          ok: false,
          error: createError({
            kind: "InvalidFormat",
            input: String(sessionNames),
            expected: "array of strings",
          }),
        };
      }

      const sessionCounts = new Map<string, number>();

      for (const session of sessionNames) {
        if (typeof session !== "string") {
          this.logger.warn(`Skipping non-string session name: ${session}`);
          continue;
        }

        const sessionNameResult = SessionName.create(session);
        if (sessionNameResult.ok) {
          const name = sessionNameResult.data.value;
          sessionCounts.set(name, (sessionCounts.get(name) || 0) + 1);
        } else {
          this.logger.warn(`Invalid session name skipped: ${session}`);
        }
      }

      return { ok: true, data: sessionCounts };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "countSessionOccurrences",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Find most frequent session with total function guarantee
   */
  findMostFrequentSession(
    sessionCounts: Map<string, number>,
  ): ValidationResult<string> {
    try {
      if (!sessionCounts || sessionCounts.size === 0) {
        return {
          ok: false,
          error: createError({
            kind: "EmptyInput",
          }, "Session counts map cannot be empty"),
        };
      }

      let maxCount = 0;
      let mostActiveSession = "";

      for (const [session, count] of sessionCounts.entries()) {
        if (typeof count !== "number" || count < 0) {
          this.logger.warn(`Invalid count for session ${session}: ${count}`);
          continue;
        }

        if (count > maxCount) {
          maxCount = count;
          mostActiveSession = session;
        }
      }

      if (mostActiveSession === "") {
        return {
          ok: false,
          error: createError({
            kind: "InvalidState",
            current: "no valid sessions found",
            expected: "at least one valid session",
          }),
        };
      }

      return { ok: true, data: mostActiveSession };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "findMostFrequentSession",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Get pane content with unified capture adapter
   */
  async getPaneContent(
    paneId: string,
    logger: Logger,
  ): Promise<ValidationResult<string>> {
    // Validate pane ID first
    const paneIdResult = TmuxPaneId.create(paneId);
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    try {
      // Use the unified capture adapter
      const { TmuxCaptureAdapter } = await import(
        "./unified_capture_adapter.ts"
      );

      // Create adapter for command executor
      const adaptedExecutor = {
        execute: async (
          command: string[],
        ): Promise<
          { ok: true; data: string } | { ok: false; error: Error }
        > => {
          const tmuxCommand = command.join(" ");
          const result = await this.commandExecutor.executeTmuxCommand(
            tmuxCommand,
          );

          if (result.ok) {
            return { ok: true, data: result.data };
          } else {
            return {
              ok: false,
              error: new Error(
                getDefaultMessage(result.error) || "Command execution failed",
              ),
            };
          }
        },
      };

      const captureAdapter = new TmuxCaptureAdapter(adaptedExecutor);

      // Capture pane content
      const captureResult = await captureAdapter.capturePane(
        paneIdResult.data.value,
        {
          startLine: -10, // Latest 10 lines
        },
      );

      if (!captureResult.ok) {
        logger.warn(
          `Failed to capture pane content for ${paneIdResult.data.value}: ${captureResult.error.message}`,
        );
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: "unified capture adapter",
            stderr: captureResult.error.message,
          }),
        };
      }

      logger.debug(
        `Captured ${captureResult.data.lineCount} lines from pane ${paneIdResult.data.value}`,
      );

      return { ok: true, data: captureResult.data.content };
    } catch (error) {
      const errorMessage = `Error capturing pane content: ${error}`;
      logger.error(errorMessage);
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "getPaneContent",
          details: errorMessage,
        }),
      };
    }
  }

  /**
   * Determine status with total function guarantee
   */
  determineStatus(paneDetail: PaneDetail): ValidationResult<WorkerStatus> {
    return this.statusAnalyzer.determineStatus(paneDetail);
  }

  /**
   * Extract status from title with total function guarantee
   */
  extractStatusFromTitle(title: string): ValidationResult<WorkerStatus> {
    return this.statusAnalyzer.extractStatusFromTitle(title);
  }
}

// =============================================================================
// Total Function Status Manager
// =============================================================================

/**
 * Status Change Record
 *
 * Immutable record of a status change event.
 */
class StatusChangeRecord {
  private constructor(
    public readonly paneId: string,
    public readonly previousStatus: WorkerStatus | null,
    public readonly currentStatus: WorkerStatus,
    public readonly changedAt: Date,
  ) {}

  static create(
    paneId: string,
    previousStatus: WorkerStatus | null,
    currentStatus: WorkerStatus,
  ): ValidationResult<StatusChangeRecord> {
    const paneIdResult = TmuxPaneId.create(paneId);
    if (!paneIdResult.ok) {
      return paneIdResult;
    }

    return {
      ok: true,
      data: new StatusChangeRecord(
        paneIdResult.data.value,
        previousStatus,
        currentStatus,
        new Date(),
      ),
    };
  }

  hasChanged(): boolean {
    if (this.previousStatus === null) return true;
    return !WorkerStatusParser.isEqual(this.previousStatus, this.currentStatus);
  }
}

/**
 * Refactored Pane Status Manager
 *
 * Implements total functions for status management with comprehensive
 * error handling and immutable state tracking.
 */
export class RefactoredPaneStatusManager {
  private readonly statusMap: Map<string, StatusChangeRecord> = new Map();

  /**
   * Update status with total function guarantee
   */
  updateStatus(
    paneId: string,
    newStatus: WorkerStatus,
  ): ValidationResult<boolean> {
    try {
      const paneIdResult = TmuxPaneId.create(paneId);
      if (!paneIdResult.ok) {
        return paneIdResult;
      }

      const existing = this.statusMap.get(paneIdResult.data.value);
      const previousStatus = existing?.currentStatus || null;

      const recordResult = StatusChangeRecord.create(
        paneIdResult.data.value,
        previousStatus,
        newStatus,
      );
      if (!recordResult.ok) {
        return recordResult;
      }

      this.statusMap.set(paneIdResult.data.value, recordResult.data);
      return { ok: true, data: recordResult.data.hasChanged() };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "updateStatus",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Get changed panes with total function guarantee
   */
  getChangedPanes(): ValidationResult<
    Array<{ paneId: string; status: WorkerStatus }>
  > {
    try {
      const result: Array<{ paneId: string; status: WorkerStatus }> = [];

      for (const [paneId, record] of this.statusMap.entries()) {
        if (record.hasChanged()) {
          result.push({ paneId, status: record.currentStatus });
        }
      }

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "getChangedPanes",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Clear change flags with total function guarantee
   */
  clearChangeFlags(): ValidationResult<void> {
    try {
      for (const [paneId, record] of this.statusMap.entries()) {
        const newRecordResult = StatusChangeRecord.create(
          paneId,
          null, // Clear previous status to indicate no change
          record.currentStatus,
        );
        if (newRecordResult.ok) {
          this.statusMap.set(paneId, newRecordResult.data);
        }
      }

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "clearChangeFlags",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Get panes with specific status
   */
  getPanesWithStatus(
    ...statusKinds: Array<WorkerStatus["kind"]>
  ): ValidationResult<string[]> {
    try {
      const result: string[] = [];

      for (const [paneId, record] of this.statusMap.entries()) {
        if (statusKinds.includes(record.currentStatus.kind)) {
          result.push(paneId);
        }
      }

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "getPanesWithStatus",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Get done panes
   */
  getDonePanes(): ValidationResult<string[]> {
    return this.getPanesWithStatus("DONE");
  }

  /**
   * Get done and idle panes
   */
  getDoneAndIdlePanes(): ValidationResult<string[]> {
    return this.getPanesWithStatus("DONE", "IDLE");
  }

  /**
   * Get status for specific pane
   */
  getStatus(paneId: string): ValidationResult<WorkerStatus | null> {
    try {
      const paneIdResult = TmuxPaneId.create(paneId);
      if (!paneIdResult.ok) {
        return paneIdResult;
      }

      const record = this.statusMap.get(paneIdResult.data.value);
      return { ok: true, data: record?.currentStatus || null };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "getStatus",
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }
}
// =============================================================================
// Backward Compatibility Exports
// =============================================================================

/**
 * Backward compatibility wrapper for PaneDataProcessor
 *
 * Maintains the original interface while using the refactored implementation.
 */
export class PaneDataProcessor extends RefactoredPaneDataProcessor {
  // Inherits all methods with same signatures
}

/**
 * Backward compatibility wrapper for PaneStatusManager
 *
 * Maintains the original interface while using the refactored implementation.
 */
export class PaneStatusManager extends RefactoredPaneStatusManager {
  // Inherits all methods with same signatures
}

/**
 * Backward compatibility wrapper for StatusAnalyzer
 *
 * Adapts the refactored analyzer to the original interface.
 */
export class StatusAnalyzer {
  private analyzer: TotalStatusAnalyzer;

  constructor(private logger: Logger) {
    this.analyzer = TotalStatusAnalyzer.create(logger);
  }

  determineStatus(paneDetail: PaneDetail): WorkerStatus {
    const result = this.analyzer.determineStatus(paneDetail);
    return result.ok
      ? result.data
      : { kind: "UNKNOWN", lastKnownState: "Error determining status" };
  }

  extractStatusFromTitle(title: string): WorkerStatus {
    const result = this.analyzer.extractStatusFromTitle(title);
    return result.ok
      ? result.data
      : { kind: "UNKNOWN", lastKnownState: "Error extracting status" };
  }
}
