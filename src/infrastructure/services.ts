import {
  createError,
  type Result,
  type ValidationError,
} from "../core/types.ts";
import { globalCancellationToken } from "../core/cancellation.ts";

// =============================================================================
// Core Infrastructure Services
// =============================================================================

/**
 * Executes system commands with proper error handling and result formatting.
 *
 * This class provides a safe interface for executing system commands,
 * particularly tmux commands, with comprehensive error handling and
 * structured result types.
 *
 * @example
 * ```typescript
 * const executor = new CommandExecutor();
 * const result = await executor.executeTmuxCommand("tmux list-sessions");
 * if (result.ok) {
 *   console.log("Sessions:", result.data);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 * ```
 */
export class CommandExecutor {
  /**
   * Executes a command with the given arguments.
   *
   * @param args - Array of command arguments, where args[0] is the command name
   * @returns Promise resolving to a Result containing stdout or error information
   * @example
   * ```typescript
   * const result = await executor.execute(["ls", "-la"]);
   * ```
   */
  async execute(
    args: string[],
  ): Promise<Result<string, ValidationError & { message: string }>> {
    if (!args || args.length === 0) {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    // デバッグ: 実行するコマンドをログ出力
    // console.log(`🔧 CommandExecutor.execute: [${args.join(", ")}]`);

    try {
      const process = new Deno.Command(args[0], {
        args: args.slice(1),
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();

      if (!result.success) {
        const stderr = new TextDecoder().decode(result.stderr);
        // console.log(`❌ Command failed with exit code ${result.code}: ${stderr}`);
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: args.join(" "),
            stderr,
          }),
        };
      }

      const stdout = new TextDecoder().decode(result.stdout).trim();
      // console.log(`✅ Command successful, output length: ${stdout.length}`);
      return { ok: true, data: stdout };
    } catch (error) {
      // console.log(`💥 Command execution error: ${error}`);
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: args.join(" "),
          stderr: String(error),
        }),
      };
    }
  }

  /**
   * Executes a tmux command through bash shell.
   *
   * @param command - The complete tmux command string to execute
   * @returns Promise resolving to a Result containing command output or error
   * @example
   * ```typescript
   * const result = await executor.executeTmuxCommand("tmux list-sessions");
   * ```
   */
  async executeTmuxCommand(
    command: string,
  ): Promise<Result<string, ValidationError & { message: string }>> {
    if (!command || command.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    try {
      const process = new Deno.Command("bash", {
        args: ["-c", command],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();

      if (!result.success) {
        const stderr = new TextDecoder().decode(result.stderr);
        return {
          ok: false,
          error: createError({ kind: "CommandFailed", command, stderr }),
        };
      }

      const stdout = new TextDecoder().decode(result.stdout).trim();
      return { ok: true, data: stdout };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command,
          stderr: String(error),
        }),
      };
    }
  }

  /**
   * Safely kills all tmux panes by first sending SIGTERM, then SIGKILL if necessary.
   *
   * @returns Promise resolving to a Result indicating success or failure
   * @example
   * ```typescript
   * const result = await executor.killAllPanes();
   * if (result.ok) {
   *   console.log("All panes killed successfully");
   * }
   * ```
   */
  async killAllPanes(): Promise<
    Result<string, ValidationError & { message: string }>
  > {
    try {
      // First, get all pane IDs
      const listResult = await this.executeTmuxCommand(
        "tmux list-panes -a -F '#{pane_id}'",
      );
      if (!listResult.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: "tmux list-panes",
            stderr: listResult.error.message,
          }),
        };
      }

      const paneIds = listResult.data.split("\n").filter((id) =>
        id.trim() !== ""
      );
      if (paneIds.length === 0) {
        return { ok: true, data: "No panes to kill" };
      }

      console.log(`[INFO] Found ${paneIds.length} panes to terminate`);

      // Step 1: Send SIGTERM to all panes (graceful termination)
      console.log(
        "[INFO] Sending SIGTERM to all panes for graceful termination...",
      );
      for (const paneId of paneIds) {
        const killResult = await this.execute([
          "tmux",
          "send-keys",
          "-t",
          paneId,
          "C-c", // Send Ctrl+C
        ]);
        if (killResult.ok) {
          console.log(`[INFO] Sent SIGTERM to pane ${paneId}`);
        }
      }

      // Wait 3 seconds for graceful termination
      console.log("[INFO] Waiting 3 seconds for graceful termination...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 2: Check which panes are still alive
      const remainingResult = await this.executeTmuxCommand(
        "tmux list-panes -a -F '#{pane_id}'",
      );
      if (remainingResult.ok) {
        const remainingPanes = remainingResult.data.split("\n").filter((id) =>
          id.trim() !== ""
        );

        if (remainingPanes.length === 0) {
          return { ok: true, data: "All panes terminated gracefully" };
        }

        // Step 3: Force kill remaining panes
        console.log(
          `[INFO] Force killing ${remainingPanes.length} remaining panes...`,
        );
        for (const paneId of remainingPanes) {
          const killResult = await this.execute([
            "tmux",
            "kill-pane",
            "-t",
            paneId,
          ]);
          if (killResult.ok) {
            console.log(`[INFO] Force killed pane ${paneId}`);
          } else {
            console.log(
              `[WARN] Failed to kill pane ${paneId}: ${killResult.error.message}`,
            );
          }
        }
      }

      return { ok: true, data: `Terminated ${paneIds.length} panes` };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: "kill all panes",
          stderr: String(error),
        }),
      };
    }
  }
}

