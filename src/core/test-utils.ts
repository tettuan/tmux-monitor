/**
 * 共通テストユーティリティ
 * 全域性原則に基づく型安全なMockクラス群
 */

import { createError, type Result, type ValidationError } from "./types.ts";
import type { ICommandExecutor, ILogger, ITimeManager } from "./interfaces.ts";
import { Logger, LoggerConfig } from "../infrastructure/services.ts";

/**
 * MockLogger - 統一されたログ出力Mock
 * Refactored Logger classを継承
 */
export class MockLogger extends Logger {
  public messages: Array<{ level: string; message: string; error?: Error }> =
    [];

  constructor() {
    // Create a default INFO logger config to avoid env access
    const config = LoggerConfig.create("INFO");
    super(config.ok ? config.data : LoggerConfig.fromEnv());
  }

  // Override methods to capture messages for testing
  override debug(message: string): void {
    this.messages.push({ level: "DEBUG", message });
    super.debug(message);
  }

  override info(message: string): void {
    this.messages.push({ level: "INFO", message });
    super.info(message);
  }

  override warn(message: string): void {
    this.messages.push({ level: "WARN", message });
    super.warn(message);
  }

  override error(message: string, error?: Error): void {
    this.messages.push({ level: "ERROR", message, error });
    super.error(message, error);
  }

  // ILogger compatibility methods
  readonly ILogger = true; // Type discriminator
}

/**
 * MockCommandExecutor - tmuxコマンド実行のMock
 * Refactored CommandExecutorに対応
 */
export class MockCommandExecutor implements ICommandExecutor {
  private executeCalls: Array<
    { command: string[] | unknown; result: unknown }
  > = [];

  execute(
    command: string[],
  ): Promise<Result<string, ValidationError & { message: string }>> {
    console.log(`Mock execute: ${command.join(" ")}`);
    const result = {
      ok: true as const,
      data: `executed: ${command.join(" ")}`,
    };
    this.executeCalls.push({ command, result });
    return Promise.resolve(result);
  }

  executeTmuxCommand(
    command: string,
  ): Promise<Result<string, ValidationError & { message: string }>> {
    console.log(`Mock tmux: ${command}`);
    return Promise.resolve({ ok: true, data: `tmux output: ${command}` });
  }

  killAllPanes(): Promise<
    Result<string, ValidationError & { message: string }>
  > {
    console.log("Mock killAllPanes");
    return Promise.resolve({ ok: true, data: "all panes killed" });
  }

  clearAllPanes(): Promise<
    Result<string, ValidationError & { message: string }>
  > {
    console.log("Mock clearAllPanes");
    return Promise.resolve({ ok: true, data: "all panes cleared" });
  }

  // Helper for tests
  getExecuteCalls() {
    return this.executeCalls;
  }
}

/**
 * SimpleCommandExecutor - A minimal CommandExecutor for tests that don't need command functionality
 */
import { CommandExecutor } from "../infrastructure/services.ts";

export class SimpleCommandExecutor extends CommandExecutor {
  // Inherits all methods from CommandExecutor
  // Can override specific methods if needed for testing
}

/**
 * MockTimeManager - 時間管理のMock
 * Refactored TimeManagerに対応
 */
export class MockTimeManager implements ITimeManager {
  private currentTime: Date = new Date();
  private mockTimestamp?: number;

  getCurrentTime(): Date {
    return this.currentTime;
  }

  setCurrentTime(time: Date): void {
    this.currentTime = time;
  }

  formatTime(date: Date): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  sleep(ms: number): Promise<void> {
    console.log(`Mock sleep: ${ms}ms`);
    return Promise.resolve();
  }

  waitUntilScheduledTime(
    scheduledTime: Date,
    logger: ILogger | Logger,
    _keyboardHandler: unknown,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    console.log(`Mock waitUntilScheduledTime: ${scheduledTime.toISOString()}`);
    logger.info(`Mock: Waiting until ${scheduledTime.toISOString()}`);
    return Promise.resolve({ ok: true, data: undefined });
  }

