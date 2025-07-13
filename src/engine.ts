import { TIMING } from "./config.ts";
import { Pane, type WorkerStatus } from "./models.ts";
import type { TmuxSession } from "./session.ts";
import type {
  PaneDataProcessor,
  PaneManager,
  PaneStatusManager,
  StatusAnalyzer,
} from "./panes.ts";
import type {
  PaneContentMonitor,
  PaneMonitorResult as _PaneMonitorResult,
  PaneTitleManager,
} from "./pane_monitor.ts";
import { MessageGenerator, type PaneCommunicator } from "./communication.ts";
import type { PaneDisplayer } from "./display.ts";
import type { CIManager } from "./ci.ts";
import type { KeyboardHandler, RuntimeTracker, TimeManager } from "./types.ts";
import type { CommandExecutor, Logger } from "./services.ts";
import { globalCancellationToken } from "./cancellation.ts";

/**
 * Core monitoring engine that orchestrates tmux session monitoring operations.
 *
 * The MonitoringEngine coordinates all monitoring activities including session discovery,
 * pane management, communication, status tracking, and display operations. It implements
 * the main monitoring loop and handles all operational modes.
 *
 * @example
 * ```typescript
 * const engine = new MonitoringEngine(
 *   session, paneManager, communicator, displayer, statusManager,
 *   ciManager, timeManager, runtimeTracker, keyboardHandler,
 *   paneDataProcessor, statusAnalyzer, messageGenerator,
 *   commandExecutor, logger, scheduledTime, instructionFile, shouldStartClaude
 * );
 * await engine.run();
 * ```
 */
export class MonitoringEngine {
  private scheduledTime: Date | null = null;
  private instructionFile: string | null = null;
  private shouldStartClaude: boolean = false;
  private paneContentMonitor: PaneContentMonitor;
  private paneTitleManager: PaneTitleManager;
  private originalTitles: Map<string, string> = new Map();
  // Track which panes have been cleared to avoid redundant clear commands
  private clearedPanes: Set<string> = new Set();

  constructor(
    private session: TmuxSession,
    private paneManager: PaneManager,
    private communicator: PaneCommunicator,
    private displayer: PaneDisplayer,
    private statusManager: PaneStatusManager,
    private ciManager: CIManager,
    private timeManager: TimeManager,
    private runtimeTracker: RuntimeTracker,
    private keyboardHandler: KeyboardHandler,
    private paneDataProcessor: PaneDataProcessor,
    private statusAnalyzer: StatusAnalyzer,
    private messageGenerator: MessageGenerator,
    private commandExecutor: CommandExecutor,
    private logger: Logger,
    paneContentMonitor: PaneContentMonitor,
    paneTitleManager: PaneTitleManager,
    scheduledTime?: Date | null,
    instructionFile?: string | null,
    shouldStartClaude?: boolean,
  ) {
    this.scheduledTime = scheduledTime || null;
    this.instructionFile = instructionFile || null;
    this.shouldStartClaude = shouldStartClaude || false;
    this.paneContentMonitor = paneContentMonitor;
    this.paneTitleManager = paneTitleManager;
  }

  async sendInstructionFileToMainPane(): Promise<void> {
    if (!this.instructionFile) {
      return;
    }

    const mainPane = this.paneManager.getMainPane();
    if (!mainPane) {
      this.logger.error("Main pane not found for instruction file");
      return;
    }

    this.logger.info(
      `Sending instruction file to main pane: ${this.instructionFile}`,
    );

    const result = await this.communicator.sendInstructionFile(
      mainPane.id,
      this.instructionFile,
    );
    if (!result.ok) {
      this.logger.error(
        `Failed to send instruction file: ${result.error.message}`,
      );
      return;
    }

    this.logger.info("Instruction file sent to main pane");
  }

