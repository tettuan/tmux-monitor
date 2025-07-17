// =============================================================================
// Totality-based Type System Foundation
// =============================================================================

/**
 * Generic Result type for explicit error handling without exceptions.
 *
 * Represents operations that can either succeed with data or fail with an error.
 * This enables totality by making all possible outcomes explicit and type-safe.
 *
 * @template T - The type of successful result data
 * @template E - The type of error information
 * @example
 * ```typescript
 * function safeDivide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return { ok: false, error: "Division by zero" };
 *   }
 *   return { ok: true, data: a / b };
 * }
 * ```
 */
// Common Result type for error handling
export type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Commonly used Result type with ValidationError for domain operations.
 *
 * This type alias eliminates ~100 repetitions of "Result<T, ValidationError & { message: string }>"
 * across the codebase while maintaining type safety and totality principles.
 *
 * @template T - The type of successful result data
 * @example
 * ```typescript
 * function validatePaneId(id: string): ValidationResult<PaneId> {
 *   return PaneId.create(id);
 * }
 * ```
 */
export type ValidationResult<T> = Result<
  T,
  ValidationError & { message: string }
>;

/**
 * Interface for keyboard interrupt handling and cancellation management.
 *
 * Provides methods for setting up keyboard interrupt detection,
 * cleanup operations, and sleep operations with cancellation support.
 *
 * @interface KeyboardHandler
 */
// Service interfaces to avoid any type usage
export interface KeyboardHandler {
  setup(): void;
  cleanup(): void;
  sleepWithCancellation(milliseconds: number): Promise<boolean>;
}

/**
 * Interface for runtime tracking and limit enforcement.
 *
 * Manages application runtime tracking, startup logging, and runtime limit
 * enforcement to prevent runaway processes.
 *
 * @interface RuntimeTracker
 */
export interface RuntimeTracker {
  logStartupInfo(
    logger: Logger,
    timeManager: TimeManager,
    scheduledTime?: Date | null,
  ): void;
  hasExceededLimit(): Result<boolean, ValidationError & { message: string }>;
}

/**
 * Interface for time management operations including delays and scheduling.
 *
 * Provides time-related utilities for the monitoring system including
 * current time access, formatting, delays, and scheduled waiting.
 *
 * @interface TimeManager
 */
export interface TimeManager {
  getCurrentTime(): Date;
  formatTime(date: Date): string;
  sleep(milliseconds: number): Promise<void>;
  waitUntilScheduledTime(
    scheduledTime: Date,
    logger: Logger,
    keyboardHandler: KeyboardHandler,
  ): Promise<Result<void, ValidationError & { message: string }>>;
}

/**
 * Interface for structured logging with different severity levels.
 *
 * Provides consistent logging capabilities across the application with
 * support for informational, warning, and error messages.
 *
 * @interface Logger
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Discriminated union type for comprehensive validation error representation.
 *
 * Covers all possible validation and operational errors that can occur
 * throughout the application with specific error contexts and details.
 *
 * @example
 * ```typescript
 * const error: ValidationError = { kind: "InvalidFormat", input: "abc", expected: "number" };
 * const errorWithMessage = createError(error);
 * ```
 */
// Common validation error types
export type ValidationError =
  | { kind: "ParseError"; input: string }
  | { kind: "EmptyInput" }
  | { kind: "InvalidFormat"; input: string; expected: string }
  | { kind: "CommandFailed"; command: string; stderr: string }
  | { kind: "TimeoutError"; operation: string }
  | { kind: "InvalidTimeFormat"; input: string }
  | { kind: "FileNotFound"; path: string }
  | { kind: "InvalidState"; current: string; expected: string }
  | { kind: "CancellationRequested"; operation: string }
  | { kind: "SessionNotFound" }
  | { kind: "PaneNotFound"; paneId: string }
  | { kind: "RuntimeLimitExceeded"; maxRuntime: number }
  // DDD拡張エラー型
  | { kind: "ValidationFailed"; input?: string; constraint?: string }
  | { kind: "BusinessRuleViolation"; rule?: string; context?: string }
  | { kind: "UnexpectedError"; operation?: string; details?: string }
  | { kind: "IllegalState"; currentState?: string; expectedState?: string }
  | { kind: "RepositoryError"; operation?: string; details?: string }
  | { kind: "CommunicationFailed"; target?: string; details?: string }
  | { kind: "CommandExecutionFailed"; command?: string; details?: string }
  | { kind: "MigrationFailed"; from?: string; to?: string; details?: string }
  | { kind: "HelpRequested" }
  | { kind: "UnknownOption"; option: string };

