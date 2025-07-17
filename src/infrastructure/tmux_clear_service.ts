/**
 * tmux Clear Service - Infrastructure Layer
 *
 * DDDアーキテクチャにおけるインフラストラクチャ層の実装。
 * ペインのクリア操作を実際のtmuxコマンドで実行する。
 */

import type {
  ClearOperationResult,
  ClearStrategy,
  ClearVerificationResult,
  PaneClearService,
} from "../domain/clear_domain.ts";
import type {
  IPaneCommunicator,
  ITmuxSessionRepository,
} from "../application/monitoring_service.ts";

/**
 * tmux Clear Service Implementation
 *
 * PaneClearServiceインターフェースの実装。
 * 実際のtmuxコマンドを使用してペインのクリア操作を行う。
 */
export class TmuxClearService implements PaneClearService {
  constructor(
    private readonly tmuxRepository: ITmuxSessionRepository,
    private readonly communicator: IPaneCommunicator,
  ) {}

  /**
   * ペインのクリア実行
   */
  async clearPane(
    paneId: string,
    strategy: ClearStrategy,
  ): Promise<ClearOperationResult> {
    const startTime = Date.now();

    try {
      switch (strategy.kind) {
        case "DirectClear":
          return await this.executeDirectClear(paneId, strategy, startTime);
        case "RecoverySequence":
          return await this.executeRecoverySequence(
            paneId,
            strategy,
            startTime,
          );
        default:
          return {
            kind: "Failed",
            paneId,
            error: "Unknown strategy kind",
            strategy,
            retryCount: 0,
          };
      }
    } catch (error) {
      return {
        kind: "Failed",
        paneId,
        error: `Unexpected error during clear: ${error}`,
        strategy,
        retryCount: 0,
      };
    }
  }

  /**
   * ダイレクトクリア戦略の実行
   */
  private async executeDirectClear(
    paneId: string,
    strategy: ClearStrategy & { kind: "DirectClear" },
    startTime: number,
  ): Promise<ClearOperationResult> {
    let retryCount = 0;
    const maxRetries = 3; // 固定値

    while (retryCount <= maxRetries) {
      try {
        console.log(
          `Attempting to clear pane ${paneId} (attempt ${retryCount + 1}/${
            maxRetries + 1
          })`,
        );

        // 1. クリアコマンドの送信（ユーザー提供のbashスクリプトと同等の手順を試す）
        let sendResult;
        if (retryCount === 0) {
          // 最初は完全なクリアシーケンスを試す:
          // Escape x2 -> Tab -> /clear -> Enter（各ステップ0.2秒間隔）
          sendResult = await this.communicator.sendClearCommand(paneId);
        } else if (retryCount === 1) {
          // 2回目は単一 Escape キー（Claude UI用）
          sendResult = await this.communicator.sendCommand(paneId, "\u001b");
        } else {
          // 3回目以降は段階的Escapeキーでクリア（Claude最適化版）
          console.log(
            `Starting incremental escape key clearing for Claude pane ${paneId}`,
          );

          // 最大3回のEscapeキーを段階的に送信
          for (let escapeCount = 1; escapeCount <= 3; escapeCount++) {
            await this.communicator.sendCommand(paneId, "\u001b");
            await this.delay(500); // 各Escape後に少し待機

            // 各Escape後に検証
            const incrementalVerification = await this.verifyClearState(paneId);

            if (incrementalVerification.kind === "ProperlyCleared") {
              sendResult = {
                ok: true,
                data: `Cleared with ${escapeCount} escape keys`,
              };
              break;
            }
          }

          // 3回試してもクリアできない場合
          if (!sendResult || !sendResult.ok) {
            sendResult = {
              ok: true,
              data: "3 escape keys sent (final attempt)",
            };
          }
        }

        if (!sendResult.ok) {
          if (retryCount < maxRetries) {
            retryCount++;
            const errorMessage = "error" in sendResult
              ? sendResult.error.message
              : "Unknown error";
            console.log(
              `Retry ${retryCount} for pane ${paneId} due to: ${errorMessage}`,
            );
            await this.delay(1000); // 1秒待機してリトライ
            continue;
          }
          const errorMessage = "error" in sendResult
            ? sendResult.error.message
            : "Unknown error";
          return {
            kind: "Failed",
            paneId,
            error: `Failed to send clear command: ${errorMessage}`,
            strategy,
            retryCount,
          };
        }

        // 2. 少し待機してからverification（段階的Escapeの場合はスキップ）
        const isIncrementalEscape = retryCount >= 2 && sendResult.ok &&
          typeof sendResult.data === "string" &&
          sendResult.data.includes("Cleared with");

        if (!isIncrementalEscape) {
          await this.delay(2000);
        }

        // 3. 検証（段階的Escapeで既に成功している場合はスキップ）
        let verificationResult;
        if (isIncrementalEscape) {
          verificationResult = {
            kind: "ProperlyCleared" as const,
            content: "Cleared incrementally with escape keys",
          };
        } else {
          verificationResult = await this.verifyClearState(paneId);
        }
        if (
          verificationResult.kind === "NotCleared" && retryCount < maxRetries
        ) {
          retryCount++;
          console.log(
            `Verification failed for pane ${paneId}, retry ${retryCount}: ${verificationResult.reason}`,
          );
          await this.delay(1000);
          continue;
        }

        return {
          kind: "Success",
          paneId,
          verificationResult,
          strategy,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          await this.delay(1000);
          continue;
        }
        return {
          kind: "Failed",
          paneId,
          error: `Clear execution failed: ${error}`,
          strategy,
          retryCount,
        };
      }
    }

    return {
      kind: "Failed",
      paneId,
      error: "Max retries exceeded",
      strategy,
      retryCount,
    };
  }