  async sendCIInstructionToMainPane(): Promise<void> {
    const mainPane = this.paneManager.getMainPane();
    if (!mainPane) {
      this.logger.error("Main pane not found for CI instruction");
      return;
    }

    const message = "CI environment detected - running single monitoring cycle";
    this.logger.info("Sending CI instruction to main pane");

    const result = await this.communicator.sendToPane(mainPane.id, message);
    if (!result.ok) {
      this.logger.error(
        `Failed to send CI instruction: ${result.error.message}`,
      );
      return;
    }

    await this.timeManager.sleep(TIMING.ENTER_KEY_DELAY);
    this.logger.info("CI instruction sent to main pane");
  }

  async sendAdditionalEnterToAllPanes(): Promise<void> {
    this.logger.info("Sending additional Enter to all panes...");

    const targetPanes = this.paneManager.getTargetPanes();
    for (const pane of targetPanes) {
      await this.timeManager.sleep(TIMING.ENTER_KEY_DELAY);
      const result = await this.communicator.sendToPane(pane.id, "");
      if (!result.ok) {
        this.logger.warn(
          `Failed to send Enter to pane ${pane.id}: ${result.error.message}`,
        );
      }
    }

    this.logger.info("Additional Enter sent to all panes completed");
  }

  async sendEnterToAllPanesCycle(): Promise<void> {
    this.logger.info("Starting 30-second ENTER sending cycle to all panes...");

    const targetPanes = this.paneManager.getTargetPanes();
    const mainPane = this.paneManager.getMainPane();

    // Send ENTER to all panes (including main pane)
    const allPanes = mainPane ? [mainPane, ...targetPanes] : targetPanes;

    for (let i = 0; i < allPanes.length; i++) {
      const pane = allPanes[i];

      const result = await this.communicator.sendToPane(pane.id, "");
      if (!result.ok) {
        this.logger.warn(
          `Failed to send Enter to pane ${pane.id}: ${result.error.message}`,
        );
      }
    }

    this.logger.info(`ENTER sent to ${allPanes.length} panes`);
  }

  async checkAndClearDoneAndIdlePanes(
    newlyIdleOrDonePanes: string[] = [],
  ): Promise<void> {
    if (newlyIdleOrDonePanes.length === 0) {
      this.logger.info("No newly IDLE/DONE panes to clear");
      return;
    }

    this.logger.info(
      `Checking for clearing newly IDLE/DONE panes: ${
        newlyIdleOrDonePanes.join(", ")
      }`,
    );

    // Sort panes by ID and exclude the 4 smallest IDs
    const sortedPanes = newlyIdleOrDonePanes.sort((a: string, b: string) =>
      a.localeCompare(b)
    );

    // Get all current DONE/IDLE panes to determine which are the 4 smallest globally
    const allDoneIdlePanes = this.statusManager.getDoneAndIdlePanes();
    const sortedAllPanes = allDoneIdlePanes.sort((a: string, b: string) =>
      a.localeCompare(b)
    );
    const smallestFourPanes = sortedAllPanes.slice(0, 4);

    // Filter out panes that are among the 4 smallest IDs globally
    const panesToClear = sortedPanes.filter((paneId) =>
      !smallestFourPanes.includes(paneId)
    );

    if (panesToClear.length > 0) {
      this.logger.info(
        `Excluding globally smallest 4 pane IDs: ${
          smallestFourPanes.join(", ")
        }`,
      );
      this.logger.info(
        `Clearing ${panesToClear.length} newly IDLE/DONE panes: ${
          panesToClear.join(", ")
        }`,
      );

      // Send clear command to each selected pane
      for (const paneId of panesToClear) {
        const result = await this.communicator.sendToPane(paneId, "clear");
        if (result.ok) {
          this.logger.info(`/clear command sent to pane ${paneId}`);

          // Wait a moment for the clear command to process
          await this.timeManager.sleep(1000);

          // Verify clear state and perform recovery if needed
          const isProperlyCleared = await this.verifyClearStateAndRecover(
            paneId,
          );

          if (isProperlyCleared) {
            // Mark this pane as cleared to prevent future redundant clears
            this.clearedPanes.add(paneId);
          } else {
            // Wait a moment after recovery and verify again
            await this.timeManager.sleep(2000);
            const isRecoverySuccessful = await this.verifyClearStateAndRecover(
              paneId,
            );
            if (isRecoverySuccessful) {
              this.clearedPanes.add(paneId);
            }
          }
        } else {
          this.logger.warn(
            `Failed to send clear to pane ${paneId}: ${result.error.message}`,
          );
        }
      }

      this.logger.info(`Clear commands sent to ${panesToClear.length} panes`);

      // Report the clearing action to main pane
      const mainPane = this.paneManager.getMainPane();
      if (mainPane) {
        const clearReport =
          `Cleared ${panesToClear.length} newly IDLE/DONE panes: ${
            panesToClear.join(", ")
          } (excluded ${smallestFourPanes.length} smallest IDs globally)`;
        const result = await this.communicator.sendToPane(
          mainPane.id,
          clearReport,
        );
        if (!result.ok) {
          this.logger.warn(
            `Failed to send clear report: ${result.error.message}`,
          );
        }
      }
    } else {
      this.logger.info(
        "All newly IDLE/DONE panes are among the 4 smallest IDs globally - no clearing performed",
      );
    }
  }

