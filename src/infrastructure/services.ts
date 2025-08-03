import {
  createError,
  type Result,
  type ValidationError,
} from "../core/types.ts";
import { globalCancellationToken } from "../core/cancellation.ts";

// =============================================================================
// Domain Value Objects with Smart Constructors
// =============================================================================

/**
 * Represents a validated command with arguments.
 * Uses smart constructor pattern to ensure valid commands.
 */
export class Command {
  private constructor(
    public readonly program: string,
    public readonly args: readonly string[],
  ) {}

  /**
   * Smart constructor that validates command creation.
   * Ensures non-empty program name and proper argument structure.
   */
  static create(
    program: string,
    args: string[] = [],
  ): Result<Command, ValidationError> {
    if (!program || program.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    const trimmedProgram = program.trim();
    const validatedArgs = args.filter((arg) =>
      arg !== null && arg !== undefined
    );

    return {
      ok: true,
      data: new Command(trimmedProgram, Object.freeze(validatedArgs)),
    };
  }

  /**
   * Creates a tmux-specific command with validation.
   */
  static createTmux(
    subcommand: string,
    args: string[] = [],
  ): Result<Command, ValidationError> {
    if (!subcommand || subcommand.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    return Command.create("tmux", [subcommand, ...args]);
  }

  /**
   * Converts to array format for execution.
   */
  toArray(): string[] {
    return [this.program, ...this.args];
  }

  /**
   * String representation for logging.
   */
  toString(): string {
    return this.toArray().join(" ");
  }
}

/**
 * Represents the result of a command execution.
 * Discriminated union for type-safe result handling.
 */
export type CommandResult =
  | { kind: "success"; stdout: string }
  | { kind: "failure"; exitCode: number; stderr: string }
  | { kind: "error"; error: Error };

/**
 * Type guard for successful command results.
 */
export function isSuccessResult(
  result: CommandResult,
): result is { kind: "success"; stdout: string } {
  return result.kind === "success";
}

/**
 * Represents a pane identifier with validation.
 */
export class PaneId {
  private constructor(public readonly value: string) {}

  /**
   * Smart constructor for pane IDs.
   * Validates format (e.g., %0, %10, %123).
   */
  static create(value: string): Result<PaneId, ValidationError> {
    if (!value || !value.match(/^%\d+$/)) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: value,
          expected: "Pane ID must be in format %<number>",
        }),
      };
    }

    return { ok: true, data: new PaneId(value) };
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Represents a pane target in session:window.pane format.
 */
export class PaneTarget {
  private constructor(
    public readonly session: string,
    public readonly window: number,
    public readonly pane: number,
  ) {}

  /**
   * Smart constructor for pane targets.
   * Validates format: session:window.pane
   */
  static create(value: string): Result<PaneTarget, ValidationError> {
    const match = value.match(/^([^:]+):(\d+)\.(\d+)$/);
    if (!match) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: value,
          expected: "Pane target must be in format session:window.pane",
        }),
      };
    }

    const [, session, window, pane] = match;
    return {
      ok: true,
      data: new PaneTarget(session, parseInt(window), parseInt(pane)),
    };
  }

  toString(): string {
    return `${this.session}:${this.window}.${this.pane}`;
  }
}

// =============================================================================
// Command Execution Service with Total Functions
// =============================================================================

/**
 * Executes system commands with comprehensive error handling.
 * All methods return Result types for total function guarantee.
 */
export class CommandExecutor {
  /**
   * Executes a command with total function guarantee.
   * Handles all possible error cases and returns typed results.
   *
   * @param commandOrArgs - Either a Command object or string array for backward compatibility
   */
  async execute(
    commandOrArgs: Command | string[],
  ): Promise<Result<CommandResult | string, ValidationError>> {
    // Handle backward compatibility with string array
    if (Array.isArray(commandOrArgs)) {
      if (commandOrArgs.length === 0) {
        return { ok: false, error: createError({ kind: "EmptyInput" }) };
      }

      const commandResult = Command.create(
        commandOrArgs[0],
        commandOrArgs.slice(1),
      );
      if (!commandResult.ok) {
        return commandResult;
      }

      // Call the new implementation and convert result for backward compatibility
      const result = await this.executeCommand(commandResult.data);
      if (!result.ok) {
        return result;
      }

      // Convert CommandResult to string for backward compatibility
      const cmdResult = result.data;
      switch (cmdResult.kind) {
        case "success":
          return { ok: true, data: cmdResult.stdout };
        case "failure":
          return {
            ok: false,
            error: createError({
              kind: "CommandFailed",
              command: commandOrArgs.join(" "),
              stderr: cmdResult.stderr,
            }),
          };
        case "error":
          return {
            ok: false,
            error: createError({
              kind: "CommandFailed",
              command: commandOrArgs.join(" "),
              stderr: cmdResult.error.message,
            }),
          };
      }
    }

    // New Command-based interface
    return this.executeCommand(commandOrArgs);
  }

