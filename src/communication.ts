import { createError, type Result, type ValidationError } from "./types.ts";
import type { PaneDetail } from "./models.ts";

/**
 * Message generator for creating formatted monitoring and status messages.
 *
 * Generates structured messages for status reports, pane listings, and other
 * monitoring communications with consistent formatting and timestamps.
 *
 * @example
 * ```typescript
 * const statusMessage = MessageGenerator.generateStatusMessage(
 *   activePanes, inactivePanes, statusResults
 * );
 * const paneListMessage = MessageGenerator.generatePaneListMessage(allPanes);
 * ```
 */
export class MessageGenerator {
  static generateStatusMessage(
    activePanes: PaneDetail[],
    inactivePanes: PaneDetail[],
    statusResults: Array<{ pane: PaneDetail; status: string }>,
  ): string {
    const now = new Date().toISOString();
    let message = `[${now}] Pane Status Report\n\n`;

    message += `Active Panes (${activePanes.length}):\n`;
    activePanes.forEach((pane, index) => {
      message += `  ${
        index + 1
      }. [${pane.paneId}] ${pane.title} - ${pane.currentCommand}\n`;
    });

    message += `\nInactive Panes (${inactivePanes.length}):\n`;
    inactivePanes.forEach((pane, index) => {
      const statusResult = statusResults.find((r) =>
        r.pane.paneId === pane.paneId
      );
      const status = statusResult ? statusResult.status : "UNKNOWN";
      message += `  ${
        index + 1
      }. [${pane.paneId}] ${pane.title} - ${pane.currentCommand} (Status: ${status})\n`;
    });

    return message;
  }

  static generatePaneListMessage(panes: PaneDetail[]): string {
    const now = new Date().toISOString();
    let message = `[${now}] Complete Pane List\n\n`;

    panes.forEach((pane, index) => {
      const activeStatus = pane.active === "1" ? "ACTIVE" : "INACTIVE";
      message += `${index + 1}. [${pane.paneId}] ${pane.title}\n`;
      message += `   Command: ${pane.currentCommand}\n`;
      message += `   Path: ${pane.currentPath}\n`;
      message += `   Status: ${activeStatus}\n`;
      message += `   Size: ${pane.width}x${pane.height}\n\n`;
    });

    return message;
  }
}

/**
 * Pane communication manager for sending commands and instructions to tmux panes.
 *
 * Handles all communication with tmux panes including sending status update requests,
 * instruction files, and other commands with proper error handling and validation.
 *
 * @example
 * ```typescript
 * const communicator = PaneCommunicator.create(commandExecutor, logger);
 * const result = await communicator.sendStatusUpdateToPane("pane1");
 * const instructionResult = await communicator.sendInstructionFile("pane1", "./startup.txt");
 * ```
 */
export class PaneCommunicator {
  private constructor(
    // deno-lint-ignore no-explicit-any
    private commandExecutor: any,
    // deno-lint-ignore no-explicit-any
    private logger: any,
  ) {}

  // deno-lint-ignore no-explicit-any
  static create(commandExecutor: any, logger: any): PaneCommunicator {
    return new PaneCommunicator(commandExecutor, logger);
  }

  sendStatusUpdateToPane(
    paneId: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    // Status update instructions disabled - only monitoring without sending commands
    this.logger.info(`Skipping status update instruction to pane ${paneId} (disabled)`);
    return Promise.resolve({ ok: true, data: undefined });
  }