  async updateStatusTracking(): Promise<string[]> {
    const targetPanes = this.paneManager.getTargetPanes();
    const newlyIdleOrDonePanes: string[] = [];

    for (const pane of targetPanes) {
      const paneDetailResult = await this.paneDataProcessor.getPaneDetail(
        pane.id,
        this.logger,
      );
      if (paneDetailResult.ok) {
        const currentStatus = this.statusAnalyzer.determineStatus(
          paneDetailResult.data,
        );
        const _previousStatus = this.statusManager.getStatus(pane.id);
        const updated = this.statusManager.updateStatus(pane.id, currentStatus);

        // Track status transitions
        if (updated) {
          // If pane becomes WORKING, remove from clearedPanes so it can be cleared again later
          if (currentStatus.kind === "WORKING") {
            if (this.clearedPanes.has(pane.id)) {
              this.clearedPanes.delete(pane.id);
            }
          } // If pane newly becomes IDLE or DONE and hasn't been cleared yet
          else if (
            (currentStatus.kind === "IDLE" || currentStatus.kind === "DONE") &&
            !this.clearedPanes.has(pane.id)
          ) {
            newlyIdleOrDonePanes.push(pane.id);
          }
        }
      }
    }
    return newlyIdleOrDonePanes;
  }

  async reportToMainPane(): Promise<void> {
    const mainPane = this.paneManager.getMainPane();
    if (!mainPane) {
      this.logger.error("Main pane not found");
      return;
    }

    // Get status changes first
    const changedPanes = this.statusManager.getChangedPanes();

    const targetPanes = this.paneManager.getTargetPanes();
    const activePanes = mainPane ? [mainPane] : [];

    // Get current status for each pane
    const statusResults: Array<{ pane: Pane; status: WorkerStatus }> = [];
    for (const pane of targetPanes) {
      const status = this.statusManager.getStatus(pane.id) ||
        { kind: "UNKNOWN" as const };
      statusResults.push({ pane, status });
    }

    // Convert Pane objects to PaneDetail-like objects for message generation
    const activePaneDetails = activePanes.map((pane) => ({
      paneId: pane.id,
      title: pane.getTitle() || "untitled",
      currentCommand: pane.getCommand() || "unknown",
      sessionName: "",
      windowIndex: "",
      windowName: "",
      paneIndex: "",
      tty: "",
      pid: "",
      currentPath: "",
      active: "1",
      zoomed: "",
      width: "",
      height: "",
      startCommand: "",
    }));

    const targetPaneDetails = targetPanes.map((pane) => ({
      paneId: pane.id,
      title: pane.getTitle() || "untitled",
      currentCommand: pane.getCommand() || "unknown",
      sessionName: "",
      windowIndex: "",
      windowName: "",
      paneIndex: "",
      tty: "",
      pid: "",
      currentPath: "",
      active: "0",
      zoomed: "",
      width: "",
      height: "",
      startCommand: "",
    }));

    // Convert statusResults to the expected format
    const formattedStatusResults = statusResults.map(({ pane, status }) => ({
      pane: {
        paneId: pane.id,
        title: pane.getTitle() || "untitled",
        currentCommand: pane.getCommand() || "unknown",
        sessionName: "",
        windowIndex: "",
        windowName: "",
        paneIndex: "",
        tty: "",
        pid: "",
        currentPath: "",
        active: pane.isActive() ? "1" : "0",
        zoomed: "",
        width: "",
        height: "",
        startCommand: "",
      },
      status: status.kind,
    }));

    // Generate comprehensive status message
    const message = MessageGenerator.generateStatusMessage(
      activePaneDetails,
      targetPaneDetails,
      formattedStatusResults,
    );

    // If there are status changes, prepend change notification
    const finalMessage = changedPanes.length > 0
      ? `Status changes detected in panes: ${
        changedPanes.join(", ")
      }\n\n${message}`
      : message;

    const result = await this.communicator.sendToPane(
      mainPane.id,
      finalMessage,
    );
    if (!result.ok) {
      this.logger.warn(`Failed to send main report: ${result.error.message}`);
    }

    // Clear change flags after reporting
    this.statusManager.clearChangeFlags();
  }