  /**
   * Internal method that executes a Command object.
   * This is the new implementation with total function guarantee.
   */
  private async executeCommand(
    command: Command,
  ): Promise<Result<CommandResult, ValidationError>> {
    try {
      const args = command.toArray();
      const process = new Deno.Command(args[0], {
        args: args.slice(1),
        stdout: "piped",
        stderr: "piped",
      });

      const output = await process.output();
      const result: CommandResult = output.success
        ? {
          kind: "success",
          stdout: new TextDecoder().decode(output.stdout).trim(),
        }
        : {
          kind: "failure",
          exitCode: output.code,
          stderr: new TextDecoder().decode(output.stderr).trim(),
        };

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: true,
        data: {
          kind: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        },
      };
    }
  }

  /**
   * Executes a tmux command through bash shell.
   * Total function with comprehensive error handling.
   */
  async executeTmuxCommand(
    commandString: string,
  ): Promise<Result<string, ValidationError>> {
    const bashCommand = Command.create("bash", ["-c", commandString]);
    if (!bashCommand.ok) {
      return bashCommand;
    }

    const result = await this.executeCommand(bashCommand.data);
    if (!result.ok) {
      return result;
    }

    const cmdResult = result.data;
    switch (cmdResult.kind) {
      case "success":
        return { ok: true, data: cmdResult.stdout };
      case "failure":
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: commandString,
            stderr: cmdResult.stderr,
          }),
        };
      case "error":
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: commandString,
            stderr: cmdResult.error.message,
          }),
        };
    }
  }

  /**
   * Gets all pane IDs with type-safe parsing.
   */
  private async getAllPaneIds(): Promise<Result<PaneId[], ValidationError>> {
    const result = await this.executeTmuxCommand(
      "tmux list-panes -a -F '#{pane_id}'",
    );
    if (!result.ok) {
      return result;
    }

    const paneIds: PaneId[] = [];
    const lines = result.data.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      const paneId = PaneId.create(line.trim());
      if (!paneId.ok) {
        return paneId;
      }
      paneIds.push(paneId.data);
    }

    return { ok: true, data: paneIds };
  }

  /**
   * Gets all pane targets with type-safe parsing.
   */
  private async getAllPaneTargets(): Promise<
    Result<PaneTarget[], ValidationError>
  > {
    const result = await this.executeTmuxCommand(
      "tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}'",
    );
    if (!result.ok) {
      return result;
    }

    const targets: PaneTarget[] = [];
    const lines = result.data.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      const target = PaneTarget.create(line.trim());
      if (!target.ok) {
        return target;
      }
      targets.push(target.data);
    }

    return { ok: true, data: targets };
  }

  /**
   * Sends a key sequence to a pane.
   */
  private async sendKeys(
    paneId: PaneId | PaneTarget,
    keys: string,
  ): Promise<Result<void, ValidationError>> {
    const cmd = Command.createTmux("send-keys", [
      "-t",
      paneId.toString(),
      keys,
    ]);
    if (!cmd.ok) {
      return cmd;
    }

    const result = await this.executeCommand(cmd.data);
    if (!result.ok) {
      return result;
    }

    if (!isSuccessResult(result.data)) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: cmd.data.toString(),
          stderr: result.data.kind === "failure"
            ? result.data.stderr
            : result.data.error.message,
        }),
      };
    }

    return { ok: true, data: undefined };
  }

  /**
   * Kills a single pane.
   */
  private async killPane(
    paneId: PaneId,
  ): Promise<Result<void, ValidationError>> {
    const cmd = Command.createTmux("kill-pane", ["-t", paneId.toString()]);
    if (!cmd.ok) {
      return cmd;
    }

    const result = await this.executeCommand(cmd.data);
    if (!result.ok) {
      return result;
    }

    if (!isSuccessResult(result.data)) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: cmd.data.toString(),
          stderr: result.data.kind === "failure"
            ? result.data.stderr
            : result.data.error.message,
        }),
      };
    }

    return { ok: true, data: undefined };
  }

  /**
   * Safely terminates all tmux panes with graceful shutdown.
   * Total function with comprehensive error handling.
   */
  async killAllPanes(): Promise<Result<string, ValidationError>> {
    // Get all pane IDs
    const paneIdsResult = await this.getAllPaneIds();
    if (!paneIdsResult.ok) {
      return paneIdsResult;
    }

    const paneIds = paneIdsResult.data;
    if (paneIds.length === 0) {
      return { ok: true, data: "No panes to kill" };
    }

    console.log(`[INFO] Found ${paneIds.length} panes to terminate`);

    // Phase 1: Send SIGTERM (Ctrl+C) for graceful termination
    console.log(
      "[INFO] Sending SIGTERM to all panes for graceful termination...",
    );
    const terminationResults = await Promise.all(
      paneIds.map((paneId) => this.sendKeys(paneId, "C-c")),
    );

    // Log any failed termination attempts
    terminationResults.forEach((result, index) => {
      if (!result.ok) {
        console.log(`[WARN] Failed to send SIGTERM to ${paneIds[index]}`);
      }
    });

    // Wait for graceful termination
    console.log("[INFO] Waiting 3 seconds for graceful termination...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Phase 2: Check remaining panes
    const remainingResult = await this.getAllPaneIds();
    if (!remainingResult.ok) {
      return remainingResult;
    }

    const remainingPanes = remainingResult.data;
    if (remainingPanes.length === 0) {
      return { ok: true, data: "All panes terminated gracefully" };
    }

    // Phase 3: Force kill remaining panes
    console.log(
      `[INFO] Force killing ${remainingPanes.length} remaining panes...`,
    );
    const killResults = await Promise.all(
      remainingPanes.map((paneId) => this.killPane(paneId)),
    );

    // Count successful kills
    const successfulKills = killResults.filter((r) => r.ok).length;
    const failedKills = killResults.filter((r) => !r.ok).length;

    if (failedKills > 0) {
      console.log(`[WARN] Failed to kill ${failedKills} panes`);
    }

    return {
      ok: true,
      data:
        `Terminated ${paneIds.length} panes (${successfulKills} force killed)`,
    };
  }

  /**
   * Clears all panes by sending escape sequences and clear commands.
   * Total function with comprehensive error handling.
   */
  async clearAllPanes(): Promise<Result<string, ValidationError>> {
    // Get all pane targets
    const targetsResult = await this.getAllPaneTargets();
    if (!targetsResult.ok) {
      return targetsResult;
    }

    const paneTargets = targetsResult.data;
    if (paneTargets.length === 0) {
      return { ok: true, data: "No panes to clear" };
    }

    console.log(`[INFO] Found ${paneTargets.length} panes to clear`);

    // Phase 1: Send Escape sequences
    console.log("[INFO] Sending Escape keypresses to all panes...");
    for (const target of paneTargets) {
      await this.sendKeys(target, "Escape");
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.sendKeys(target, "Escape");
    }

    // Phase 2: Send clear command sequence
    console.log("[INFO] Sending clear commands to all panes...");
    await new Promise((resolve) => setTimeout(resolve, 200));

    for (const target of paneTargets) {
      await this.sendKeys(target, "Tab");
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.sendKeys(target, "/clear");
      await this.sendKeys(target, "Tab");
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.sendKeys(target, "Enter");
    }

    return { ok: true, data: `Cleared ${paneTargets.length} panes` };
  }
}

