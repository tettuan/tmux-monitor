// =============================================================================
// Configuration and Constants
// =============================================================================

/**
 * Configuration interface for timing constants used throughout the application.
 *
 * Defines all timing delays and intervals for tmux monitoring operations,
 * ensuring consistent timing behavior across the application.
 *
 * @interface TimingConfig
 */
export interface TimingConfig {
  readonly INSTRUCTION_DELAY: number;
  readonly ENTER_KEY_DELAY: number;
  readonly PANE_PROCESSING_DELAY: number;
  readonly CLD_COMMAND_DELAY: number;
  readonly ENTER_SEND_CYCLE_DELAY: number;
  readonly MAX_RUNTIME: number;
}

/**
 * Global timing configuration constants for tmux monitoring operations.
 *
 * This configuration object provides all timing delays and intervals used
 * throughout the application for consistent and reliable operation timing.
 *
 * @example
 * ```typescript
 * import { TIMING } from "./config.ts";
 * await sleep(TIMING.INSTRUCTION_DELAY);
 * ```
 */
export const TIMING: TimingConfig = {
  INSTRUCTION_DELAY: 200, // 0.2 seconds - delay after sending instruction
  ENTER_KEY_DELAY: 300, // 0.3 seconds - delay before sending additional Enter
  PANE_PROCESSING_DELAY: 1000, // 1 second - delay after processing each pane
  CLD_COMMAND_DELAY: 200, // 0.2 seconds - delay for cld command
  ENTER_SEND_CYCLE_DELAY: 30000, // 30 seconds - delay between sending ENTER to all panes
  MAX_RUNTIME: 14400000, // 4 hours in milliseconds (4 * 60 * 60 * 1000)
} as const;

/**
 * Pane management configuration constants.
 *
 * Configuration for pane operations including clear command exclusions
 * and other pane management behaviors.
 *
 * @example
 * ```typescript
 * import { PANE_CONFIG } from "./config.ts";
 * const excludeCount = PANE_CONFIG.EXCLUDE_SMALLEST_PANES_COUNT;
 * ```
 */
export const PANE_CONFIG = {
  /** Number of smallest pane IDs to exclude from /clear command operations */
  EXCLUDE_SMALLEST_PANES_COUNT: 4,
} as const;

/**
 * Default instruction file path for task assignment.
 *
 * This constant defines the default instruction file that is referenced
 * in clear-report messages sent to the main pane after clearing operations.
 *
 * @example
 * ```typescript
 * import { DEFAULT_INSTRUCTION_FILE } from "./config.ts";
 * const message = `Follow the instruction: ${DEFAULT_INSTRUCTION_FILE}`;
 * ```
 */
export const DEFAULT_INSTRUCTION_FILE = "instructions/team-head.ja.md";

/**
 * Available worker status types for pane monitoring.
 *
 * Defines all possible status values that can be assigned to worker panes
 * during monitoring operations. Used for type safety and status validation.
 *
 * @example
 * ```typescript
 * import { WORKER_STATUS_TYPES } from "./config.ts";
 * const isValidStatus = WORKER_STATUS_TYPES.includes(status);
 * ```
 */
export const WORKER_STATUS_TYPES = [
  "IDLE",
  "WORKING",
  "BLOCKED",
  "DONE",
  "TERMINATED",
  "UNKNOWN",
] as const;