  async monitor(): Promise<void> {
    try {
      this.logger.info("Starting tmux monitoring...");

      // Check for 4-hour runtime limit
      const limitCheck = this.runtimeTracker.hasExceededLimit();
      if (!limitCheck.ok) {
        this.logger.info(
          "Monitoring cancelled due to 4-hour runtime limit. Exiting...",
        );
        return;
      }

      // Check for cancellation before starting
      // 1. Get session and panes
      const sessionResult = await this.session.findMostActiveSession();
      if (!sessionResult.ok) {
        this.logger.error(
          `Failed to find session: ${sessionResult.error.message}`,
        );
        return;
      }

      const panesResult = await this.session.getAllPanes(sessionResult.data);
      if (!panesResult.ok) {
        this.logger.error(`Failed to get panes: ${panesResult.error.message}`);
        return;
      }

      this.paneManager.separate(
        panesResult.data.map((pd) => {
          const paneResult = Pane.create(
            pd.paneId,
            pd.active === "1",
            pd.currentCommand,
            pd.title,
          );
          return paneResult.ok ? paneResult.data : null;
        }).filter((p): p is Pane => p !== null),
      );

      // Check for cancellation
      if (globalCancellationToken.isCancelled()) {
        this.logger.info("Monitoring cancelled by user input. Exiting...");
        return;
      }

      // 2. Send instruction file to main pane (only once)
      if (this.instructionFile) {
        await this.sendInstructionFileToMainPane();
        this.instructionFile = null;
      }

      // 2.5. Check and start Claude if needed (only if --start-claude flag is used)
      if (this.shouldStartClaude) {
        await this.communicator.startClaudeIfNotRunning(panesResult.data);
      }

      // 3. Update status tracking and report changes
      const _newlyIdleOrDonePanes = await this.updateStatusTracking();

      // 5. Display list
      const targetPanes = this.paneManager.getTargetPanes();
      const mainPane = this.paneManager.getMainPane();
      const allPanes = mainPane ? [mainPane, ...targetPanes] : targetPanes;
      this.displayer.displayPaneList(allPanes.map((p) => ({
        paneId: p.id,
        title: p.getTitle() || "untitled",
        currentCommand: p.getCommand() || "unknown",
        sessionName: "",
        windowIndex: "",
        windowName: "",
        paneIndex: "",
        tty: "",
        pid: "",
        currentPath: "",
        active: p.isActive() ? "1" : "0",
        zoomed: "",
        width: "",
        height: "",
        startCommand: "",
      })));

      // Additional status display for DONE/IDLE tracking
      this.logger.info("[INFO] Current pane status tracking:");
      for (const pane of targetPanes) {
        const status = this.statusManager.getStatus(pane.id);
        const statusKind = status ? status.kind : "NO_STATUS";
        this.logger.info(`[INFO]   Pane ${pane.id}: ${statusKind}`);
      }

      // 6. Send additional Enter to all panes
      await this.sendAdditionalEnterToAllPanes();

      // 7. Report to main pane (includes status changes)
      await this.reportToMainPane();

      // 8. Continuous 30-second monitoring cycle
      this.logger.info("Starting continuous 30-second monitoring cycles...");

      let interrupted = false;
      while (!interrupted) {
        // Send ENTER to all panes (every 30 seconds)
        await this.sendEnterToAllPanesCycle();

        // Monitor pane content changes and update titles (every 30 seconds)
        // This also updates status tracking and detects changes
        const newlyIdleOrDonePanes = await this.monitorPaneChanges();

        // Check for newly DONE/IDLE panes and send clear commands only if there are changes
        await this.checkAndClearDoneAndIdlePanes(newlyIdleOrDonePanes);

        // Wait 30 seconds with cancellation check
        interrupted = await this.keyboardHandler.sleepWithCancellation(
          TIMING.ENTER_SEND_CYCLE_DELAY,
        );
        if (interrupted) {
          this.logger.info("Monitoring cancelled by user input. Exiting...");
          break;
        }

        // Check runtime limit
        const limitCheck = this.runtimeTracker.hasExceededLimit();
        if (!limitCheck.ok) {
          this.logger.info(
            "Monitoring stopped due to 4-hour runtime limit. Exiting...",
          );
          break;
        }
      }

      // 11. Execute CI and check for errors
      const ciResult = await this.ciManager.detectCIEnvironment();
      if (ciResult.ok && ciResult.data) {
        await this.sendCIInstructionToMainPane();
        // Restore original titles before exiting
        await this.restoreOriginalTitles();
        return;
      }

      this.logger.info("No errors detected, exiting monitoring");
      // Restore original titles before exiting
      await this.restoreOriginalTitles();
    } catch (error) {
      this.logger.error("Monitoring error:", error);
      // Restore original titles in case of error
      await this.restoreOriginalTitles();
      throw error;
    }
  }