/**
 * Error creation helper function for consistent error message generation.
 *
 * Creates ValidationError objects with consistent message formatting,
 * supporting both custom messages and default message generation.
 *
 * @param error - The base validation error
 * @param customMessage - Optional custom error message
 * @returns ValidationError with message property
 * @example
 * ```typescript
 * const error = createError({ kind: "EmptyInput" });
 * const customError = createError({ kind: "ParseError", input: "abc" }, "Custom message");
 * ```
 */
// Error creation helper
export const createError = (
  error: ValidationError,
  customMessage?: string,
): ValidationError & { message: string } => ({
  ...error,
  message: customMessage || getDefaultMessage(error),
});

/**
 * Default message generator for ValidationError types.
 *
 * Provides consistent, human-readable error messages for all validation
 * error types with appropriate context and details.
 *
 * @param error - The validation error to generate a message for
 * @returns Human-readable error message string
 * @example
 * ```typescript
 * const message = getDefaultMessage({ kind: "EmptyInput" });
 * // Returns: "Input cannot be empty"
 * ```
 */
export const getDefaultMessage = (error: ValidationError): string => {
  switch (error.kind) {
    case "ParseError":
      return `Cannot parse "${error.input}"`;
    case "EmptyInput":
      return "Input cannot be empty";
    case "InvalidFormat":
      return `Invalid format: "${error.input}", expected: ${error.expected}`;
    case "CommandFailed":
      return `Command failed: ${error.command}. Error: ${error.stderr}`;
    case "TimeoutError":
      return `Operation timed out: ${error.operation}`;
    case "InvalidTimeFormat":
      return `Invalid time format: "${error.input}", expected: HH:MM`;
    case "FileNotFound":
      return `File not found: ${error.path}`;
    case "InvalidState":
      return `Invalid state: ${error.current}, expected: ${error.expected}`;
    case "CancellationRequested":
      return `Cancellation requested for operation: ${error.operation}`;
    case "SessionNotFound":
      return "No tmux session found";
    case "PaneNotFound":
      return `Pane not found: ${error.paneId}`;
    case "RuntimeLimitExceeded":
      return `Runtime limit exceeded: ${error.maxRuntime}ms`;
    // DDD拡張エラー型のメッセージ
    case "ValidationFailed":
      return error.input
        ? `Validation failed for "${error.input}": ${
          error.constraint || "constraint violation"
        }`
        : `Validation failed: ${error.constraint || "constraint violation"}`;
    case "BusinessRuleViolation":
      return error.rule
        ? `Business rule violation: ${error.rule}${
          error.context ? ` (${error.context})` : ""
        }`
        : `Business rule violation${error.context ? `: ${error.context}` : ""}`;
    case "UnexpectedError":
      return error.operation
        ? `Unexpected error in ${error.operation}: ${
          error.details || "unknown error"
        }`
        : `Unexpected error: ${error.details || "unknown error"}`;
    case "IllegalState":
      return error.currentState
        ? `Illegal state: ${error.currentState}, expected: ${
          error.expectedState || "valid state"
        }`
        : "Illegal state detected";
    case "RepositoryError":
      return error.operation
        ? `Repository error in ${error.operation}: ${
          error.details || "operation failed"
        }`
        : `Repository error: ${error.details || "operation failed"}`;
    case "CommunicationFailed":
      return error.target
        ? `Communication failed with ${error.target}: ${
          error.details || "connection error"
        }`
        : `Communication failed: ${error.details || "connection error"}`;
    case "CommandExecutionFailed":
      return error.command
        ? `Command execution failed: ${error.command}: ${
          error.details || "execution error"
        }`
        : `Command execution failed: ${error.details || "execution error"}`;
    case "MigrationFailed":
      return error.from
        ? `Migration failed from ${error.from} to ${error.to || "target"}: ${
          error.details || "migration error"
        }`
        : `Migration failed: ${error.details || "migration error"}`;
    case "HelpRequested":
      return "Help information requested";
    case "UnknownOption":
      return `Unknown command line option: ${error.option}`;
  }
};
