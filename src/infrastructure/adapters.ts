/**
 * インフラストラクチャ層アダプター
 *
 * DDDアーキテクチャの最下層として、外部システム（tmux、ファイルシステム等）
 * との具体的な通信を担当。アプリケーション層で定義されたインターフェースを実装。
 *
 * 【統合版】: 統合CaptureDetectionServiceを使用してcapture機能を一元化
 */

import type { Result } from "../types.ts";
import { createError } from "../types.ts";
import type {
  IPaneCommunicator,
  ITmuxSessionRepository,
  RawPaneData,
} from "../application/monitoring_service.ts";
import type { CommandExecutor, Logger } from "../services.ts";
import {
  CaptureDetectionService,
  InMemoryCaptureHistory,
} from "../domain/capture_detection_service.ts";
import { TmuxCaptureAdapter } from "./unified_capture_adapter.ts";

/**
 * CommandExecutorアダプター
 * unified_capture_adapter.tsのICommandExecutorに適合させる
 */
class CommandExecutorAdapter {
  constructor(private executor: CommandExecutor) {}

  async execute(command: string[]): Promise<Result<string, Error>> {
    const result = await this.executor.execute(command);
    if (result.ok) {
      return { ok: true, data: result.data };
    } else {
      return { ok: false, error: new Error(result.error.message) };
    }
  }
}

// =============================================================================
// TmuxSessionAdapter - tmuxセッション操作の実装
// =============================================================================

/**
 * tmuxセッションリポジトリの実装
 *
 * tmuxコマンドを実行してペイン情報を取得する具体的な実装。
 * DDDのリポジトリパターンに従い、ドメインモデルの永続化を抽象化。
 */
export class TmuxSessionAdapter implements ITmuxSessionRepository {
  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {}