  async startContinuousMonitoring(): Promise<void> {
    this.logger.info(
      "Starting continuous monitoring mode (Press any key to stop, auto-stop after 4 hours)",
    );

    let cycleCount = 0;
    while (true) {
      cycleCount++;

      // Check for 4-hour runtime limit
      const limitCheck = this.runtimeTracker.hasExceededLimit();
      if (!limitCheck.ok) {
        this.logger.info(
          "Automatic termination due to 4-hour runtime limit. Exiting...",
        );
        break;
      }

      await this.monitor();

      // After the first execution, wait for 30 seconds before next cycle
      this.logger.info("Waiting for next cycle...\n");

      // Wait for 30 seconds with cancellation support
      const cancelled = await this.keyboardHandler.sleepWithCancellation(
        TIMING.ENTER_SEND_CYCLE_DELAY,
      );
      if (cancelled) {
        this.logger.info(
          "Continuous monitoring cancelled by user input during wait. Exiting...",
        );
        break;
      }
    }
  }

  /**
   * One-time monitoring execution - minimal run that exits quickly
   * Performs only: pane discovery, status update, one ENTER send, then exits
   */
  async oneTimeMonitor(): Promise<void> {
    try {
      // 1. Get session and panes
      const sessionResult = await this.session.findMostActiveSession();
      if (!sessionResult.ok) {
        this.logger.error(
          `Failed to find session: ${sessionResult.error.message}`,
        );

        // In CI environments or when tmux is not available,
        // still complete the monitoring cycle successfully
        this.logger.info("One-time monitoring completed successfully");
        return;
      }

      const panesResult = await this.session.getAllPanes(sessionResult.data);
      if (!panesResult.ok) {
        this.logger.error(`Failed to get panes: ${panesResult.error.message}`);

        // In CI environments or when tmux is not available,
        // still complete the monitoring cycle successfully
        this.logger.info("One-time monitoring completed successfully");
        return;
      }

      this.paneManager.separate(
        panesResult.data.map((pd) => {
          const paneResult = Pane.create(
            pd.paneId,
            pd.active === "1",
            pd.currentCommand,
            pd.title,
          );
          return paneResult.ok ? paneResult.data : null;
        }).filter((p): p is Pane => p !== null),
      );

      // Check for cancellation
      if (globalCancellationToken.isCancelled()) {
        this.logger.info(
          "One-time monitoring cancelled by user input. Exiting...",
        );
        return;
      }

      // 2. Send instruction file to main pane (only once)
      if (this.instructionFile) {
        await this.sendInstructionFileToMainPane();
        this.instructionFile = null;
      }

      // 2.5. Check and start Claude if needed (only if --start-claude flag is used)
      if (this.shouldStartClaude) {
        await this.communicator.startClaudeIfNotRunning(panesResult.data);
      }

      // 3. Update status tracking and report changes
      const _newlyIdleOrDonePanes = await this.updateStatusTracking();

      // 5. Display pane list
      const targetPanes = this.paneManager.getTargetPanes();
      const mainPane = this.paneManager.getMainPane();
      const allPanes = mainPane ? [mainPane, ...targetPanes] : targetPanes;

      this.displayer.displayPaneList(allPanes.map((p) => ({
        paneId: p.id,
        title: p.getTitle() || "untitled",
        currentCommand: p.getCommand() || "unknown",
        sessionName: "",
        windowIndex: "",
        windowName: "",
        paneIndex: "",
        tty: "",
        pid: "",
        currentPath: "",
        active: p.isActive() ? "1" : "0",
        zoomed: "",
        width: "",
        height: "",
        startCommand: "",
      })));

      // 6. Send one round of ENTER to all panes
      this.logger.info("Sending one-time ENTER to all panes...");
      await this.sendEnterToAllPanesCycle();

      // 7. Report to main pane
      await this.reportToMainPane();

      this.logger.info("One-time monitoring completed successfully");
    } catch (error) {
      this.logger.error("One-time monitoring error:", error);
      throw error;
    }
  }

