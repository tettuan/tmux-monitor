/**
 * 統一Capture Adapter
 *
 * 点在していたcapture実装を統合し、DDD設計に従った
 * 単一責任のcapture機能を提供する。
 */

import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";

// =============================================================================
// 統一Interface定義
// =============================================================================

/**
 * ペインcapture結果
 */
export interface PaneCaptureResult {
  readonly paneId: string;
  readonly content: string;
  readonly lines: readonly string[];
  readonly timestamp: Date;
  readonly lineCount: number;
}

/**
 * Capture設定オプション
 */
export interface CaptureOptions {
  readonly startLine?: number; // -S オプション（開始行）
  readonly endLine?: number; // -E オプション（終了行）
  readonly joinPanes?: boolean; // -J オプション（ペイン結合）
  readonly escapeSequences?: boolean; // -e オプション（エスケープシーケンス）
}

/**
 * 統一Capture Adapterインターフェース
 */
export interface ICaptureAdapter {
  /**
   * ペインコンテンツのcapture
   */
  capturePane(
    paneId: string,
    options?: CaptureOptions,
  ): Promise<Result<PaneCaptureResult, ValidationError & { message: string }>>;

  /**
   * 複数ペインの一括capture
   */
  capturePanes(
    paneIds: string[],
    options?: CaptureOptions,
  ): Promise<
    Result<
      Map<string, PaneCaptureResult>,
      ValidationError & { message: string }
    >
  >;
}

/**
 * Command Executorインターフェース
 */
export interface ICommandExecutor {
  execute(command: string[]): Promise<Result<string, Error>>;
}

// =============================================================================
// 統一Capture Adapter実装
// =============================================================================

/**
 * TmuxCaptureAdapter
 *
 * 統一されたtmux capture-pane機能を提供。
 * 既存の複数実装を統合し、一貫したインターフェースで
 * capture機能を抽象化。
 *
 * @example
 * ```typescript
 * const adapter = new TmuxCaptureAdapter(commandExecutor);
 * const result = await adapter.capturePane("%1");
 * if (result.ok) {
 *   console.log("Lines:", result.data.lines);
 * }
 * ```
 */
export class TmuxCaptureAdapter implements ICaptureAdapter {
  constructor(
    private readonly commandExecutor: ICommandExecutor,
  ) {}

  /**
   * ペインコンテンツのcapture
   */
  async capturePane(
    paneId: string,
    options: CaptureOptions = {},
  ): Promise<Result<PaneCaptureResult, ValidationError & { message: string }>> {
    // バリデーション
    if (!paneId || paneId.trim() === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }),
      };
    }

    try {
      // tmux capture-paneコマンドの構築
      const command = this.buildCaptureCommand(paneId, options);

      // コマンド実行
      const result = await this.commandExecutor.execute(command);
      if (!result.ok) {
        return {
          ok: false,
          error: createError({
            kind: "CommandFailed",
            command: command.join(" "),
            stderr: result.error.message,
          }),
        };
      }

      // 結果の構造化
      const content = result.data;
      const lines = content.split("\n");
      const captureResult: PaneCaptureResult = {
        paneId: paneId.trim(),
        content,
        lines,
        timestamp: new Date(),
        lineCount: lines.length,
      };

      return { ok: true, data: captureResult };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "capturePane",
          details: `Unexpected error capturing pane ${paneId}: ${error}`,
        }),
      };
    }
  }

  /**
   * 複数ペインの一括capture
   */
  async capturePanes(
    paneIds: string[],
    options: CaptureOptions = {},
  ): Promise<
    Result<
      Map<string, PaneCaptureResult>,
      ValidationError & { message: string }
    >
  > {
    if (!paneIds || paneIds.length === 0) {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }),
      };
    }

    const results = new Map<string, PaneCaptureResult>();
    const errors: string[] = [];

    // 並行実行
    const promises = paneIds.map(async (paneId) => {
      const result = await this.capturePane(paneId, options);
      if (result.ok) {
        results.set(paneId, result.data);
      } else {
        errors.push(`${paneId}: ${result.error.message}`);
      }
    });

    await Promise.all(promises);

    // エラーハンドリング
    if (errors.length > 0) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: paneIds.join(", "),
          constraint: `Failed to capture some panes: ${errors.join("; ")}`,
        }),
      };
    }

    return { ok: true, data: results };
  }

  /**
   * tmux capture-paneコマンドの構築
   */
  private buildCaptureCommand(
    paneId: string,
    options: CaptureOptions,
  ): string[] {
    const command = ["tmux", "capture-pane", "-t", paneId, "-p"];

    // オプションの追加
    if (options.startLine !== undefined) {
      command.push("-S", options.startLine.toString());
    }
    if (options.endLine !== undefined) {
      command.push("-E", options.endLine.toString());
    }
    if (options.joinPanes) {
      command.push("-J");
    }
    if (options.escapeSequences) {
      command.push("-e");
    }

    return command;
  }
}

// =============================================================================
// Mock実装（テスト用）
// =============================================================================

/**
 * MockCaptureAdapter
 *
 * テスト用のMock実装。外部依存なしでcapture機能をテスト可能。
 */
export class MockCaptureAdapter implements ICaptureAdapter {
  private readonly mockData = new Map<string, string>();

  /**
   * Mock データの設定
   */
  setMockData(paneId: string, content: string): void {
    this.mockData.set(paneId, content);
  }

  capturePane(
    paneId: string,
    _options?: CaptureOptions,
  ): Promise<Result<PaneCaptureResult, ValidationError & { message: string }>> {
    if (!paneId || paneId.trim() === "") {
      return Promise.resolve({
        ok: false,
        error: createError({ kind: "EmptyInput" }),
      });
    }

    const content = this.mockData.get(paneId) || "";
    const lines = content.split("\n");

    return Promise.resolve({
      ok: true,
      data: {
        paneId,
        content,
        lines,
        timestamp: new Date(),
        lineCount: lines.length,
      },
    });
  }

  async capturePanes(
    paneIds: string[],
    _options?: CaptureOptions,
  ): Promise<
    Result<
      Map<string, PaneCaptureResult>,
      ValidationError & { message: string }
    >
  > {
    const results = new Map<string, PaneCaptureResult>();

    for (const paneId of paneIds) {
      const result = await this.capturePane(paneId, _options);
      if (result.ok) {
        results.set(paneId, result.data);
      }
    }

    return { ok: true, data: results };
  }
}