// =============================================================================
// Keyboard Interrupt Handler with State Management
// =============================================================================

/**
 * Represents the state of the keyboard handler.
 * Discriminated union for exhaustive state handling.
 */
export type KeyboardHandlerState =
  | { kind: "uninitialized" }
  | { kind: "initialized"; listener: Promise<void> | null }
  | { kind: "cancelled"; reason: string }
  | { kind: "cleaned" };

/**
 * Handles keyboard interrupts and signals with type-safe state management.
 * Implements total functions for all operations.
 */
export class KeyboardInterruptHandler {
  private state: KeyboardHandlerState = { kind: "uninitialized" };

  /**
   * Gets the current state in a type-safe manner.
   */
  getState(): KeyboardHandlerState {
    return this.state;
  }

  /**
   * Sets up keyboard interrupt handling.
   * Total function that handles all initialization cases.
   */
  setup(): Result<void, ValidationError> {
    // Check if already initialized
    if (this.state.kind !== "uninitialized") {
      return {
        ok: false,
        error: createError({
          kind: "InvalidState",
          current: this.state.kind,
          expected: "uninitialized",
        }),
      };
    }

    try {
      // Setup SIGINT handler
      Deno.addSignalListener("SIGINT", () => {
        globalCancellationToken.cancel("Ctrl+C signal received");
        this.state = { kind: "cancelled", reason: "SIGINT" };
        this.forceExit("[INFO] Monitoring stopped by Ctrl+C. Exiting...");
      });

      // Setup raw stdin if available
      let listenerPromise: Promise<void> | null = null;
      if (Deno.stdin.isTerminal()) {
        try {
          Deno.stdin.setRaw(true);
          listenerPromise = this.startKeyListener();
        } catch (error) {
          // Terminal might not support raw mode
          console.warn("Failed to setup raw terminal mode:", error);
        }
      }

      this.state = { kind: "initialized", listener: listenerPromise };
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "setup",
          details: String(error),
        }),
      };
    }
  }

  /**
   * Starts listening for keyboard input.
   * Total function with proper error handling.
   */
  private async startKeyListener(): Promise<void> {
    const buffer = new Uint8Array(1024);

    while (
      this.state.kind === "initialized" &&
      !globalCancellationToken.isCancelled()
    ) {
      try {
        const bytesRead = await Deno.stdin.read(buffer);

        // Handle EOF or no data
        if (bytesRead === null || bytesRead === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        // Any key press triggers cancellation
        if (bytesRead > 0) {
          globalCancellationToken.cancel("Key press detected");
          this.state = { kind: "cancelled", reason: "key_press" };
          this.forceExit("[INFO] Monitoring stopped by user input. Exiting...");
          break;
        }
      } catch (_error) {
        // Handle read errors gracefully
        if (
          this.state.kind === "initialized" &&
          !globalCancellationToken.isCancelled()
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          break;
        }
      }
    }
  }

  /**
   * Cleans up keyboard handler resources.
   * Total function that handles all cleanup cases.
   */
  cleanup(): Result<void, ValidationError> {
    switch (this.state.kind) {
      case "uninitialized":
      case "cleaned":
        return { ok: true, data: undefined };

      case "initialized":
      case "cancelled":
        // Reset terminal if needed
        if (Deno.stdin.isTerminal()) {
          try {
            Deno.stdin.setRaw(false);
          } catch (error) {
            // Ignore errors during cleanup
            console.warn("Failed to reset terminal:", error);
          }
        }

        this.state = { kind: "cleaned" };
        return { ok: true, data: undefined };
    }
  }

  /**
   * Forces immediate exit with cleanup.
   */
  private forceExit(message: string): void {
    this.cleanup();
    console.log(message);
    setTimeout(() => Deno.exit(0), 100);
  }

  /**
   * Checks if cancellation has been requested.
   * Total function returning boolean.
   */
  isCancellationRequested(): boolean {
    return this.state.kind === "cancelled" ||
      globalCancellationToken.isCancelled();
  }

  /**
   * Waits for specified duration or until interrupted.
   * Returns true if interrupted, false if completed normally.
   */
  async waitWithKeyboardInterrupt(ms: number): Promise<boolean> {
    return await globalCancellationToken.delay(ms);
  }

  /**
   * Sleeps with cancellation support.
   * Total function with Result type.
   */
  async sleepWithCancellation(
    ms: number,
    _timeManager?: TimeManager,
  ): Promise<boolean> {
    return await globalCancellationToken.delay(ms);
  }
}

