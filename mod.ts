/**
 * @fileoverview tmux Monitor Tool - JSR Export Module
 *
 * A comprehensive tmux monitoring solution with totality principles.
 * Provides real-time monitoring, status tracking, and automated management of tmux sessions.
 *
 * ## Features
 * - Real-time tmux pane monitoring
 * - Automated status reporting
 * - Keyboard interrupt handling
 * - Continuous monitoring mode
 * - Scheduled execution
 * - CI/CD integration
 * - TypeScript support with comprehensive type safety
 *
 * ## Quick Start
 * ```typescript
 * import { runMonitoring, createMonitorApp } from "@aidevtool/tmux-monitor/lib";
 * 
 * // Simple usage
 * await runMonitoring();
 * 
 * // Advanced usage
 * const app = createMonitorApp();
 * await app.run();
 * ```
 *
 * @module tmux-monitor
 * @version 1.0.0
 * @author tmux-monitor
 * @license MIT
 */

// =============================================================================
// Core Library Exports - Library usage optimized
// =============================================================================

export type {
  // Core types
  Result,
  ValidationError,
} from "./src/types.ts";

export type {
  // Smart constructors and models
  WorkerStatus,
} from "./src/models.ts";

export {
  // Business logic
  ArgumentParser,
} from "./src/arguments.ts";

export {
  // Core application
  Application,
} from "./src/application.ts";

export {
  // CI management
  CIManager,
} from "./src/ci.ts";

export {
  // Communication
  MessageGenerator,
  PaneCommunicator,
} from "./src/communication.ts";

export {
  // Configuration
  TIMING,
} from "./src/config.ts";

export {
  // Container
  DIContainer,
} from "./src/container.ts";

export {
  // Display
  PaneDisplayer,
} from "./src/display.ts";

export {
  // Engine
  MonitoringEngine,
} from "./src/engine.ts";

export {
  // Models
  MonitoringOptions,
  Pane,
  PaneDetail,
  ValidatedTime,
  WorkerStatusParser,
} from "./src/models.ts";

export {
  // Panes
  PaneDataProcessor,
  PaneManager,
  PaneStatusManager,
  StatusAnalyzer,
} from "./src/panes.ts";

export {
  // Services
  CommandExecutor,
  KeyboardInterruptHandler,
  Logger,
  RuntimeTracker,
  TimeManager,
} from "./src/services.ts";

export {
  // Session
  TmuxSession,
} from "./src/session.ts";

export {
  // Types helper
  createError,
} from "./src/types.ts";

// Export cancellation token classes
export { CancellationToken, globalCancellationToken } from "./src/cancellation.ts";

// Import classes for convenience functions
import { Application } from "./src/application.ts";
import { CommandExecutor, Logger } from "./src/services.ts";

// =============================================================================
// Direct Module Exports for Advanced Usage
// =============================================================================

// Export individual modules for granular control
export * as Types from "./src/types.ts";
export * as Config from "./src/config.ts";
export * as Models from "./src/models.ts";
export * as Services from "./src/services.ts";
export * as Arguments from "./src/arguments.ts";
export * as Cancellation from "./src/cancellation.ts";
export * as Panes from "./src/panes.ts";
export * as Communication from "./src/communication.ts";
export * as Display from "./src/display.ts";
export * as CI from "./src/ci.ts";
export * as Session from "./src/session.ts";
export * as Engine from "./src/engine.ts";
export * as Container from "./src/container.ts";
export * as ApplicationModule from "./src/application.ts";

// Export version information
export { VERSION } from "./src/version.ts";

// =============================================================================
// Convenience Functions for Library Usage
// =============================================================================

/**
 * Creates a new tmux monitor application instance.
 * 
 * The Application class orchestrates the entire monitoring process,
 * including argument parsing, keyboard handling, and runtime management.
 * 
 * @returns A new Application instance ready to run
 * @example
 * ```typescript
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
 * Uses default settings and automatically handles cleanup.
 * 
 * @returns Promise that resolves when monitoring completes
 * @throws {Error} If tmux is not available or monitoring fails
 * @example
 * ```typescript
 * // Start monitoring with defaults
 * await runMonitoring();
 * ```
 */
export async function runMonitoring(): Promise<void> {
  const app = new Application();
  await app.run();
}

/**
 * Creates a logger instance for external use.
 * 
 * The Logger provides structured logging with different levels
 * (info, warn, error) and consistent formatting.
 * 
 * @returns A new Logger instance
 * @example
 * ```typescript
 * const logger = createLogger();
 * logger.info("Application started");
 * logger.error("An error occurred", error);
 * ```
 */
export function createLogger(): Logger {
  return new Logger();
}

/**
 * Creates a command executor for external use.
 * 
 * The CommandExecutor handles system command execution with
 * proper error handling and result formatting.
 * 
 * @returns A new CommandExecutor instance
 * @example
 * ```typescript
 * const executor = createCommandExecutor();
 * const result = await executor.executeTmuxCommand("tmux list-sessions");
 * if (result.ok) {
 *   console.log(result.data);
 * }
 * ```
 */
export function createCommandExecutor(): CommandExecutor {
  return new CommandExecutor();
}

// =============================================================================
// CLI Entry Point Information
// =============================================================================

/**
 * Information about CLI usage when importing from JSR.
 * 
 * @example
 * ```bash
 * # Run CLI directly from JSR
 * deno run --allow-all @aidevtool/tmux-monitor
 * 
 * # Install globally
 * deno install --allow-all -n tmux-monitor @aidevtool/tmux-monitor
 * 
 * # Run with options
 * deno run --allow-all @aidevtool/tmux-monitor --continuous --time=14:30
 * ```
 */
export const CLI_INFO = {
  entryPoint: "@aidevtool/tmux-monitor",
  installCommand: "deno install --allow-all -n tmux-monitor @aidevtool/tmux-monitor",
  runCommand: "deno run --allow-all @aidevtool/tmux-monitor",
  examples: [
    "deno run --allow-all @aidevtool/tmux-monitor",
    "deno run --allow-all @aidevtool/tmux-monitor --continuous",
    "deno run --allow-all @aidevtool/tmux-monitor --time=14:30",
    "deno run --allow-all @aidevtool/tmux-monitor --instruction=./file.txt",
  ],
} as const;