/**
 * Provides structured logging with different levels and consistent formatting.
 *
 * The Logger class offers a simple interface for application logging with
 * different severity levels (info, warn, error) and structured output format.
 *
 * @example
 * ```typescript
 * const logger = new Logger();
 * logger.info("Application started");
 * logger.warn("Configuration file not found, using defaults");
 * logger.error("Failed to connect to tmux", error);
 * ```
 */
export class Logger {
  /**
   * Logs a debug message.
   *
   * @param message - The debug message to log
   */
  debug(message: string): void {
    console.log(`[DEBUG] ${message}`);
  }

  /**
   * Logs an informational message.
   *
   * @param message - The message to log
   */
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  /**
   * Logs a warning message.
   *
   * @param message - The warning message to log
   */
  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  /**
   * Logs an error message with optional error object.
   *
   * @param message - The error message to log
   * @param error - Optional error object for additional context
   */
  error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error || "");
  }
}

/**
 * Manages time-related operations including delays, formatting, and scheduling.
 *
 * The TimeManager class provides utilities for time manipulation, scheduling,
 * and time formatting with proper timezone handling.
 *
 * @example
 * ```typescript
 * const timeManager = new TimeManager();
 * await timeManager.sleep(1000); // Wait 1 second
 * const formatted = timeManager.formatTimeForDisplay(new Date());
 * ```
 */
export class TimeManager {
  getCurrentTime(): Date {
    return new Date();
  }

  formatTime(date: Date): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  formatTimeForDisplay(date: Date): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async waitUntilScheduledTime(
    scheduledTime: Date,
    logger: Logger,
    _keyboardHandler: KeyboardInterruptHandler,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    const now = new Date();
    const msUntilScheduled = scheduledTime.getTime() - now.getTime();

    if (msUntilScheduled <= 0) {
      logger.info("Scheduled time has already passed. Proceeding immediately.");
      return { ok: true, data: undefined };
    }

    const scheduledTimeStr = this.formatTimeForDisplay(scheduledTime);
    logger.info(
      `Waiting until scheduled time: ${scheduledTimeStr} (Asia/Tokyo)`,
    );
    logger.info(
      `Time remaining: ${
        Math.round(msUntilScheduled / 1000 / 60)
      } minutes. Press any key to cancel and exit.`,
    );

    // logger.info(
    //   `[DEBUG] TimeManager.waitUntilScheduledTime: Starting wait for ${msUntilScheduled}ms`,
    // );
    // logger.info(
    //   `[DEBUG] TimeManager.waitUntilScheduledTime: Current cancellation state = ${globalCancellationToken.isCancelled()}`,
    // );

    const interrupted = await globalCancellationToken.delay(msUntilScheduled);

    // logger.info(
    //   `[DEBUG] TimeManager.waitUntilScheduledTime: delay completed, interrupted = ${interrupted}`,
    // );
    // logger.info(
    //   `[DEBUG] TimeManager.waitUntilScheduledTime: Post-delay cancellation state = ${globalCancellationToken.isCancelled()}`,
    // );

    if (interrupted) {
      // logger.info(
      //   "[DEBUG] TimeManager.waitUntilScheduledTime: Returning failure due to interruption",
      // );
      return {
        ok: false,
        error: createError({
          kind: "CancellationRequested",
          operation: "scheduled_wait",
        }),
      };
    }

    // logger.info(
    //   "[DEBUG] TimeManager.waitUntilScheduledTime: Returning success",
    // );
    return { ok: true, data: undefined };
  }
}