// =============================================================================
// Logger Service with Type-Safe Log Levels
// =============================================================================

/**
 * Represents log levels as a discriminated union.
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Configuration for logger with validation.
 */
export class LoggerConfig {
  private constructor(public readonly level: LogLevel) {}

  /**
   * Smart constructor for logger configuration.
   */
  static create(level: string = "INFO"): Result<LoggerConfig, ValidationError> {
    const upperLevel = level.toUpperCase();
    if (!["DEBUG", "INFO", "WARN", "ERROR"].includes(upperLevel)) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: level,
          expected: "DEBUG, INFO, WARN, or ERROR",
        }),
      };
    }

    return { ok: true, data: new LoggerConfig(upperLevel as LogLevel) };
  }

  /**
   * Creates config from environment variable.
   */
  static fromEnv(): LoggerConfig {
    const envLevel = Deno.env.get("LOG_LEVEL");
    const result = envLevel
      ? LoggerConfig.create(envLevel)
      : LoggerConfig.create("INFO");
    return result.ok ? result.data : new LoggerConfig("INFO");
  }

  /**
   * Checks if a message at the given level should be logged.
   */
  shouldLog(messageLevel: LogLevel): boolean {
    const levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
    const configIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(messageLevel);
    return messageIndex >= configIndex;
  }
}