  /**
   * Clear Node.js panes by sending /clear command followed by Enter
   * This method only targets panes running Node.js processes (where Claude is likely running)
   */
  async clearNodePanes(): Promise<void> {
    this.logger.info("Starting Node.js pane clearing process...");

    try {
      // 1. Get session and panes
      const sessionResult = await this.session.findMostActiveSession();
      if (!sessionResult.ok) {
        this.logger.error(
          `Failed to find session: ${sessionResult.error.message}`,
        );
        return;
      }

      const panesResult = await this.session.getAllPanes(sessionResult.data);
      if (!panesResult.ok) {
        this.logger.error(`Failed to get panes: ${panesResult.error.message}`);
        return;
      }

      this.paneManager.separate(
        panesResult.data.map((pd) => {
          const paneResult = Pane.create(
            pd.paneId,
            pd.active === "1",
            pd.currentCommand,
            pd.title,
          );
          return paneResult.ok ? paneResult.data : null;
        }).filter((p): p is Pane => p !== null),
      );

      const allPanes = this.paneManager.getTargetPanes();
      const mainPane = this.paneManager.getMainPane();

      // Add main pane to the list if it exists
      if (mainPane) {
        allPanes.push(mainPane);
      }

      // 2. Filter for Node.js panes
      const nodePanes: string[] = [];
      for (const pane of allPanes) {
        const command = pane.getCommand() || "";
        if (this.statusAnalyzer.isNodeCommand(command)) {
          nodePanes.push(pane.id);
          this.logger.info(`Found Node.js pane ${pane.id} running: ${command}`);
        } else {
          this.logger.info(
            `Skipping non-Node.js pane ${pane.id} running: ${command}`,
          );
        }
      }

      if (nodePanes.length === 0) {
        this.logger.info("No Node.js panes found - nothing to clear");
        return;
      }

      this.logger.info(
        `Found ${nodePanes.length} Node.js panes to clear: ${
          nodePanes.join(", ")
        }`,
      );

      // 3. Send /clear command to each Node.js pane
      for (const paneId of nodePanes) {
        this.logger.info(`Sending /clear to pane ${paneId}...`);

        // Send /clear command
        const clearResult = await this.communicator.sendToPane(
          paneId,
          "/clear",
        );
        if (!clearResult.ok) {
          this.logger.warn(
            `Failed to send /clear to pane ${paneId}: ${clearResult.error.message}`,
          );
          continue;
        }

        // Send Enter key separately using CommandExecutor
        const enterResult = await this.commandExecutor.execute([
          "tmux",
          "send-keys",
          "-t",
          paneId,
          "Enter",
        ]);
        if (!enterResult.ok) {
          this.logger.warn(
            `Failed to send Enter to pane ${paneId}: ${enterResult.error.message}`,
          );
        } else {
          this.logger.info(
            `Successfully sent /clear + Enter to pane ${paneId}`,
          );
        }
      }

      this.logger.info(
        `Clear operation completed for ${nodePanes.length} Node.js panes`,
      );
    } catch (error) {
      this.logger.error("Error during Node.js pane clearing:", error);
      throw error;
    }
  }

