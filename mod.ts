/**
 * @fileoverview tmux Monitor Tool - Library Module
 *
 * This module provides minimal exports for programmatic use.
 * The primary usage is through the CLI interface.
 *
 * @module tmux-monitor
 * @version 1.0.0
 * @author tmux-monitor
 * @license MIT
 */

// Import for convenience functions
import { Application } from "./src/application.ts";

// =============================================================================
// Minimal Library Exports for Programmatic Use
// =============================================================================

/**
 * Creates a new tmux monitor application instance.
 *
 * @returns A new Application instance ready to run
 * @example
 * ```typescript
 * import { createMonitorApp } from "@aidevtool/tmux-monitor/lib";
 * const app = createMonitorApp();
 * await app.run();
 * ```
 */
export function createMonitorApp(): Application {
  return new Application();
}

/**
 * Runs tmux monitoring with default configuration.
 *
 * This is the simplest way to start monitoring tmux sessions.
 *
 * @returns Promise that resolves when monitoring completes
 * @throws {Error} If tmux is not available or monitoring fails
 * @example
 * ```typescript
 * import { runMonitoring } from "@aidevtool/tmux-monitor/lib";
 * await runMonitoring();
 * ```
 */
export async function runMonitoring(): Promise<void> {
  const app = new Application();
  await app.run();
}
