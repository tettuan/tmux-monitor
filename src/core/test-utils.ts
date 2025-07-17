/**
 * 共通テストユーティリティ
 * 全域性原則に基づく型安全なMockクラス群
 */

import { createError, type Result, type ValidationError } from "./types.ts";
import type { ICommandExecutor, ILogger, ITimeManager } from "./interfaces.ts";

/**
 * MockLogger - 統一されたログ出力Mock
 * 6ファイルで重複していた実装を集約
 */
export class MockLogger implements ILogger {
  readonly debug = (msg: string): void => console.log(`DEBUG: ${msg}`);
  readonly info = (msg: string): void => console.log(`INFO: ${msg}`);
  readonly error = (msg: string): void => console.error(`ERROR: ${msg}`);
  readonly warn = (msg: string): void => console.warn(`WARN: ${msg}`);
}

/**
 * MockCommandExecutor - tmuxコマンド実行のMock
 * 3ファイルで重複していた実装を統一
 */
export class MockCommandExecutor implements ICommandExecutor {
  readonly execute = (
    command: string[],
  ): Promise<Result<string, ValidationError & { message: string }>> => {
    console.log(`Mock execute: ${command.join(" ")}`);
    return Promise.resolve({
      ok: true,
      data: `executed: ${command.join(" ")}`,
    });
  };

  readonly executeTmuxCommand = (
    command: string,
  ): Promise<Result<string, ValidationError & { message: string }>> => {
    console.log(`Mock tmux: ${command}`);
    return Promise.resolve({ ok: true, data: `tmux output: ${command}` });
  };

  readonly killAllPanes = (): Promise<
    Result<string, ValidationError & { message: string }>
  > => {
    console.log("Mock killAllPanes");
    return Promise.resolve({ ok: true, data: "all panes killed" });
  };
}

/**
 * MockTimeManager - 時間管理のMock
 * 2ファイルで重複していた実装を統一
 */
export class MockTimeManager implements ITimeManager {
  private currentTime: Date = new Date();

  readonly getCurrentTime = (): Date => this.currentTime;

  readonly setCurrentTime = (time: Date): void => {
    this.currentTime = time;
  };

  readonly formatTime = (date: Date): string => {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  readonly formatTimeForDisplay = (date: Date): string => {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  readonly sleep = (ms: number): Promise<void> => {
    console.log(`Mock sleep: ${ms}ms`);
    return Promise.resolve();
  };

  readonly waitUntilScheduledTime = (
    scheduledTime: Date,
    logger: ILogger,
    // deno-lint-ignore no-explicit-any
    _keyboardHandler: any,
  ): Promise<Result<void, ValidationError & { message: string }>> => {
    console.log(`Mock waitUntilScheduledTime: ${scheduledTime.toISOString()}`);
    logger.info(`Mock: Waiting until ${scheduledTime.toISOString()}`);
    return Promise.resolve({ ok: true, data: undefined });
  };

  readonly scheduleExecution = (
    time: string,
  ): Result<Date, ValidationError & { message: string }> => {
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
  };
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
