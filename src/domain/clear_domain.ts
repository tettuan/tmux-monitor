import { createError, type Result, type ValidationError } from "../types.ts";

// =============================================================================
// Clear Domain Models - Following Totality Principles
// =============================================================================

/**
 * Clear state discriminated union representing all possible clear states.
 *
 * Uses discriminated union pattern for type safety and exhaustive pattern matching.
 * Each state variant contains relevant contextual information specific to that state.
 *
 * @example
 * ```typescript
 * const state: ClearState = { kind: "Cleared", verifiedAt: new Date() };
 * ```
 */
export type ClearState =
  | { kind: "NotCleared" }
  | { kind: "Cleared"; verifiedAt: Date }
  | { kind: "ClearFailed"; reason: string; retryCount: number }
  | { kind: "ClearInProgress"; startedAt: Date };

/**
 * Clear strategy discriminated union representing different clearing approaches.
 *
 * Provides type-safe representation of clearing strategies with their specific
 * requirements and parameters.
 *
 * @example
 * ```typescript
 * const strategy: ClearStrategy = { kind: "RecoverySequence", steps: [...] };
 * ```
 */
export type ClearStrategy =
  | { kind: "DirectClear" }
  | { kind: "RecoverySequence"; steps: ClearRecoveryStep[] };

/**
 * Clear recovery step discriminated union for failed clear operations.
 *
 * Defines individual steps in the recovery sequence when direct clear fails.
 * Each step has specific timing and behavior requirements.
 */
export type ClearRecoveryStep =
  | { kind: "SendEscape"; waitMs: number }
  | { kind: "SendEnter"; waitMs: number }
  | { kind: "SendClear" };

/**
 * Clear verification result representing the outcome of clear verification.
 *
 * Contains information about whether the pane is properly cleared according
 * to the expected pattern: "> /clear ⎿ (no content)"
 */
export type ClearVerificationResult =
  | { kind: "ProperlyCleared"; content: string }
  | { kind: "NotCleared"; content: string; reason: string }
  | { kind: "PartiallyCleared"; content: string; reason: string };

/**
 * Clear command value object with validation and smart constructor.
 *
 * Represents the clear command that should be sent to panes, with validation
 * to ensure it matches the expected format.
 */
export class ClearCommand {
  private constructor(readonly command: string) {}

  static create(
    command?: string,
  ): Result<ClearCommand, ValidationError & { message: string }> {
    const defaultCommand = "/clear";
    const finalCommand = command || defaultCommand;

    // Validate command format
    if (!finalCommand.startsWith("/")) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: finalCommand,
          expected: "Command must start with '/'",
        }),
      };
    }

    if (finalCommand.trim() !== finalCommand) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidFormat",
          input: finalCommand,
          expected: "Command must not have leading/trailing whitespace",
        }),
      };
    }

    return { ok: true, data: new ClearCommand(finalCommand) };
  }

  getCommand(): string {
    return this.command;
  }
}

/**
 * Clear pattern matcher for verifying correct clear state.
 *
 * Implements the business rule for what constitutes a properly cleared pane:
 * "> /clear ⎿ (no content)" pattern with normalization for comparison.
 */
export class ClearPatternMatcher {
  private static readonly EXPECTED_PATTERN =
    />\s*\/clear\s*⎿\s*\(no content\)/i;
  private static readonly CLEAR_COMMAND_PATTERN = /\/clear/i;

  static verifyClearState(content: string): ClearVerificationResult {
    if (!content || typeof content !== "string") {
      return {
        kind: "NotCleared",
        content: content || "",
        reason: "Empty or invalid content",
      };
    }

    // Normalize content by removing excessive whitespace and newlines
    const normalizedContent = content.trim().replace(/\s+/g, " ");

    // Check for proper clear pattern
    if (this.EXPECTED_PATTERN.test(normalizedContent)) {
      return {
        kind: "ProperlyCleared",
        content: normalizedContent,
      };
    }

    // Check for partial clear (clear command present but not complete)
    if (this.CLEAR_COMMAND_PATTERN.test(normalizedContent)) {
      return {
        kind: "PartiallyCleared",
        content: normalizedContent,
        reason: "Clear command found but pattern incomplete",
      };
    }

    return {
      kind: "NotCleared",
      content: normalizedContent,
      reason: "No clear command pattern found",
    };
  }

  static createRecoveryStrategy(
    retryCount: number,
  ): Result<ClearStrategy, ValidationError & { message: string }> {
    if (retryCount < 0) {
      return {
        ok: false,
        error: createError({
          kind: "ValidationFailed",
          input: retryCount.toString(),
          constraint: "retryCount must be >= 0",
        }),
      };
    }

    // For first retry, try direct clear
    if (retryCount === 0) {
      return { ok: true, data: { kind: "DirectClear" } };
    }

    // For subsequent retries, use recovery sequence
    const recoverySteps: ClearRecoveryStep[] = [
      { kind: "SendEscape", waitMs: 1000 },
      { kind: "SendEnter", waitMs: 1000 },
      { kind: "SendEscape", waitMs: 2000 },
      { kind: "SendClear" },
    ];

    return {
      ok: true,
      data: { kind: "RecoverySequence", steps: recoverySteps },
    };
  }
}

/**
 * Clear operation result representing the outcome of a clear operation.
 *
 * Contains comprehensive information about the clear operation including
 * success/failure status, verification results, and any error information.
 */
export type ClearOperationResult =
  | {
    kind: "Success";
    paneId: string;
    verificationResult: ClearVerificationResult;
    strategy: ClearStrategy;
    duration: number;
  }
  | {
    kind: "Failed";
    paneId: string;
    error: string;
    strategy: ClearStrategy;
    retryCount: number;
  }
  | {
    kind: "Skipped";
    paneId: string;
    reason: string;
  };

/**
 * Clear domain service interface for pane clearing operations.
 *
 * Defines the contract for clearing panes with proper verification and
 * recovery strategies. This is implemented in the infrastructure layer.
 */
export interface PaneClearService {
  /**
   * Clear a specific pane with the given strategy.
   *
   * @param paneId - The ID of the pane to clear
   * @param strategy - The clearing strategy to use
   * @returns Promise<ClearOperationResult> - The result of the clear operation
   */
  clearPane(
    paneId: string,
    strategy: ClearStrategy,
  ): Promise<ClearOperationResult>;

  /**
   * Verify the clear state of a pane.
   *
   * @param paneId - The ID of the pane to verify
   * @returns Promise<ClearVerificationResult> - The verification result
   */
  verifyClearState(paneId: string): Promise<ClearVerificationResult>;
}