  async sendToPane(
    paneId: string,
    message: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    // メッセージを送信
    const messageResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      paneId,
      message,
    ]);

    if (!messageResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send-keys message to ${paneId}`,
          stderr: messageResult.error,
        }),
      };
    }

    // 短い待機時間を置いてからEnterを送信
    await new Promise((resolve) => setTimeout(resolve, 100));

    const enterResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      paneId,
      "Enter",
    ]);

    if (!enterResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send-keys Enter to ${paneId}`,
          stderr: enterResult.error,
        }),
      };
    }

    return { ok: true, data: undefined };
  }

  async sendInstructionFile(
    paneId: string,
    filePath: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    this.logger.info(`Sending instruction file to pane ${paneId}: ${filePath}`);

    // Check if file exists
    try {
      await Deno.stat(filePath);
    } catch (_error) {
      return {
        ok: false,
        error: createError({ kind: "FileNotFound", path: filePath }),
      };
    }

    const command = `cat "${filePath}"`;

    // コマンドを送信
    const commandResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      paneId,
      command,
    ]);

    if (!commandResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send-keys command to ${paneId}`,
          stderr: commandResult.error,
        }),
      };
    }

    // 短い待機時間を置いてからEnterを送信
    await new Promise((resolve) => setTimeout(resolve, 100));

    const enterResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      paneId,
      "Enter",
    ]);

    if (!enterResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send instruction file Enter to ${paneId}`,
          stderr: enterResult.error,
        }),
      };
    }

    return { ok: true, data: undefined };
  }

  async sendRegularEnterToInactivePanes(
    inactivePanes: PaneDetail[],
  ): Promise<void> {
    for (const pane of inactivePanes) {
      const result = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        pane.paneId,
        "Enter",
      ]);

      if (!result.ok) {
        this.logger.warn(
          `Failed to send Enter to pane ${pane.paneId}: ${result.error}`,
        );
      }
    }
  }

  async sendMainReport(
    mainPaneId: string,
    message: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    this.logger.info(`Sending main report to pane ${mainPaneId}`);

    // メッセージを送信
    const messageResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      mainPaneId,
      message,
    ]);

    if (!messageResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send main report message to ${mainPaneId}`,
          stderr: messageResult.error,
        }),
      };
    }

    // 短い待機時間を置いてからEnterを送信
    await new Promise((resolve) => setTimeout(resolve, 100));

    const enterResult = await this.commandExecutor.execute([
      "tmux",
      "send-keys",
      "-t",
      mainPaneId,
      "Enter",
    ]);

    if (!enterResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: `tmux send main report Enter to ${mainPaneId}`,
          stderr: enterResult.error,
        }),
      };
    }

    return { ok: true, data: undefined };
  }

  /**
   * Claudeが立ち上がっているかを検出する
   */
  isClaudeRunning(panes: PaneDetail[]): boolean {
    for (const pane of panes) {
      const command = pane.currentCommand.toLowerCase();
      if (command.includes("claude") || command.includes("cld")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Claudeが立ち上がっていない場合、各ペインでcldコマンドを実行
   */
  async startClaudeIfNotRunning(panes: PaneDetail[]): Promise<void> {
    const claudeRunning = this.isClaudeRunning(panes);

    if (claudeRunning) {
      this.logger.info("Claude is already running, skipping cld command");
      return;
    }

    this.logger.info("Claude not detected, sending cld command to all panes");

    for (const pane of panes) {
      // zshシェルのペインにのみcldコマンドを送信
      if (pane.currentCommand.toLowerCase().includes("zsh")) {
        this.logger.info(`Sending cld command to pane ${pane.paneId}`);

        // cldコマンドを送信
        const commandResult = await this.commandExecutor.execute([
          "tmux",
          "send-keys",
          "-t",
          pane.paneId,
          "cld",
        ]);

        if (!commandResult.ok) {
          this.logger.warn(
            `Failed to send cld command to pane ${pane.paneId}: ${commandResult.error}`,
          );
          continue;
        }

        // 短い待機時間を置いてからEnterを送信
        await new Promise((resolve) => setTimeout(resolve, 100));

        const enterResult = await this.commandExecutor.execute([
          "tmux",
          "send-keys",
          "-t",
          pane.paneId,
          "Enter",
        ]);

        if (!enterResult.ok) {
          this.logger.warn(
            `Failed to send Enter to pane ${pane.paneId}: ${enterResult.error}`,
          );
        } else {
          this.logger.info(
            `Successfully sent cld command to pane ${pane.paneId}`,
          );
        }

        // 少し待機してから次のペインへ
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
}
