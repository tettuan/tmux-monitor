/**
 * インフラストラクチャ層アダプター
 *
 * DDDアーキテクチャの最下層として、外部システム（tmux、ファイルシステム等）
 * との具体的な通信を担当。アプリケーション層で定義されたインターフェースを実装。
 *
 * 【統合版】: 統合CaptureDetectionServiceを使用してcapture機能を一元化
 */

import type { Result } from "../types.ts";
import type { createError as _createError } from "../types.ts";
import type {
  IPaneCommunicator,
  IPaneContentMonitor,
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
      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(`tmux command failed: ${result.error.message}`),
        };
      }

      return { ok: true, data: result.data };
    } catch (error) {
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

/**
 * 【統合版】ペインコンテンツ監視の実装
 *
 * 統合CaptureDetectionServiceを使用してcapture機能を一元化。
 * 既存の分散したcaptureロジックから統合サービスベースの実装に移行。
 */
export class PaneContentAdapter implements IPaneContentMonitor {
  private readonly captureDetectionService: CaptureDetectionService;

  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {
    // 統合サービスの初期化
    const commandAdapter = new CommandExecutorAdapter(commandExecutor);
    const captureAdapter = new TmuxCaptureAdapter(commandAdapter);
    const captureHistory = new InMemoryCaptureHistory();
    this.captureDetectionService = new CaptureDetectionService(
      captureAdapter,
      captureHistory,
    );
  }

  /**
   * 【統合版】ペインコンテンツのキャプチャ
   *
   * 統合CaptureDetectionServiceを使用してcapture実行。
   * 古いtmux capture-pane直接実行から統合Adapterに移行。
   */
  async captureContent(paneId: string): Promise<Result<string, Error>> {
    try {
      const detectionResult = await this.captureDetectionService.detectChanges(
        paneId,
      );

      if (!detectionResult.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to capture pane ${paneId}: ${detectionResult.error.message}`,
          ),
        };
      }

      const content = detectionResult.data.captureResult.content;
      return { ok: true, data: content };
    } catch (error) {
      return {
        ok: false,
        error: new Error(`Unexpected error capturing pane ${paneId}: ${error}`),
      };
    }
  }

  /**
   * 【統合版】コンテンツ変化の検出
   *
   * 統合CaptureDetectionServiceのActivityStatusを使用して変化判定。
   * 既存のローカル履歴管理から統合サービスの状態管理に移行。
   */
  hasContentChanged(paneId: string, _currentContent: string): boolean {
    // 統合版では外部から現在コンテンツを受け取る形式は非推奨
    // 代わりにCaptureDetectionServiceで一元的に変化検出すべき
    this.logger.warn(
      `hasContentChanged with external content is deprecated for pane ${paneId}. ` +
        `Use CaptureDetectionService.detectChanges() directly.`,
    );

    // 暫定的な互換性実装
    // 実際の変化検出はCaptureDetectionServiceが担当
    return false;
  }
}

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
      // コマンドを送信してEnterを押す
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
   * ペインコンテンツアダプターの作成
   */
  static createPaneContentAdapter(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): IPaneContentMonitor {
    return new PaneContentAdapter(commandExecutor, logger);
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
   * 全アダプターのセット作成
   */
  static createAllAdapters(
    commandExecutor: CommandExecutor,
    logger: Logger,
  ): {
    tmuxRepository: ITmuxSessionRepository;
    contentMonitor: IPaneContentMonitor;
    communicator: IPaneCommunicator;
  } {
    return {
      tmuxRepository: this.createTmuxSessionAdapter(commandExecutor, logger),
      contentMonitor: this.createPaneContentAdapter(commandExecutor, logger),
      communicator: this.createPaneCommunicationAdapter(
        commandExecutor,
        logger,
      ),
    };
  }
}
