#!/usr/bin/env deno run --allow-run --allow-read

/**
 * @aidevtool/tmux-monitor - CLI Entry Point
 *
 * A comprehensive tmux monitoring tool designed for command-line usage with
 * real-time monitoring and keyboard interrupt handling.
 *
 * ## Features
 * - 🖥️ **Real-time Monitoring**: Live tmux session and pane status updates
 * - ⚡ **Immediate Cancellation**: Any key press or Ctrl+C stops monitoring instantly
 * - 📅 **Scheduled Execution**: Run monitoring at specific times
 * - 🔄 **Continuous Mode**: Long-running monitoring with configurable cycles
 * - 🚀 **CI/CD Integration**: Built-in CI environment detection
 * - 📝 **Instruction Files**: Send startup commands to main pane
 * - 🛠️ **Cross-platform**: Works on macOS, Linux, and Windows (with WSL)
 *
 * ## How It Works
 * 1. **Session Discovery**: Automatically finds the most active tmux session
 * 2. **Pane Classification**: Separates main pane (active) from target panes (inactive)
 * 3. **Status Updates**: Sends status update instructions to target panes
 * 4. **Monitoring**: Reports pane status back to main pane
 * 5. **Display**: Shows comprehensive pane list with real-time updates
 *
 * ## CLI Usage (Recommended - Minimum Permissions)
 *
 * ### Direct Execution from JSR
 * ```bash
 * # Basic continuous monitoring (default - 5-minute cycles for 4 hours)
 * deno run --allow-run jsr:@aidevtool/tmux-monitor
 *
 * # Single run monitoring (one-time discovery and ENTER send then exit)
 * deno run --allow-run jsr:@aidevtool/tmux-monitor --onetime
 *
 * # Scheduled execution (continuous monitoring starts at specified time)
 * deno run --allow-run jsr:@aidevtool/tmux-monitor --time=14:30
 *
 * # With instruction file (requires read permission)
 * deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --instruction=./startup.txt
 * ```
 *
 * ### Global Installation
 * ```bash
 * # Install with specific permissions (recommended)
 * deno install --allow-run --allow-read -n tmux-monitor jsr:@aidevtool/tmux-monitor
 *
 * # Then use anywhere
 * tmux-monitor
 * tmux-monitor --onetime
 * tmux-monitor --time=14:30
 * tmux-monitor --instruction=./startup.txt
 * ```
 *
 * ## CLI Options
 * - `--onetime` or `-o`: One-time monitoring (discovery and single ENTER send then exit)
 * - `--time=HH:MM` or `-t HH:MM`: Schedule monitoring start time
 * - `--instruction=PATH` or `-i PATH`: Load instruction file with startup commands
 * - `--kill-all-panes`: Safely terminate all tmux panes (SIGTERM first, then SIGKILL)
 *
 * ## Default Behavior
 * - **Continuous Monitoring**: Runs 5-minute monitoring cycles for 4 hours (as per requirements.md)
 * - **30-second ENTER cycles**: Keeps panes active during each 5-minute monitoring period
 * - **Automatic DONE/IDLE cleanup**: Clears completed panes to optimize memory usage
 *
 * ## Required Permissions
 * - `--allow-run`: Execute tmux commands (essential)
 * - `--allow-read`: Read instruction files (only when `--instruction` flag is used)
 *
 * ## Library Usage
 * Import from "@aidevtool/tmux-monitor/lib" for full library functionality.
 *
 * This entry point follows totality principles with exhaustive error handling.
 *
 * @module
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
    
    // Force exit for CLI to ensure clean termination
    // This is necessary because some async handlers might keep the process alive
    // logger.info("[DEBUG] Forcing process exit for clean CLI termination");
    Deno.exit(0);
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
