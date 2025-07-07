import type { CommandExecutor, Logger } from "./services.ts";
import type { ArgumentParser } from "./arguments.ts";
import type { KeyboardHandler, RuntimeTracker, TimeManager } from "./types.ts";
import { DIContainer } from "./container.ts";
import { globalCancellationToken } from "./cancellation.ts";

/**
 * Main Application Class - Orchestrates the entire tmux monitoring process.
 *
 * This class serves as the entry point for the tmux monitoring application,
 * coordinating all components including argument parsing, keyboard handling,
 * session management, and monitoring execution.
 *
 * ## Responsibilities
 * - Initialize dependency injection container
 * - Parse command-line arguments
 * - Set up keyboard interrupt handling
 * - Coordinate scheduled vs immediate execution
 * - Handle cleanup and graceful shutdown
 *
 * @example
 * ```typescript
 * const app = new Application();
 * await app.run();
 * ```
 */
export class Application {
  private container: DIContainer;

  /**
   * Creates a new Application instance.
   * Initializes the dependency injection container with all required services.
   */
  constructor() {
    this.container = DIContainer.getInstance();
    this.container.initialize();
  }

  /**
   * Runs the tmux monitoring application.
   *
   * This is the main entry point that orchestrates the entire monitoring process:
   * 1. Parses command-line arguments
   * 2. Sets up keyboard interrupt handling
   * 3. Handles scheduled execution if specified
   * 4. Executes monitoring (continuous or single run)
   * 5. Performs cleanup
   *
   * @throws {Error} If critical services fail to initialize
   * @example
   * ```typescript
   * const app = new Application();
   * await app.run();
   * ```
   */
  async run(): Promise<void> {
    const logger = this.container.get<Logger>("logger");
    const argumentParser = this.container.get<ArgumentParser>("argumentParser");
    const keyboardHandler = this.container.get<KeyboardHandler>(
      "keyboardHandler",
    );
    const runtimeTracker = this.container.get<RuntimeTracker>("runtimeTracker");
    const timeManager = this.container.get<TimeManager>("timeManager");

    const optionsResult = argumentParser.parse();
    if (!optionsResult.ok) {
      logger.error(`Failed to parse arguments: ${optionsResult.error.message}`);
      return;
    }

    const options = optionsResult.data;

    // Handle kill-all-panes option early
    if (options.shouldKillAllPanes()) {
      logger.info(
        "Kill all panes option detected - terminating all tmux panes...",
      );
      const commandExecutor = this.container.get<CommandExecutor>(
        "commandExecutor",
      );
      const killResult = await commandExecutor.killAllPanes();

      if (killResult.ok) {
        logger.info(`Pane termination completed: ${killResult.data}`);
      } else {
        logger.error(`Failed to kill panes: ${killResult.error.message}`);
      }

      // Exit early after killing panes
      return;
    }

    // Get scheduled time before logging startup information
    const scheduledTime = options.getScheduledTime();

    // Log startup information
    runtimeTracker.logStartupInfo(logger, timeManager, scheduledTime);

    if (scheduledTime) {
      const timeStr = scheduledTime.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
      });
      logger.info(`Scheduled execution time: ${timeStr} (Asia/Tokyo)`);
    }

    const instructionFile = options.getInstructionFile();
    if (instructionFile) {
      logger.info(`Instruction file specified: ${instructionFile}`);
    }

    // Set up global keyboard interrupt handler
    logger.info("Press any key to stop monitoring at any time...");
    keyboardHandler.setup();

    try {
      const monitor = this.container.createMonitoringEngine(options);

      if (options.isContinuous()) {
        await monitor.startContinuousMonitoring();
      } else {
        await monitor.monitor();
      }
    } finally {
      // Log cancellation state for debugging
      if (globalCancellationToken.isCancelled()) {
        logger.info(
          `Monitoring stopped due to: ${globalCancellationToken.getReason()}`,
        );
      } else {
        logger.info("Monitoring completed normally.");
      }

      // Clean up keyboard interrupt handler
      console.log(`[DEBUG] Application.run(): Starting cleanup`);
      keyboardHandler.cleanup();
      console.log(`[DEBUG] Application.run(): Cleanup completed`);
    }
  }
}
