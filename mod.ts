/**
 * @fileoverview tmux Monitor Tool - JSR Export Module
 * 
 * This module provides a comprehensive tmux monitoring solution with totality principles.
 * It can be used as a library or as a standalone application.
 * 
 * @module tmux-monitor
 * @version 1.0.0
 * @author tmux-monitor
 * @license MIT
 */

// =============================================================================
// Core Library Exports
// =============================================================================

export type {
  // Core types
  Result,
  ValidationError,
  
  // Smart constructors and models
  WorkerStatus,
} from "./main.ts";

export {
  // Helper functions
  createError,
  
  // Smart constructors and models
  Pane,
  PaneDetail,
  WorkerStatusParser,
  MonitoringOptions,
  ValidatedTime,
  
  // Services
  CommandExecutor,
  Logger,
  TimeManager,
  KeyboardInterruptHandler,
  RuntimeTracker,
  
  // Business logic
  ArgumentParser,
  PaneDataProcessor,
  StatusAnalyzer,
  PaneManager,
  PaneStatusManager,
  MessageGenerator,
  PaneCommunicator,
  PaneDisplayer,
  CIManager,
  TmuxSession,
  MonitoringEngine,
  DIContainer,
  Application,
  
  // Configuration
  TIMING,
} from "./main.ts";

// Import types for function signatures
import { 
  Application, 
  Logger, 
  CommandExecutor 
} from "./main.ts";

// =============================================================================
// Direct Module Exports for Advanced Usage
// =============================================================================

// Export individual modules for granular control
export * as Types from "./src/types.ts";
export * as Config from "./src/config.ts";
export * as Models from "./src/models.ts";
export * as Services from "./src/services.ts";
export * as Arguments from "./src/arguments.ts";
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
 * Create a new tmux monitor application instance
 * @returns A new Application instance ready to run
 */
export function createMonitorApp(): Application {
  return new Application();
}

/**
 * Run tmux monitoring with default configuration
 * @returns Promise that resolves when monitoring completes
 */
export async function runMonitoring(): Promise<void> {
  const app = new Application();
  await app.run();
}

/**
 * Create a logger instance for external use
 * @returns A new Logger instance
 */
export function createLogger(): Logger {
  return new Logger();
}

/**
 * Create a command executor for external use
 * @returns A new CommandExecutor instance
 */
export function createCommandExecutor(): CommandExecutor {
  return new CommandExecutor();
}
