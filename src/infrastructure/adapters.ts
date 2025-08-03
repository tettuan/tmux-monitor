/**
 * インフラストラクチャ層アダプター
 *
 * DDDアーキテクチャの最下層として、外部システム（tmux、ファイルシステム等）
 * との具体的な通信を担当。アプリケーション層で定義されたインターフェースを実装。
 *
 * 【統合版】: 統合CaptureDetectionServiceを使用してcapture機能を一元化
 */

import type { Result } from "../core/types.ts";
import { getDefaultMessage } from "../core/types.ts";
import type {
  IPaneCommunicator,
  ITmuxSessionRepository,
  RawPaneData,
} from "../application/monitoring_service.ts";
import type { CommandExecutor, Logger } from "./services.ts";
import type { PaneDetail } from "../core/models.ts";
import { PaneCommunicator } from "./communication.ts";
import {
  CaptureDetectionService,
  InMemoryCaptureHistory,
} from "../domain/capture_detection_service.ts";
import { TmuxCaptureAdapter } from "./unified_capture_adapter.ts";

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
            `Failed to list tmux panes: ${JSON.stringify(result.error)}`,
          ),
        };
      }

      // 出力のパース - handle both string and CommandResult
      let outputStr: string;
      if (typeof result.data === "string") {
        outputStr = result.data;
      } else if (result.data.kind === "success") {
        outputStr = result.data.stdout;
      } else {
        return {
          ok: false,
          error: new Error("Command failed to return stdout"),
        };
      }

      const lines = outputStr.split("\n").filter((line: string) =>
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
        console.log(`❌ Tmux command failed: ${JSON.stringify(result.error)}`);
        return {
          ok: false,
          error: new Error(
            `tmux command failed: ${JSON.stringify(result.error)}`,
          ),
        };
      }

      // Handle both string and CommandResult
      let outputStr: string;
      if (typeof result.data === "string") {
        outputStr = result.data;
      } else if (result.data.kind === "success") {
        outputStr = result.data.stdout;
      } else {
        return {
          ok: false,
          error: new Error("Command failed to return stdout"),
        };
      }

      console.log(
        `✅ Tmux command successful, output length: ${outputStr.length}`,
      );
      return { ok: true, data: outputStr };
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
  private readonly communicator: PaneCommunicator;

  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {
    // PaneCommunicatorのインスタンスを作成
    this.communicator = PaneCommunicator.create(commandExecutor, logger);
  }

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
            `Failed to send message to pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
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
              `Failed to send Escape key to pane ${paneId}: ${
                getDefaultMessage(result.error)
              }`,
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
            `Failed to send command to pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
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
            `Failed to send Enter to pane ${paneId}: ${
              getDefaultMessage(result.error)
            }`,
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
   * /clearコマンドの専用送信（ユーザー提供コマンドと同等の処理）
   *
   * 以下の手順でクリアコマンドを送信します：
   * 1. Escapeキー2回送信（0.2秒間隔）- コマンドモードから確実に抜ける
   * 2. Tabキー送信 - オートコンプリート等をクリア
   * 3. /clearコマンド送信
   * 4. Enterキー送信
   * これによりユーザー提供のbashスクリプトと同等の動作を実現します。
   */
  async sendClearCommand(paneId: string): Promise<Result<void, Error>> {
    try { // 1. 事前のEscapeキー2回送信（0.2秒間隔）
      this.logger.debug(`Sending preparatory Escape keys to pane ${paneId}`);

      // 1回目のEscape
      const escape1Result = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Escape",
      ]);
      if (!escape1Result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send first Escape key to pane ${paneId}: ${
              getDefaultMessage(escape1Result.error)
            }`,
          ),
        };
      }

      // 0.2秒待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 2回目のEscape
      const escape2Result = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Escape",
      ]);
      if (!escape2Result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send second Escape key to pane ${paneId}: ${
              getDefaultMessage(escape2Result.error)
            }`,
          ),
        };
      }

      this.logger.debug(`Escape keys sent to pane ${paneId}`);

      // 2. Tabキーを送信
      const tabResult = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Tab",
      ]);
      if (!tabResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send Tab key to pane ${paneId}: ${
              getDefaultMessage(tabResult.error)
            }`,
          ),
        };
      }

      // 0.2秒待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 3. /clearコマンドを送信（Enterキーなし）
      const clearCommand = ["tmux", "send-keys", "-t", paneId, "/clear"];
      const clearResult = await this.commandExecutor.execute(clearCommand);

      if (!clearResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send /clear command to pane ${paneId}: ${
              getDefaultMessage(clearResult.error)
            }`,
          ),
        };
      }

      this.logger.debug(`/clear command sent to pane ${paneId}`);

      // 0.2秒待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 4. Enterキーを送信
      const enterResult = await this.sendEnter(paneId);
      if (!enterResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to send Enter after /clear to pane ${paneId}: ${enterResult.error.message}`,
          ),
        };
      }

      this.logger.info(
        `Complete clear command sequence executed for pane ${paneId}`,
      );
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unexpected error sending clear command sequence to pane ${paneId}: ${error}`,
        ),
      };
    }
  }

  /**
   * Claudeが立ち上がっていない場合、各ペインでcldコマンドを実行
   */
  async startClaudeIfNotRunning(panes: PaneDetail[]): Promise<void> {
    // PaneCommunicatorに委譲
    return await this.communicator.startClaudeIfNotRunning(panes);
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
          // Handle both string and CommandResult types
          const data = typeof result.data === "string"
            ? result.data
            : result.data.kind === "success"
            ? result.data.stdout
            : "";
          return { ok: true, data };
        } else {
          return {
            ok: false,
            error: new Error(getDefaultMessage(result.error)),
          };
        }
      },
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
    const captureDetectionService = this.createCaptureDetectionService(
      commandExecutor,
    );

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
