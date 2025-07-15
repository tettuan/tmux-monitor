/**
 * インフラストラクチャ層アダプター
 *
 * DDDアーキテクチャの最下層として、外部システム（tmux、ファイルシステム等）
 * との具体的な通信を担当。アプリケーション層で定義されたインターフェースを実装。
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

      this.logger.info(`Discovered ${panes.length} panes from tmux`);
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

    // デバッグ用：取得したペイン情報を出力
    console.log(`🔧 DEBUG Raw pane data: id=${parts[3]}, cmd="${parts[7]}", title="${parts[9]}", active=${parts[10]}`);

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
// PaneContentAdapter - ペインコンテンツ監視の実装
// =============================================================================

/**
 * ペインコンテンツ監視の実装
 *
 * tmuxのcapture-paneコマンドを使用してコンテンツの変化を検出。
 * 差分検出アルゴリズムも含む。
 */
export class PaneContentAdapter implements IPaneContentMonitor {
  private readonly contentHistory = new Map<string, string>();

  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly logger: Logger,
  ) {}

  /**
   * ペインコンテンツのキャプチャ
   */
  async captureContent(paneId: string): Promise<Result<string, Error>> {
    try {
      // tmux capture-paneコマンドの実行
      const command = ["tmux", "capture-pane", "-t", paneId, "-p"];
      const result = await this.commandExecutor.execute(command);

      if (!result.ok) {
        return {
          ok: false,
          error: new Error(
            `Failed to capture pane ${paneId}: ${result.error.message}`,
          ),
        };
      }

      const content = result.data;

      // 履歴に保存
      this.contentHistory.set(paneId, content);

      return { ok: true, data: content };
    } catch (error) {
      return {
        ok: false,
        error: new Error(`Unexpected error capturing pane ${paneId}: ${error}`),
      };
    }
  }

  /**
   * コンテンツ変化の検出
   */
  hasContentChanged(paneId: string, currentContent: string): boolean {
    const previousContent = this.contentHistory.get(paneId);

    // 初回キャプチャの場合は変化なしとみなす
    if (previousContent === undefined) {
      this.logger.debug(`First capture for pane ${paneId}, no change detected`);
      return false;
    }

    // コンテンツの正規化と比較
    const normalizedPrevious = this.normalizeContent(previousContent);
    const normalizedCurrent = this.normalizeContent(currentContent);

    const hasChanged = normalizedPrevious !== normalizedCurrent;

    if (hasChanged) {
      this.logger.debug(`Content change detected in pane ${paneId}`);
    }

    return hasChanged;
  }

  /**
   * コンテンツの正規化
   *
   * 比較前にホワイトスペースや制御文字を正規化。
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n") // 改行の統一
      .replace(/\s+$/gm, "") // 行末の空白除去
      .trim(); // 前後の空白除去
  }

  /**
   * 履歴のクリア
   */
  clearHistory(paneId?: string): void {
    if (paneId) {
      this.contentHistory.delete(paneId);
    } else {
      this.contentHistory.clear();
    }
  }

  /**
   * 監視対象ペインの数
   */
  getMonitoredPaneCount(): number {
    return this.contentHistory.size;
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
