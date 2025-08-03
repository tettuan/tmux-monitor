/**
 * インフラストラクチャイベントハンドラー
 *
 * ドメインイベントを受け取り、実際のtmux操作を実行する。
 * インフラストラクチャ層の責務として、外部システムとの連携を担う。
 */

import type { CommandExecutor, Logger } from "./services.ts";
import type {
  DomainEventHandler,
  PaneClearRequestedEvent,
  PaneEnterSendRequestedEvent,
  PaneTitleChangedEvent,
} from "../domain/events.ts";
import type { Result, ValidationError } from "../core/types.ts";
import { createError, getDefaultMessage } from "../core/types.ts";
import { MONITORING_CONFIG } from "../core/constants.ts";

/**
 * Enter送信イベントハンドラー
 *
 * PaneEnterSendRequestedEventを受け取り、
 * 実際のtmux send-keysコマンドを実行する。
 */
export class EnterSendEventHandler
  implements DomainEventHandler<PaneEnterSendRequestedEvent> {
  private readonly _commandExecutor: CommandExecutor;
  private readonly _logger: Logger;

  constructor(commandExecutor: CommandExecutor, logger: Logger) {
    this._commandExecutor = commandExecutor;
    this._logger = logger;
  }

  async handle(event: PaneEnterSendRequestedEvent): Promise<void> {
    this._logger.info(
      `📤 Sending Enter to pane ${event.paneId} (reason: ${event.reason})`,
    );

    try {
      const result = await this.sendEnterToPane(event.paneId);

      if (result.ok) {
        this._logger.debug(
          `✅ Enter sent successfully to pane ${event.paneId}`,
        );
      } else {
        this._logger.warn(
          `❌ Failed to send Enter to pane ${event.paneId}: ${
            getDefaultMessage(result.error)
          }`,
        );
      }
    } catch (error) {
      this._logger.error(
        `Unexpected error sending Enter to pane ${event.paneId}: ${error}`,
      );
    }
  }

  canHandle(eventType: string): boolean {
    return eventType === "PaneEnterSendRequested";
  }

  /**
   * ペインにEnterキーを送信
   */
  private async sendEnterToPane(
    paneId: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      const command = ["tmux", "send-keys", "-t", paneId, "Enter"];
      const result = await this._commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: createError(
            {
              kind: "CommandFailed",
              command: command.join(" "),
              stderr: getDefaultMessage(result.error),
            },
            `Failed to send Enter to pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
          ),
        };
      }

      // Enter送信後の短い待機
      await new Promise((resolve) =>
        setTimeout(resolve, MONITORING_CONFIG.COMMUNICATION_DELAY_MS)
      );

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "sendEnterToPane",
          details: `Unexpected error: ${error}`,
        }, `Unexpected error sending Enter to pane ${paneId}: ${error}`),
      };
    }
  }
}

/**
 * ペインクリアイベントハンドラー
 *
 * PaneClearRequestedEventを受け取り、
 * 実際のクリアコマンドを実行する。
 */
export class PaneClearEventHandler
  implements DomainEventHandler<PaneClearRequestedEvent> {
  private readonly _commandExecutor: CommandExecutor;
  private readonly _logger: Logger;

  constructor(commandExecutor: CommandExecutor, logger: Logger) {
    this._commandExecutor = commandExecutor;
    this._logger = logger;
  }

  async handle(event: PaneClearRequestedEvent): Promise<void> {
    this._logger.info(
      `🧹 Clearing pane ${event.paneId} (reason: ${event.reason}, strategy: ${event.strategy})`,
    );

    try {
      const result = await this.clearPane(event.paneId, event.strategy);

      if (result.ok) {
        this._logger.debug(`✅ Pane ${event.paneId} cleared successfully`);
      } else {
        this._logger.warn(
          `❌ Failed to clear pane ${event.paneId}: ${
            getDefaultMessage(result.error)
          }`,
        );
      }
    } catch (error) {
      this._logger.error(
        `Unexpected error clearing pane ${event.paneId}: ${error}`,
      );
    }
  }

  canHandle(eventType: string): boolean {
    return eventType === "PaneClearRequested";
  }

  /**
   * ペインをクリア
   */
  private async clearPane(
    paneId: string,
    strategy: "CLEAR_COMMAND" | "ESCAPE_SEQUENCE",
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      if (strategy === "CLEAR_COMMAND") {
        return await this.executeClearCommand(paneId);
      } else {
        return await this.executeEscapeSequence(paneId);
      }
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "clearPane",
          details: `Unexpected error: ${error}`,
        }, `Unexpected error clearing pane ${paneId}: ${error}`),
      };
    }
  }

  /**
   * /clearコマンドを実行
   */
  private async executeClearCommand(
    paneId: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    const command = ["tmux", "send-keys", "-t", paneId, "/clear", "Enter"];
    const result = await this._commandExecutor.execute(command);

    if (!result.ok) {
      return {
        ok: false,
        error: createError(
          {
            kind: "CommandFailed",
            command: command.join(" "),
            stderr: getDefaultMessage(result.error),
          },
          `Failed to send /clear to pane ${paneId}: ${
            getDefaultMessage(result.error)
          }`,
        ),
      };
    }

    // クリアコマンド実行後の待機
    await new Promise((resolve) =>
      setTimeout(resolve, MONITORING_CONFIG.COMMUNICATION_DELAY_MS)
    );

    return { ok: true, data: undefined };
  }

  /**
   * Escapeシーケンスを実行
   */
  private async executeEscapeSequence(
    paneId: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    const commands = [
      ["tmux", "send-keys", "-t", paneId, "Escape"],
      ["tmux", "send-keys", "-t", paneId, "Enter"],
      ["tmux", "send-keys", "-t", paneId, "Escape"],
    ];

    for (const command of commands) {
      const result = await this._commandExecutor.execute(command);
      if (!result.ok) {
        return {
          ok: false,
          error: createError(
            {
              kind: "CommandFailed",
              command: command.join(" "),
              stderr: getDefaultMessage(result.error),
            },
            `Failed to execute escape sequence for pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
          ),
        };
      }

      // 各コマンド間の待機
      await new Promise((resolve) =>
        setTimeout(resolve, MONITORING_CONFIG.COMMUNICATION_DELAY_MS)
      );
    }

    return { ok: true, data: undefined };
  }
}

