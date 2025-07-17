import type { MonitoringOptions } from "./models.ts";
import {
  CommandExecutor,
  KeyboardInterruptHandler,
  Logger,
  RuntimeTracker,
  TimeManager,
} from "../infrastructure/services.ts";
import { ArgumentParser } from "../presentation/arguments.ts";
import {
  PaneDataProcessor,
  PaneStatusManager,
  StatusAnalyzer,
} from "../infrastructure/panes.ts";
import {
  MessageGenerator,
  PaneCommunicator,
} from "../infrastructure/communication.ts";
import { PaneDisplayer } from "../presentation/display.ts";
import { CIManager } from "../infrastructure/ci.ts";
import { TmuxSession } from "../infrastructure/session.ts";
import { MonitoringEngine } from "../application/engine.ts";

/**
 * Dependency injection container for managing application dependencies.
 *
 * Implements singleton pattern for centralized dependency management with
 * lazy initialization and factory-based registration for all application services.
 *
 * @example
 * ```typescript
 * const container = DIContainer.getInstance();
 * container.initialize();
 * const logger = container.get<Logger>("logger");
 * const engine = container.createMonitoringEngine(options);
 * ```
 */
export class DIContainer {
  private static instance: DIContainer;
  private dependencies: Map<string, () => unknown> = new Map();

  private constructor() {}

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  register<T>(key: string, factory: () => T): void {
    this.dependencies.set(key, factory);
  }

  get<T>(key: string): T {
    const factory = this.dependencies.get(key);
    if (!factory) {
      throw new Error(`Dependency not found: ${key}`);
    }
    return factory() as T;
  }

  initialize(): void {
    // Core utilities
    this.register("logger", () => new Logger());
    this.register("commandExecutor", () => new CommandExecutor());
    this.register("timeManager", () => new TimeManager());
    this.register("keyboardHandler", () => new KeyboardInterruptHandler());
    this.register("runtimeTracker", () => new RuntimeTracker(14400000));

    // Data processing
    this.register(
      "paneDataProcessor",
      () => new PaneDataProcessor(this.get("commandExecutor")),
    );
    this.register(
      "statusAnalyzer",
      () => new StatusAnalyzer(this.get("logger")),
    );
    this.register("messageGenerator", () => new MessageGenerator());

    // Command line processing
    this.register(
      "argumentParser",
      () =>
        new ArgumentParser(
          this.get("timeManager"),
          this.get("logger"),
          undefined,
          false, // isTestMode = false for production
        ),
    );

    // Business logic
    this.register("session", () =>
      TmuxSession.create(
        this.get("commandExecutor"),
        this.get("logger"),
      ));

    // PaneManager は削除され、MonitoringApplicationService に統合されました
    this.register("statusManager", () => new PaneStatusManager());

    this.register("communicator", () =>
      PaneCommunicator.create(
        this.get("commandExecutor"),
        this.get("logger"),
      ));

    this.register("displayer", () =>
      PaneDisplayer.create(
        this.get("logger"),
      ));

    this.register("ciManager", () =>
      CIManager.create(
        this.get("commandExecutor"),
        this.get("logger"),
      ));

    // Note: PaneTitleManager and PaneContentMonitor removed -
    // functionality integrated into Pane.handleRefreshEvent
  }

  createMonitoringEngine(_options: MonitoringOptions): MonitoringEngine {
    // Use DDD-based monitoring engine (now unified as MonitoringEngine)
    const engine = new MonitoringEngine(
      this.get("commandExecutor"),
      this.get("logger"),
    );

    return engine;
  }
}