/**
 * Handles keyboard interrupt detection and cancellation management.
 *
 * This class provides comprehensive keyboard interrupt handling, including
 * both Ctrl+C signal detection and any key press detection. It integrates
 * with the global cancellation system to provide immediate application exit.
 *
 * ## Features
 * - Detects Ctrl+C (SIGINT) signals
 * - Monitors for any key press in raw terminal mode
 * - Integrates with global cancellation token
 * - Provides immediate application exit on interrupt
 * - Handles terminal cleanup properly
 *
 * @example
 * ```typescript
 * const handler = new KeyboardInterruptHandler();
 * handler.setup(); // Start monitoring for interrupts
 *
 * // Later, cleanup
 * handler.cleanup();
 * ```
 */
export class KeyboardInterruptHandler {
  private isSetup = false;
  private keyListenerPromise: Promise<void> | null = null;

  setup(): void {
    if (this.isSetup) {
      return;
    }

    this.isSetup = true;

    try {
      // Handle Ctrl+C using Deno's signal API
      Deno.addSignalListener("SIGINT", () => {
        // console.log(
        //   `\n[DEBUG] KeyboardInterruptHandler.setup(): Ctrl+C detected - stopping monitoring...`,
        // );
        globalCancellationToken.cancel("Ctrl+C signal received");

        // Force immediate exit on Ctrl+C
        this.cleanup();
        console.log(`[INFO] Monitoring stopped by Ctrl+C. Exiting...`);
        Deno.exit(0);
      });

      // Setup raw stdin for any key press
      if (Deno.stdin.isTerminal()) {
        Deno.stdin.setRaw(true);
        // Start the key listener in the background
        this.keyListenerPromise = this.startKeyListener();
      }
    } catch (_error) {
      console.error("Failed to setup keyboard handler:", _error);
    }
  }

  private async startKeyListener(): Promise<void> {
    const buffer = new Uint8Array(1024); // Larger buffer for better key detection

    // console.log(
    //   `[DEBUG] KeyboardInterruptHandler.startKeyListener(): Starting key listener`,
    // );

    try {
      while (this.isSetup && !globalCancellationToken.isCancelled()) {
        try {
          const bytesRead = await Deno.stdin.read(buffer);

          if (bytesRead === null) {
            // EOF, wait a bit and continue
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }

          if (bytesRead === 0) {
            // No data, wait a bit and continue
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }

          // Any key press triggers cancellation
          if (bytesRead > 0) {
            // console.log(
            //   `\n[DEBUG] KeyboardInterruptHandler.startKeyListener(): Key press detected (${bytesRead} bytes) - stopping monitoring...`,
            // );
            globalCancellationToken.cancel("Key press detected");

            // Force immediate exit
            // console.log(
            //   `[DEBUG] KeyboardInterruptHandler.startKeyListener(): Force exiting application...`,
            // );
            this.cleanup();
            console.log(`[INFO] Monitoring stopped by user input. Exiting...`);
            Deno.exit(0);
          }
        } catch (_readError) {
          // Handle read errors gracefully
          // console.log(
          //   `[DEBUG] KeyboardInterruptHandler.startKeyListener(): Read error: ${_readError}`,
          // );
          if (this.isSetup && !globalCancellationToken.isCancelled()) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            break;
          }
        }
      }
    } catch (_error) {
      // Ignore errors during cleanup
      if (this.isSetup && !globalCancellationToken.isCancelled()) {
        // console.log(
        //   `\n[DEBUG] KeyboardInterruptHandler.startKeyListener(): Keyboard input interrupted - stopping monitoring...`,
        // );
        globalCancellationToken.cancel("Keyboard input interrupted");
      }
    }