  scheduleExecution(
    time: string,
  ): Result<Date, ValidationError & { message: string }> {
    try {
      const scheduledTime = new Date(time);
      return { ok: true, data: scheduledTime };
    } catch {
      return {
        ok: false,
        error: createError(
          { kind: "ParseError", input: time },
          `Invalid time format: ${time}`,
        ),
      };
    }
  }

  // Additional methods for compatibility with refactored TimeManager
  getCurrentTimeISO(): string {
    return this.currentTime.toISOString();
  }

  setMockTimestamp(timestamp: number): void {
    this.mockTimestamp = timestamp;
    this.currentTime = new Date(timestamp);
  }
}

/**
 * テストヘルパー関数群
 */
export const TestHelpers = {
  /**
   * Result型の成功値を取得（テスト用）
   */
  unwrapOk: <T, E>(result: Result<T, E>): T => {
    if (result.ok) return result.data;
    throw new Error(
      `Expected Ok but got Error: ${JSON.stringify(result.error)}`,
    );
  },

  /**
   * Result型のエラー値を取得（テスト用）
   */
  unwrapError: <T, E>(result: Result<T, E>): E => {
    if (!result.ok) return result.error;
    throw new Error(
      `Expected Error but got Ok: ${JSON.stringify(result.data)}`,
    );
  },

  /**
   * テスト用のValidationError作成
   */
  createTestError: (
    kind: ValidationError["kind"],
    message?: string,
  ): ValidationError & { message: string } => {
    const baseError: ValidationError = (() => {
      switch (kind) {
        case "EmptyInput":
          return { kind: "EmptyInput" };
        case "ParseError":
          return { kind: "ParseError", input: "test" };
        case "InvalidFormat":
          return { kind: "InvalidFormat", input: "test", expected: "string" };
        case "CommandFailed":
          return { kind: "CommandFailed", command: "test", stderr: "error" };
        case "TimeoutError":
          return { kind: "TimeoutError", operation: "test" };
        case "InvalidTimeFormat":
          return { kind: "InvalidTimeFormat", input: "test" };
        case "FileNotFound":
          return { kind: "FileNotFound", path: "test" };
        case "InvalidState":
          return {
            kind: "InvalidState",
            current: "test",
            expected: "expected",
          };
        case "CancellationRequested":
          return { kind: "CancellationRequested", operation: "test" };
        case "SessionNotFound":
          return { kind: "SessionNotFound" };
        case "PaneNotFound":
          return { kind: "PaneNotFound", paneId: "test" };
        case "RuntimeLimitExceeded":
          return { kind: "RuntimeLimitExceeded", maxRuntime: 3600 };
        case "ValidationFailed":
          return {
            kind: "ValidationFailed",
            input: "test",
            constraint: "test",
          };
        case "BusinessRuleViolation":
          return {
            kind: "BusinessRuleViolation",
            rule: "test",
            context: "test",
          };
        case "UnexpectedError":
          return {
            kind: "UnexpectedError",
            operation: "test",
            details: "test",
          };
        case "IllegalState":
          return {
            kind: "IllegalState",
            currentState: "test",
            expectedState: "test",
          };
        case "RepositoryError":
          return {
            kind: "RepositoryError",
            operation: "test",
            details: "test",
          };
        case "CommunicationFailed":
          return {
            kind: "CommunicationFailed",
            target: "test",
            details: "test",
          };
        case "CommandExecutionFailed":
          return {
            kind: "CommandExecutionFailed",
            command: "test",
            details: "test",
          };
        case "MigrationFailed":
          return {
            kind: "MigrationFailed",
            from: "test",
            to: "test",
            details: "test",
          };
        case "HelpRequested":
          return { kind: "HelpRequested" };
        case "UnknownOption":
          return { kind: "UnknownOption", option: "test" };
      }
    })();
    return createError(baseError, message);
  },
} as const;
