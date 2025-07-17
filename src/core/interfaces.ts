/**
 * 共通インターフェース定義
 * オッカムの剃刀原則に従い、重複したインターフェース定義を統一
 */

import type { Result, ValidationError } from "./types.ts";

/**
 * tmuxコマンド実行の統一インターフェース
 *
 * 3箇所で重複していた定義を統一：
 * - src/domain/pane.ts (ITmuxRepository)
 * - src/application/monitoring_service.ts (ITmuxSessionRepository)
 * - src/infrastructure/adapters.ts (実装)
 */
export interface ITmuxCommandExecutor {
  /**
   * tmuxコマンドを実行する
   *
   * @param command - 実行するtmuxコマンド文字列
   * @returns Promise<Result<string, ValidationError & { message: string }>>
   * @example
   * ```typescript
   * const result = await executor.executeTmuxCommand("tmux list-sessions");
   * ```
   */
  executeTmuxCommand(
    command: string,
  ): Promise<Result<string, ValidationError & { message: string }>>;
}

/**
 * 基本コマンド実行の統一インターフェース
 *
 * CommandExecutorクラスの共通インターフェース定義
 */
export interface ICommandExecutor extends ITmuxCommandExecutor {
  /**
   * 任意のシェルコマンドを実行する
   *
   * @param args - 実行するコマンド配列
   * @returns Promise<Result<string, ValidationError & { message: string }>>
   */
  execute(
    args: string[],
  ): Promise<Result<string, ValidationError & { message: string }>>;

  /**
   * 全ペインを終了する
   *
   * @returns Promise<Result<string, ValidationError & { message: string }>>
   */
  killAllPanes(): Promise<
    Result<string, ValidationError & { message: string }>
  >;
}

/**
 * ログ出力の統一インターフェース
 *
 * 全層で使用されるロガーの共通定義
 */
export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * 時間管理の統一インターフェース
 *
 * TimeManagerクラスの共通インターフェース定義
 */
export interface ITimeManager {
  getCurrentTime(): Date;
  formatTime(date: Date): string;
  formatTimeForDisplay(date: Date): string;
  sleep(milliseconds: number): Promise<void>;
  waitUntilScheduledTime(
    scheduledTime: Date,
    logger: ILogger,
    // deno-lint-ignore no-explicit-any
    keyboardHandler: any,
  ): Promise<Result<void, ValidationError & { message: string }>>;
  scheduleExecution(
    time: string,
  ): Result<Date, ValidationError & { message: string }>;
}