    // console.log(
    //   `[DEBUG] KeyboardInterruptHandler.startKeyListener(): Key listener exited (isSetup: ${this.isSetup}, cancelled: ${globalCancellationToken.isCancelled()})`,
    // );
  }

  cleanup(): void {
    if (!this.isSetup) {
      return;
    }

    // console.log(`[DEBUG] KeyboardInterruptHandler.cleanup(): Starting cleanup`);
    this.isSetup = false;

    // Reset terminal
    if (Deno.stdin.isTerminal()) {
      try {
        Deno.stdin.setRaw(false);
        // console.log(
        //   `[DEBUG] KeyboardInterruptHandler.cleanup(): Terminal reset to normal mode`,
        // );
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }

    // Wait for key listener to finish
    if (this.keyListenerPromise) {
      // console.log(
      //   `[DEBUG] KeyboardInterruptHandler.cleanup(): Waiting for key listener to finish`,
      // );
      // The key listener will exit naturally when isSetup becomes false
    }

    // console.log(
    //   `[DEBUG] KeyboardInterruptHandler.cleanup(): Cleanup completed`,
    // );

    // For onetime mode, force cleanup of any remaining listeners
    if (globalCancellationToken.isCancelled()) {
      // console.log(
      //   `[DEBUG] KeyboardInterruptHandler.cleanup(): Force terminating for immediate exit`,
      // );
      // Clear any remaining timers/listeners that might keep the process alive
      setTimeout(() => {
        // console.log(`[DEBUG] Final force exit after cleanup delay`);
        Deno.exit(0);
      }, 100);
    }
  }

  isCancellationRequested(): boolean {
    return globalCancellationToken.isCancelled();
  }

  async waitWithKeyboardInterrupt(ms: number): Promise<boolean> {
    // Use the global cancellation token's delay method
    return await globalCancellationToken.delay(ms);
  }

  async sleepWithCancellation(
    ms: number,
    _timeManager: TimeManager,
  ): Promise<boolean> {
    // console.log(`[DEBUG] sleepWithCancellation: Starting ${ms}ms sleep`);
    return await globalCancellationToken.delay(ms);
  }
}

/**
 * Tracks application runtime and enforces maximum runtime limits.
 *
 * The RuntimeTracker class monitors how long the application has been running
 * and can enforce maximum runtime limits to prevent runaway processes.
 *
 * @example
 * ```typescript
 * const tracker = new RuntimeTracker(3600000); // 1 hour limit
 * const limitCheck = tracker.hasExceededLimit();
 * if (!limitCheck.ok) {
 *   console.log("Runtime limit exceeded!");
 * }
 * ```
 */
export class RuntimeTracker {
  private startTime: number;
  private maxRuntime: number;

  constructor(maxRuntime: number) {
    this.startTime = Date.now();
    this.maxRuntime = maxRuntime;
  }

  getStartTime(): number {
    return this.startTime;
  }

  hasExceededLimit(): Result<boolean, ValidationError & { message: string }> {
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.startTime;
    const remainingTime = this.maxRuntime - elapsedTime;

    if (remainingTime <= 0) {
      return {
        ok: false,
        error: createError({
          kind: "RuntimeLimitExceeded",
          maxRuntime: this.maxRuntime,
        }),
      };
    }

    return { ok: true, data: false };
  }

  logStartupInfo(
    logger: Logger,
    timeManager: TimeManager,
    scheduledTime?: Date | null,
  ): void {
    const startTimeStr = timeManager.formatTimeForDisplay(
      new Date(this.startTime),
    );

    // Calculate auto-stop time from scheduled time if available, otherwise from start time
    const autoStopBaseTime = scheduledTime
      ? scheduledTime.getTime()
      : this.startTime;
    const autoStopTime = timeManager.formatTimeForDisplay(
      new Date(autoStopBaseTime + this.maxRuntime),
    );

    logger.info(`Monitor started at: ${startTimeStr} (Asia/Tokyo)`);
    logger.info(`Auto-stop scheduled at: ${autoStopTime} (Asia/Tokyo)`);
  }

  getRemainingTime(): number {
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.startTime;
    return Math.max(0, this.maxRuntime - elapsedTime);
  }
}