/**
 * Type-safe logger with configurable log levels.
 * All methods are total functions that never throw.
 */
export class Logger {
  constructor(private config: LoggerConfig = LoggerConfig.fromEnv()) {}

  /**
   * Logs a debug message.
   * Total function that handles all cases.
   */
  debug(message: string): void {
    if (this.config.shouldLog("DEBUG")) {
      this.writeLog("DEBUG", message);
    }
  }

  /**
   * Logs an informational message.
   * Total function that handles all cases.
   */
  info(message: string): void {
    if (this.config.shouldLog("INFO")) {
      this.writeLog("INFO", message);
    }
  }

  /**
   * Logs a warning message.
   * Total function that handles all cases.
   */
  warn(message: string): void {
    if (this.config.shouldLog("WARN")) {
      this.writeLog("WARN", message);
    }
  }

  /**
   * Logs an error message with optional error object.
   * Total function that safely handles all error types.
   */
  error(message: string, error?: unknown): void {
    if (this.config.shouldLog("ERROR")) {
      const errorDetails = this.formatError(error);
      this.writeLog(
        "ERROR",
        `${message}${errorDetails ? ` - ${errorDetails}` : ""}`,
      );
    }
  }

  /**
   * Writes log message to console.
   * Handles write errors gracefully.
   */
  private writeLog(level: LogLevel, message: string): void {
    try {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [${level}] ${message}`;

      switch (level) {
        case "ERROR":
          console.error(formattedMessage);
          break;
        case "WARN":
          console.warn(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    } catch {
      // Silently ignore logging errors to maintain totality
    }
  }

  /**
   * Safely formats error objects for logging.
   * Total function that handles all error types.
   */
  private formatError(error: unknown): string {
    if (error === null || error === undefined) {
      return "";
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    if (typeof error === "object") {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    return String(error);
  }
}

// =============================================================================
// Runtime Tracker with Type-Safe Duration Handling
// =============================================================================

/**
 * Represents a time duration with validation.
 */
export class Duration {
  private constructor(public readonly milliseconds: number) {}

  /**
   * Smart constructor for duration.
   * Ensures non-negative values.
   */
  static fromMilliseconds(ms: number): Result<Duration, ValidationError> {
    if (ms < 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: String(ms),
          expected: "non-negative number",
        }),
      };
    }

    return { ok: true, data: new Duration(Math.floor(ms)) };
  }

  /**
   * Creates duration from start and end times.
   */
  static between(
    start: number,
    end: number,
  ): Result<Duration, ValidationError> {
    return Duration.fromMilliseconds(end - start);
  }

  /**
   * Formats duration as human-readable string.
   */
  format(): string {
    const seconds = Math.floor(this.milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Tracks application runtime with type-safe operations.
 * All methods are total functions.
 */
export class RuntimeTracker {
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Gets the elapsed time since start.
   * Total function that always returns a valid duration.
   */
  getElapsedTime(): Duration {
    const result = Duration.between(this.startTime, Date.now());
    // This should never fail since Date.now() >= startTime, but handle it anyway
    if (!result.ok) {
      // Create a zero duration as fallback - Duration.fromMilliseconds(0) should always succeed
      const zeroDuration = Duration.fromMilliseconds(0);
      if (zeroDuration.ok) {
        return zeroDuration.data;
      }
      // This should never happen, but provide an absolute fallback
      throw new Error(
        "Failed to create zero duration - this should never happen",
      );
    }
    return result.data;
  }

  /**
   * Formats elapsed time as a string.
   * Total function that never throws.
   */
  formatElapsedTime(): string {
    return this.getElapsedTime().format();
  }

  /**
   * Gets the start time.
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Logs startup information.
   * Total function that handles all logging gracefully.
   */
  logStartupInfo(
    logger: Logger,
    timeManager: TimeManager,
    scheduledTime?: Date | null,
  ): void {
    try {
      logger.info("=".repeat(60));
      logger.info("tmux-monitor started");
      logger.info(`Current time: ${timeManager.getCurrentTimeISO()}`);
      
      if (scheduledTime) {
        logger.info(`Scheduled to start at: ${scheduledTime.toISOString()}`);
      }
      
      logger.info("=".repeat(60));
    } catch {
      // Silently ignore logging errors to maintain totality
    }
  }

  /**
   * Checks if runtime has exceeded the maximum allowed limit.
   * Total function that returns Result type.
   */
  hasExceededLimit(): Result<boolean, ValidationError & { message: string }> {
    try {
      const maxRuntimeMs = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      const elapsed = this.getElapsedTime();
      return { ok: true, data: elapsed.milliseconds > maxRuntimeMs };
    } catch (error) {
      return {
        ok: false,
        error: createError(
          {
            kind: "UnexpectedError",
            operation: "hasExceededLimit",
            details: String(error),
          },
          "Failed to check runtime limit",
        ),
      };
    }
  }
}

// =============================================================================
// Time Manager with Type-Safe Operations
// =============================================================================

/**
 * Represents a timestamp with validation.
 */
export class Timestamp {
  private constructor(public readonly value: number) {}

  /**
   * Smart constructor for timestamp.
   * Ensures valid timestamp values.
   */
  static create(value: number): Result<Timestamp, ValidationError> {
    if (!Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: String(value),
          expected: "non-negative finite number",
        }),
      };
    }

    return { ok: true, data: new Timestamp(value) };
  }

  /**
   * Creates timestamp for current time.
   */
  static now(): Timestamp {
    return new Timestamp(Date.now());
  }

  /**
   * Formats timestamp as ISO string.
   */
  toISOString(): string {
    try {
      return new Date(this.value).toISOString();
    } catch {
      return "Invalid Date";
    }
  }
}

/**
 * Manages time-related operations with type safety.
 * All methods are total functions.
 */
export class TimeManager {
  /**
   * Gets the current timestamp.
   * Total function that always succeeds.
   */
  getCurrentTime(): Timestamp {
    return Timestamp.now();
  }

  /**
   * Formats the current time as ISO string.
   * Total function with fallback for edge cases.
   */
  getCurrentTimeISO(): string {
    return this.getCurrentTime().toISOString();
  }

  /**
   * Sleeps for specified duration.
   * Total function that handles interruption.
   */
  async sleep(milliseconds: number): Promise<Result<void, ValidationError>> {
    const duration = Duration.fromMilliseconds(milliseconds);
    if (!duration.ok) {
      return duration;
    }

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, duration.data.milliseconds)
      );
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "sleep",
          details: String(error),
        }),
      };
    }
  }

  /**
   * Measures execution time of an async operation.
   * Total function that captures both success and failure.
   */
  async measure<T>(
    operation: () => Promise<T>,
  ): Promise<Result<{ result: T; duration: Duration }, ValidationError>> {
    const start = Date.now();

    try {
      const result = await operation();
      const duration = Duration.between(start, Date.now());

      if (!duration.ok) {
        return duration;
      }

      return {
        ok: true,
        data: { result, duration: duration.data },
      };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "measure",
          details: String(error),
        }),
      };
    }
  }
}