/**
 * ペインタイトル更新イベントハンドラー
 *
 * PaneTitleChangedEventを受け取り、
 * 実際のtmuxタイトル更新を実行する。
 */
export class PaneTitleUpdateEventHandler
  implements DomainEventHandler<PaneTitleChangedEvent> {
  private readonly _commandExecutor: CommandExecutor;
  private readonly _logger: Logger;

  constructor(commandExecutor: CommandExecutor, logger: Logger) {
    this._commandExecutor = commandExecutor;
    this._logger = logger;
  }

  async handle(event: PaneTitleChangedEvent): Promise<void> {
    this._logger.info(
      `📝 Updating title for pane ${event.paneId}: "${event.oldTitle}" → "${event.newTitle}"`,
    );

    try {
      const result = await this.updatePaneTitle(event.paneId, event.newTitle);

      if (result.ok) {
        this._logger.debug(
          `✅ Title updated successfully for pane ${event.paneId}`,
        );
      } else {
        this._logger.warn(
          `❌ Failed to update title for pane ${event.paneId}: ${
            getDefaultMessage(result.error)
          }`,
        );
      }
    } catch (error) {
      this._logger.error(
        `Unexpected error updating title for pane ${event.paneId}: ${error}`,
      );
    }
  }

  canHandle(eventType: string): boolean {
    return eventType === "PaneTitleChanged";
  }

  /**
   * ペインタイトルを更新
   */
  private async updatePaneTitle(
    paneId: string,
    newTitle: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      const command = ["tmux", "select-pane", "-t", paneId, "-T", newTitle];
      const result = await this._commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: createError(
            {
              kind: "CommandExecutionFailed",
              command: command.join(" "),
              details: getDefaultMessage(result.error),
            },
            `Failed to update title for pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
          ),
        };
      }

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "updatePaneTitle",
          details: `Unexpected error: ${error}`,
        }, `Unexpected error updating title for pane ${paneId}: ${error}`),
      };
    }
  }
}