  /**
   * tmuxセッションからペイン情報を発見
   */
  async discoverPanes(
    sessionName?: string,
  ): Promise<Result<RawPaneData[], Error>> {
    try {
      // tmuxコマンドの構築
      const command = sessionName
        ? ["tmux", "list-panes", "-s", sessionName, "-F", this.getPaneFormat()]
        : ["tmux", "list-panes", "-a", "-F", this.getPaneFormat()];

      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to list tmux panes: ${result.error.message}`,
          ),
        };
      }

      // 出力のパース
      const lines = result.data.split("\n").filter((line) =>
        line.trim() !== ""
      );
      const panes: RawPaneData[] = [];

      for (const line of lines) {
        const paneData = this.parsePaneLine(line);
        if (paneData) {
          panes.push(paneData);
        }
      }

      return { ok: true, data: panes };
    } catch (error) {
      return {
        ok: false,
        error: new Error(`Unexpected error during pane discovery: ${error}`),
      };
    }
  }

  /**
   * tmuxコマンドの実行
   */
  async executeTmuxCommand(command: string[]): Promise<Result<string, Error>> {
    try {
      console.log(`🔧 Executing tmux command: [${command.join(", ")}]`);
      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        console.log(`❌ Tmux command failed: ${result.error.message}`);
        return {
          ok: false,
          error: new Error(`tmux command failed: ${result.error.message}`),
        };
      }

      console.log(
        `✅ Tmux command successful, output length: ${result.data.length}`,
      );
      return { ok: true, data: result.data };
    } catch (error) {
      console.log(`💥 Unexpected error in tmux command: ${error}`);
      return {
        ok: false,
        error: new Error(`Unexpected error executing tmux command: ${error}`),
      };
    }
  }

  /**
   * tmuxペイン情報のフォーマット文字列
   */
  private getPaneFormat(): string {
    return [
      "#{session_name}",
      "#{window_index}",
      "#{window_name}",
      "#{pane_id}",
      "#{pane_index}",
      "#{pane_tty}",
      "#{pane_pid}",
      "#{pane_current_command}",
      "#{pane_current_path}",
      "#{pane_title}",
      "#{pane_active}",
      "#{window_zoomed_flag}",
      "#{pane_width}",
      "#{pane_height}",
      "#{pane_start_command}",
    ].join("|");
  }

  /**
   * ペイン行のパース
   */
  private parsePaneLine(line: string): RawPaneData | null {
    const parts = line.split("|");

    if (parts.length < 15) {
      this.logger.warn(`Invalid pane line format: ${line}`);
      return null;
    }

    return {
      sessionName: parts[0],
      windowIndex: parts[1],
      windowName: parts[2],
      paneId: parts[3],
      paneIndex: parts[4],
      tty: parts[5],
      pid: parts[6],
      currentCommand: parts[7],
      currentPath: parts[8],
      title: parts[9],
      active: parts[10],
      zoomed: parts[11],
      width: parts[12],
      height: parts[13],
      startCommand: parts[14],
    };
  }
}

// =============================================================================
// PaneContentAdapter - ペインコンテンツ監視の実装（統合版）
// =============================================================================

// =============================================================================
// PaneCommunicationAdapter - ペイン通信の実装
// =============================================================================

/**
 * ペイン通信の実装
 *
 * tmuxのsend-keysコマンドを使用してペインにメッセージやコマンドを送信。
 */
export class PaneCommunicationAdapter implements IPaneCommunicator {
  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {}

  /**
   * ペインへのメッセージ送信
   */
  async sendMessage(
    paneId: string,
    message: string,
  ): Promise<Result<void, Error>> {
    try {
      // メッセージをエスケープして送信
      const escapedMessage = this.escapeMessage(message);
      const command = ["tmux", "send-keys", "-t", paneId, escapedMessage];

      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send message to pane ${paneId}: ${result.error.message}`,
          ),
        };
      }

      this.logger.debug(
        `Message sent to pane ${paneId}: ${message.substring(0, 50)}...`,
      );
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unexpected error sending message to pane ${paneId}: ${error}`,
        ),
      };
    }
  }

  /**
   * ペインへのコマンド送信
   */
  async sendCommand(
    paneId: string,
    command: string,
  ): Promise<Result<void, Error>> {
    try {
      // Escapeキーの場合は特別な処理
      if (command === "\u001b") {
        const sendCommand = ["tmux", "send-keys", "-t", paneId, "Escape"];
        const result = await this.commandExecutor.execute(sendCommand);

        if (!result.ok) {
          return {
            ok: false,
            error: new Error(
              `Failed to send Escape key to pane ${paneId}: ${result.error.message}`,
            ),
          };
        }

        this.logger.info(`Escape key sent to pane ${paneId}`);
        return { ok: true, data: undefined };
      }

      // 通常のコマンドの場合
      const sendCommand = ["tmux", "send-keys", "-t", paneId, command, "Enter"];

      const result = await this.commandExecutor.execute(sendCommand);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send command to pane ${paneId}: ${result.error.message}`,
          ),
        };
      }

      this.logger.info(`Command sent to pane ${paneId}: ${command}`);
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unexpected error sending command to pane ${paneId}: ${error}`,
        ),
      };
    }
  }

  /**
   * Enterキーの送信
   */
  async sendEnter(paneId: string): Promise<Result<void, Error>> {
    try {
      const command = ["tmux", "send-keys", "-t", paneId, "Enter"];
      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send Enter to pane ${paneId}: ${result.error.message}`,
          ),
        };
      }

      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unexpected error sending Enter to pane ${paneId}: ${error}`,
        ),
      };
    }
  }

  /**
   * メッセージのエスケープ
   *
   * tmuxのsend-keysで安全に送信できるようにエスケープ。
   */
  private escapeMessage(message: string): string {
    return message
      .replace(/\\/g, "\\\\") // バックスラッシュのエスケープ
      .replace(/"/g, '\\"') // ダブルクォートのエスケープ
      .replace(/'/g, "\\'") // シングルクォートのエスケープ
      .replace(/\$/g, "\\$") // ドル記号のエスケープ
      .replace(/`/g, "\\`"); // バッククォートのエスケープ
  }

  /**
   * 複数ペインへの一括送信
   */
  async broadcastMessage(
    paneIds: string[],
    message: string,
  ): Promise<Result<number, Error>> {
    let successCount = 0;
    const errors: string[] = [];

    for (const paneId of paneIds) {
      const result = await this.sendMessage(paneId, message);
      if (result.ok) {
        successCount++;
      } else {
        errors.push(`Pane ${paneId}: ${result.error.message}`);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Some broadcasts failed: ${errors.join(", ")}`);
    }

    return { ok: true, data: successCount };
  }

  /**
   * 複数ペインへのEnter送信
   */
  async broadcastEnter(paneIds: string[]): Promise<Result<number, Error>> {
    let successCount = 0;

    for (const paneId of paneIds) {
      const result = await this.sendEnter(paneId);
      if (result.ok) {
        successCount++;
      }
    }

    return { ok: true, data: successCount };
  }

  /**
   * /clearコマンドの専用送信（Enterキーを分離）
   * 
   * /clearコマンドを送信し、0.2秒待機してから別途Enterキーを送信します。
   * これによりClaudeの適切なクリア動作を確保します。
   */
  async sendClearCommand(paneId: string): Promise<Result<void, Error>> {
    try {
      // 1. /clearコマンドを送信（Enterキーなし）
      const clearCommand = ["tmux", "send-keys", "-t", paneId, "/clear"];
      const clearResult = await this.commandExecutor.execute(clearCommand);

      if (!clearResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send /clear command to pane ${paneId}: ${clearResult.error.message}`,
          ),
        };
      }

      this.logger.debug(`/clear command sent to pane ${paneId}`);

      // 2. 0.2秒待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 3. Enterキーを送信
      const enterResult = await this.sendEnter(paneId);
      if (!enterResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send Enter after /clear to pane ${paneId}: ${enterResult.error.message}`,
          ),
        };
      }

      this.logger.info(`Clear command sequence completed for pane ${paneId}`);
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unexpected error sending clear command to pane ${paneId}: ${error}`,
        ),
      };
    }
  }
}