  /**
   * Monitor pane content changes and update titles and status tracking
   * This method implements the 30-second interval monitoring feature
   */
  async monitorPaneChanges(): Promise<string[]> {
    const targetPanes = this.paneManager.getTargetPanes();
    const paneIds = targetPanes.map((p) => p.id);
    const newlyIdleOrDonePanes: string[] = [];

    // Store original titles before modification (only on first run)
    for (const pane of targetPanes) {
      if (!this.originalTitles.has(pane.id)) {
        const paneDetailResult = await this.paneDataProcessor.getPaneDetail(
          pane.id,
          this.logger,
        );
        if (paneDetailResult.ok) {
          // Clean the title to get the base title without status prefixes
          const cleanTitle = this.paneTitleManager.cleanTitle(
            paneDetailResult.data.title || "tmux",
          );
          this.originalTitles.set(pane.id, cleanTitle || "tmux");
        }
      }
    }

    // Monitor panes for content changes
    const monitorResults = await this.paneContentMonitor.monitorPanes(paneIds);

    // Update titles based on monitoring results (without originalTitles to use current cleaned titles)
    await this.paneTitleManager.updatePaneTitles(monitorResults);

    // Update status manager with new statuses and track transitions
    for (const result of monitorResults) {
      const currentStatus = { kind: result.status } as WorkerStatus;
      const updated = this.statusManager.updateStatus(
        result.paneId,
        currentStatus,
      );

      // Track status transitions for clearing logic
      if (updated) {
        // If pane becomes WORKING, remove from clearedPanes so it can be cleared again later
        if (currentStatus.kind === "WORKING") {
          if (this.clearedPanes.has(result.paneId)) {
            this.clearedPanes.delete(result.paneId);
          }
        } // If pane newly becomes IDLE or DONE and hasn't been cleared yet
        else if (
          (currentStatus.kind === "IDLE" || currentStatus.kind === "DONE") &&
          !this.clearedPanes.has(result.paneId)
        ) {
          newlyIdleOrDonePanes.push(result.paneId);
        }
      }
    }

    return newlyIdleOrDonePanes;
  }