  /**
   * 復旧シーケンス戦略の実行
   */
  private async executeRecoverySequence(
    paneId: string,
    strategy: ClearStrategy & { kind: "RecoverySequence" },
    startTime: number,
  ): Promise<ClearOperationResult> {
    try {
      // Claude用の特別なクリアシーケンス
      const steps = [
        { command: "\u001b", description: "Send Escape to cancel any input" },
        { command: "\r", description: "Send Enter to confirm" },
        { command: "clear", description: "Try standard clear command" },
        { command: "\r", description: "Execute clear" },
        { command: "\u000c", description: "Send Ctrl+L (form feed)" },
        { command: "reset", description: "Try reset command" },
        { command: "\r", description: "Execute reset" },
      ];

      for (const step of steps) {
        const sendResult = await this.communicator.sendCommand(
          paneId,
          step.command,
        );
        if (!sendResult.ok) {
          return {
            kind: "Failed",
            paneId,
            error:
              `Failed at step '${step.description}': ${sendResult.error.message}`,
            strategy,
            retryCount: 0,
          };
        }
        await this.delay(500); // 各ステップ間の待機
      }

      // 2. 検証
      await this.delay(2000);
      const verificationResult = await this.verifyClearState(paneId);

      return {
        kind: "Success",
        paneId,
        verificationResult,
        strategy,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        kind: "Failed",
        paneId,
        error: `Recovery sequence failed: ${error}`,
        strategy,
        retryCount: 0,
      };
    }
  }

  /**
   * クリア状態の検証
   */
  async verifyClearState(paneId: string): Promise<ClearVerificationResult> {
    try {
      // tmuxからペインのコンテンツを取得（最新数行）
      const captureResult = await this.tmuxRepository.executeTmuxCommand([
        "tmux",
        "capture-pane",
        "-t",
        paneId,
        "-p",
        "-S",
        "-10", // 最新10行
      ]);

      if (!captureResult.ok) {
        console.log(
          `Failed to capture pane ${paneId}: ${captureResult.error.message}`,
        );
        return {
          kind: "NotCleared",
          content: "",
          reason:
            `Failed to capture pane content: ${captureResult.error.message}`,
        };
      }

      const content = captureResult.data.trim();

      // 複数の/clearコマンドが累積している場合は失敗状態
      const clearCommandCount = (content.match(/\/clear/g) || []).length;

      if (clearCommandCount > 1) {
        return {
          kind: "NotCleared",
          content,
          reason:
            `Multiple /clear commands detected (${clearCommandCount}) - clear functionality not working`,
        };
      }

      // 正常なクリア状態のパターンチェック（3行データでの判定）
      const lines = content.split("\n");
      const recentLines = lines.slice(-3); // 最新3行

      // │>│ パターンの検出（Claude UIでの正常なプロンプト状態）
      const hasPromptPattern = recentLines.some((line) =>
        /│\s*>\s*│/.test(line) || // │ > │ (正常なClaudeプロンプト)
        /│\s*>\s+│/.test(line) || // │ >   │ (少し空白あり)
        (/│/.test(line) && />\s*$/.test(line)) // │ で始まり > で終わる行
      );

      // Claude UI特有のクリーンな状態パターン
      const isClaudeClean = (content.includes("? for shortcuts") ||
        content.includes("Bypassing Permissions")) &&
        content.includes("│ >") &&
        (clearCommandCount <= 1); // 1個以下の/clearコマンド

      // 正常なクリア状態のパターン
      const clearPatterns = [
        /^\s*$/, // 完全に空のコンテンツ
        /⎿\s*$/, // カーソルのみ
        />\s*$/, // プロンプトのみ
      ];

      const isCleared = hasPromptPattern ||
        isClaudeClean ||
        clearPatterns.some((pattern) => pattern.test(content)) ||
        (clearCommandCount === 0 && lines.length <= 3); // コマンドなし、短いコンテンツ

      if (isCleared) {
        return {
          kind: "ProperlyCleared",
          content,
        };
      } else {
        return {
          kind: "NotCleared",
          content,
          reason: "Content does not match clear patterns",
        };
      }
    } catch (error) {
      console.log(`Verification error for pane ${paneId}: ${error}`);
      return {
        kind: "NotCleared",
        content: "",
        reason: `Verification error: ${error}`,
      };
    }
  }

  /**
   * 待機用ヘルパー
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
