#!/usr/bin/env deno run --allow-run --allow-net

/**
 * tmux Monitor Tool - CLI Entry Point
 *
 * This is the primary CLI interface for the tmux monitoring tool.
 * Designed for direct execution from JSR with minimal library exports.
 *
 * Features:
 *   - Discovers the most active tmux session automatically
 *   - Separates main pane (active) from target panes (inactive)
 *   - Sends status update instructions to target panes
 *   - Reports pane status to main pane
 *   - Displays comprehensive pane list
 *   - Supports both single-run and continuous monitoring modes
 *   - Scheduled execution with keyboard interrupt capability
 *   - Instruction file option for sending startup commands to main pane
 *   - Automatic termination after 4 hours of continuous operation
 *
 * CLI Usage:
 *   # Direct execution from JSR (recommended)
 *   deno run --allow-all @aidevtool/tmux-monitor
 *
 *   # Global installation
 *   deno install --allow-all -n tmux-monitor @aidevtool/tmux-monitor
 *   tmux-monitor
 *
 *   # Continuous monitoring mode
 *   deno run --allow-all @aidevtool/tmux-monitor --continuous
 *   deno run --allow-all @aidevtool/tmux-monitor -c
 *
 *   # Scheduled execution
 *   deno run --allow-all @aidevtool/tmux-monitor --time=14:30
 *   deno run --allow-all @aidevtool/tmux-monitor -t 14:30
 *
 *   # With instruction file
 *   deno run --allow-all @aidevtool/tmux-monitor --instruction=./file.md
 *   deno run --allow-all @aidevtool/tmux-monitor -i ./file.md
 *
 *   # Kill all tmux panes (safety: SIGTERM first, then SIGKILL)
 *   deno run --allow-all @aidevtool/tmux-monitor --kill-all-panes
 *
 *   # Combined options
 *   deno run --allow-all @aidevtool/tmux-monitor -c --time=14:30 --instruction=./file.md
 *
 * Library Usage:
 *   Import from "@aidevtool/tmux-monitor/lib" for full library functionality.
 *
 * This entry point follows totality principles with exhaustive error handling.
 */

// =============================================================================
// Imports from the src module directory - CLI entry point minimal imports
// =============================================================================

import { Logger } from "./src/services.ts";
import { Application } from "./src/application.ts";

// =============================================================================
// Main Entry Point with Totality-based Design
// =============================================================================

/**
 * Main function following totality principles
 * All possible states are handled explicitly
 * No exceptions are thrown - all errors are handled through Result types
 */
async function main(): Promise<void> {
  // Initialize logger first for error reporting
  const logger = new Logger();

  try {
    logger.info("Starting tmux monitor with totality principles...");
    logger.info("Initializing application with dependency injection...");

    // Create application instance with proper initialization
    const app = new Application();

    // Run the application - all errors are handled internally
    await app.run();

    logger.info("Application completed successfully");
  } catch (error) {
    // This should never happen due to totality principles,
    // but we handle it just in case
    logger.error("Unexpected error occurred:", error);

    // Exit with error code
    Deno.exit(1);
  }
}

// =============================================================================
// Application Entry Point
// =============================================================================

if (import.meta.main) {
  await main();
}

// =============================================================================
// Export for CLI entry point - minimal exports for JSR
// =============================================================================

// Only export essential types for CLI usage
export type { Result, ValidationError } from "./src/types.ts";

export {
  // Core application for CLI
  Application,
} from "./src/application.ts";

export {
  // Essential logger for CLI usage
  Logger,
} from "./src/services.ts";

// Export version information
export { getVersion, getVersionInfo, VERSION } from "./src/version.ts";