  /**
   * Restore original pane titles
   */
  async restoreOriginalTitles(): Promise<void> {
    for (const [paneId, originalTitle] of this.originalTitles.entries()) {
      await this.paneTitleManager.restorePaneTitle(paneId, originalTitle);
    }

    this.originalTitles.clear();
  }

  /**
   * Verify if a pane is properly cleared and perform recovery if needed
   * @param paneId - The pane ID to verify
   * @returns Promise<boolean> - true if properly cleared, false otherwise
   */
  async verifyClearStateAndRecover(paneId: string): Promise<boolean> {
    // Get pane content to verify clear state
    const contentResult = await this.paneDataProcessor.getPaneContent(
      paneId,
      this.logger,
    );
    if (!contentResult.ok) {
      return false;
    }

    // Normalize content and check for proper clear pattern
    const normalizedContent = this.normalizeContentForComparison(
      contentResult.data,
    );
    const expectedPattern = ">/clear⎿(nocontent)";

    if (normalizedContent.includes(expectedPattern)) {
      return true;
    }

    // Check for various failure patterns
    const hasClearCommand = normalizedContent.includes(">/clear");
    const clearOccurrences = normalizedContent.split(">/clear").length - 1;
    const hasMultipleClear = clearOccurrences > 1;
    const hasMissingNoContent = hasClearCommand &&
      !normalizedContent.includes("⎿(nocontent)");

    if (hasMultipleClear || hasMissingNoContent) {
      // Perform recovery sequence
      await this.performClearRecovery(paneId);
      return false;
    }

    return true;
  }

  /**
   * Normalize content for comparison by removing spaces and newlines
   * @param content - Raw content to normalize
   * @returns Normalized content string
   */
  private normalizeContentForComparison(content: string): string {
    return content.replace(/\s+/g, "").toLowerCase();
  }

  /**
   * Perform clear recovery sequence for failed clear operations
   * @param paneId - The pane ID to recover
   */
  async performClearRecovery(paneId: string): Promise<void> {
    this.logger.info(`[RECOVERY] Starting clear recovery for pane ${paneId}`);

    try {
      // 1. Send Escape, wait 1 second
      this.logger.info(`[RECOVERY] Sending Escape to pane ${paneId}`);
      const escapeResult1 = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Escape",
      ]);
      if (!escapeResult1.ok) {
        this.logger.warn(
          `Failed to send first Escape: ${escapeResult1.error.message}`,
        );
      }
      await this.timeManager.sleep(1000);

      // 2. Send Enter, wait 1 second
      this.logger.info(`[RECOVERY] Sending Enter to pane ${paneId}`);
      const enterResult = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Enter",
      ]);
      if (!enterResult.ok) {
        this.logger.warn(`Failed to send Enter: ${enterResult.error.message}`);
      }
      await this.timeManager.sleep(1000);

      // 3. Send Escape, wait 2 seconds
      this.logger.info(`[RECOVERY] Sending second Escape to pane ${paneId}`);
      const escapeResult2 = await this.commandExecutor.execute([
        "tmux",
        "send-keys",
        "-t",
        paneId,
        "Escape",
      ]);
      if (!escapeResult2.ok) {
        this.logger.warn(
          `Failed to send second Escape: ${escapeResult2.error.message}`,
        );
      }
      await this.timeManager.sleep(2000);

      // 4. Send /clear command
      this.logger.info(`[RECOVERY] Sending /clear command to pane ${paneId}`);
      const clearResult = await this.communicator.sendToPane(paneId, "/clear");
      if (!clearResult.ok) {
        this.logger.warn(
          `Failed to send recovery /clear: ${clearResult.error.message}`,
        );
      } else {
        this.logger.info(
          `[RECOVERY] Recovery /clear sent successfully to pane ${paneId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[RECOVERY] Error during clear recovery for pane ${paneId}:`,
        error,
      );
    }
  }
}
