import { createError, type Result, type ValidationError } from "./types.ts";
import { globalCancellationToken } from "./cancellation.ts";

// =============================================================================
// Core Infrastructure Services
// =============================================================================

export class CommandExecutor {
  async execute(
    args: string[],
  ): Promise<Result<string, ValidationError & { message: string }>> {
    if (!args || args.length === 0) {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    try {
      const process = new Deno.Command(args[0], {
        args: args.slice(1),
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();

      if (!result.success) {
        const stderr = new TextDecoder().decode(result.stderr);
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
      return { ok: true, data: stdout };
    } catch (error) {
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
}

export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error || "");
  }
}

export class TimeManager {
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

    const interrupted = await globalCancellationToken.delay(msUntilScheduled);
    if (interrupted) {
      return {
        ok: false,
        error: createError({
          kind: "CancellationRequested",
          operation: "scheduled_wait",
        }),
      };
    }

    return { ok: true, data: undefined };
  }
}

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
        console.log(`\n[DEBUG] KeyboardInterruptHandler.setup(): Ctrl+C detected - stopping monitoring...`);
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
    
    console.log(`[DEBUG] KeyboardInterruptHandler.startKeyListener(): Starting key listener`);
    
    try {
      while (this.isSetup && !globalCancellationToken.isCancelled()) {
        try {
          const bytesRead = await Deno.stdin.read(buffer);
          
          if (bytesRead === null) {
            // EOF, wait a bit and continue
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
          }

          if (bytesRead === 0) {
            // No data, wait a bit and continue
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
          }

          // Any key press triggers cancellation
          if (bytesRead > 0) {
            console.log(`\n[DEBUG] KeyboardInterruptHandler.startKeyListener(): Key press detected (${bytesRead} bytes) - stopping monitoring...`);
            globalCancellationToken.cancel("Key press detected");
            
            // Force immediate exit
            console.log(`[DEBUG] KeyboardInterruptHandler.startKeyListener(): Force exiting application...`);
            this.cleanup();
            console.log(`[INFO] Monitoring stopped by user input. Exiting...`);
            Deno.exit(0);
          }
        } catch (readError) {
          // Handle read errors gracefully
          console.log(`[DEBUG] KeyboardInterruptHandler.startKeyListener(): Read error: ${readError}`);
          if (this.isSetup && !globalCancellationToken.isCancelled()) {
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            break;
          }
        }
      }
    } catch (_error) {
      // Ignore errors during cleanup
      if (this.isSetup && !globalCancellationToken.isCancelled()) {
        console.log(`\n[DEBUG] KeyboardInterruptHandler.startKeyListener(): Keyboard input interrupted - stopping monitoring...`);
        globalCancellationToken.cancel("Keyboard input interrupted");
      }
    }
    
    console.log(`[DEBUG] KeyboardInterruptHandler.startKeyListener(): Key listener exited (isSetup: ${this.isSetup}, cancelled: ${globalCancellationToken.isCancelled()})`);
  }

  cleanup(): void {
    if (!this.isSetup) {
      return;
    }

    console.log(`[DEBUG] KeyboardInterruptHandler.cleanup(): Starting cleanup`);
    this.isSetup = false;

    // Reset terminal
    if (Deno.stdin.isTerminal()) {
      try {
        Deno.stdin.setRaw(false);
        console.log(`[DEBUG] KeyboardInterruptHandler.cleanup(): Terminal reset to normal mode`);
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }

    // Wait for key listener to finish
    if (this.keyListenerPromise) {
      console.log(`[DEBUG] KeyboardInterruptHandler.cleanup(): Waiting for key listener to finish`);
      // The key listener will exit naturally when isSetup becomes false
    }

    console.log(`[DEBUG] KeyboardInterruptHandler.cleanup(): Cleanup completed`);
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
    console.log(`[DEBUG] sleepWithCancellation: Starting ${ms}ms sleep`);
    return await globalCancellationToken.delay(ms);
  }
}

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

  logStartupInfo(logger: Logger, timeManager: TimeManager): void {
    const startTimeStr = timeManager.formatTimeForDisplay(
      new Date(this.startTime),
    );
    const autoStopTime = timeManager.formatTimeForDisplay(
      new Date(this.startTime + this.maxRuntime),
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