// =============================================================================
// AdapterFactory - アダプターのファクトリー
// =============================================================================

/**
 * アダプターファクトリー
 *
 * DIコンテナとの統合を容易にするためのファクトリークラス。
 * 依存関係の注入と設定を一元化。
 */
export class InfrastructureAdapterFactory {
  /**
   * tmuxセッションアダプターの作成
   */
  static createTmuxSessionAdapter(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): ITmuxSessionRepository {
    return new TmuxSessionAdapter(commandExecutor, logger);
  }

  /**
   * ペイン通信アダプターの作成
   */
  static createPaneCommunicationAdapter(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): IPaneCommunicator {
    return new PaneCommunicationAdapter(commandExecutor, logger);
  }

  /**
   * 統合キャプチャ検出サービスの作成
   */
  static createCaptureDetectionService(
    commandExecutor: CommandExecutor,
  ): CaptureDetectionService {
    // CommandExecutorアダプターを作成
    const commandAdapter = {
      async execute(command: string[]): Promise<Result<string, Error>> {
        const result = await commandExecutor.execute(command);
        if (result.ok) {
          return { ok: true, data: result.data };
        } else {
          return { ok: false, error: new Error(result.error.message) };
        }
      }
    };

    // 統合サービスの初期化
    const captureAdapter = new TmuxCaptureAdapter(commandAdapter);
    const captureHistory = new InMemoryCaptureHistory();
    return new CaptureDetectionService(captureAdapter, captureHistory);
  }

  /**
   * 全アダプターのセット作成
   */
  static createAllAdapters(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): {
    tmuxRepository: ITmuxSessionRepository;
    communicator: IPaneCommunicator;
    captureDetectionService: CaptureDetectionService;
  } {
    const captureDetectionService = this.createCaptureDetectionService(commandExecutor);
    
    return {
      tmuxRepository: this.createTmuxSessionAdapter(commandExecutor, logger),
      communicator: this.createPaneCommunicationAdapter(
        commandExecutor,
        logger,
      ),
      captureDetectionService,
    };
  }
}
