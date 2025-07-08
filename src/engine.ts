import { TIMING } from "./config.ts";
import { Pane, type WorkerStatus } from "./models.ts";
import type { TmuxSession } from "./session.ts";
import type {
  PaneDataProcessor,
  PaneManager,
  PaneStatusManager,
  StatusAnalyzer,
} from "./panes.ts";
import { MessageGenerator, type PaneCommunicator } from "./communication.ts";
import type { PaneDisplayer } from "./display.ts";
import type { CIManager } from "./ci.ts";
import type { KeyboardHandler, RuntimeTracker, TimeManager } from "./types.ts";
import type { Logger } from "./services.ts";
import { globalCancellationToken } from "./cancellation.ts";

/**
 * Monitoring Engine Class - Single Responsibility: Core Monitoring Logic
 */
export class MonitoringEngine {
  private scheduledTime: Date | null = null;
  private instructionFile: string | null = null;

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
    private logger: Logger,
    scheduledTime?: Date | null,
    instructionFile?: string | null,
  ) {
    this.scheduledTime = scheduledTime || null;
    this.instructionFile = instructionFile || null;
  }

  async sendInstructionFileToMainPane(): Promise<void> {
    // this.logger.info(
    //   `[DEBUG] sendInstructionFileToMainPane: instructionFile = ${this.instructionFile}`,
    // );
    if (!this.instructionFile) {
      // this.logger.info(
      //   `[DEBUG] sendInstructionFileToMainPane: No instruction file specified`,
      // );
      return;
    }

    const mainPane = this.paneManager.getMainPane();
    // this.logger.info(
    //   `[DEBUG] sendInstructionFileToMainPane: mainPane = ${
    //     mainPane ? mainPane.id : "null"
    //   }`,
    // );
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
    // console.log(`[DEBUG] sendEnterToAllPanesCycle: Starting`);
    this.logger.info("Starting 30-second ENTER sending cycle to all panes...");

    const targetPanes = this.paneManager.getTargetPanes();
    const mainPane = this.paneManager.getMainPane();

    // Send ENTER to all panes (including main pane)
    const allPanes = mainPane ? [mainPane, ...targetPanes] : targetPanes;

    for (let i = 0; i < allPanes.length; i++) {
      const pane = allPanes[i];

      // console.log(
      //   `[DEBUG] sendEnterToAllPanesCycle: Sending ENTER to pane ${
      //     i + 1
      //   }/${allPanes.length} (${pane.id})`,
      // );
      const result = await this.communicator.sendToPane(pane.id, "");
      if (!result.ok) {
        this.logger.warn(
          `Failed to send Enter to pane ${pane.id}: ${result.error.message}`,
        );
      }
    }

    // console.log(`[DEBUG] sendEnterToAllPanesCycle: Completed successfully`);
    this.logger.info(`ENTER sent to ${allPanes.length} panes`);
  }

  async checkAndClearDoneAndIdlePanes(): Promise<void> {
    this.logger.info(
      "Checking for DONE and IDLE panes and sending clear commands...",
    );

    // Update status tracking for all panes first
    const targetPanes = this.paneManager.getTargetPanes();

    for (const pane of targetPanes) {
      const paneDetailResult = await this.paneDataProcessor.getPaneDetail(
        pane.id,
        this.logger,
      );
      if (paneDetailResult.ok) {
        const currentStatus = this.statusAnalyzer.determineStatus(
          paneDetailResult.data,
        );
        this.statusManager.updateStatus(pane.id, currentStatus);
      }
    }

    // Get all panes with DONE or IDLE status
    const clearTargetPanes = this.statusManager.getDoneAndIdlePanes();

    if (clearTargetPanes.length > 0) {
      this.logger.info(
        `Found ${clearTargetPanes.length} DONE/IDLE panes: ${
          clearTargetPanes.join(", ")
        }`,
      );

      // Sort panes by ID and exclude the 4 smallest IDs
      const sortedPanes = clearTargetPanes.sort((a: string, b: string) =>
        a.localeCompare(b)
      );
      const panesToClear = sortedPanes.slice(4); // Skip first 4 (smallest IDs)

      if (panesToClear.length > 0) {
        this.logger.info(
          `Excluding 4 smallest pane IDs: ${
            sortedPanes.slice(0, 4).join(", ")
          }`,
        );
        this.logger.info(
          `Clearing ${panesToClear.length} panes: ${panesToClear.join(", ")}`,
        );

        // Send clear command to each selected pane
        for (const paneId of panesToClear) {
          const result = await this.communicator.sendToPane(paneId, "clear");
          if (!result.ok) {
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
            `Cleared ${panesToClear.length} DONE/IDLE panes: ${
              panesToClear.join(", ")
            } (excluded 4 smallest IDs)`;
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
          "All DONE/IDLE panes are among the 4 smallest IDs - no clearing performed",
        );
      }
    } else {
      this.logger.info("No DONE/IDLE panes found for clearing");
    }
  }

  async processAllPanes(): Promise<void> {
    this.logger.info("Starting status report instructions to panes...");

    const targetPanes = this.paneManager.getTargetPanes();
    for (const pane of targetPanes) {
      const result = await this.communicator.sendStatusUpdateToPane(pane.id);
      if (!result.ok) {
        this.logger.warn(
          `Failed to send instruction to pane ${pane.id}: ${result.error.message}`,
        );
      }
    }

    this.logger.info("All pane instructions completed");
  }

  async updateStatusTracking(): Promise<void> {
    const targetPanes = this.paneManager.getTargetPanes();

    for (const pane of targetPanes) {
      const paneDetailResult = await this.paneDataProcessor.getPaneDetail(
        pane.id,
        this.logger,
      );
      if (paneDetailResult.ok) {
        const currentStatus = this.statusAnalyzer.extractStatusFromTitle(
          paneDetailResult.data.title,
        );
        this.statusManager.updateStatus(pane.id, currentStatus);
      }
    }
  }

  async reportStatusChanges(): Promise<void> {
    const mainPane = this.paneManager.getMainPane();
    if (!mainPane) {
      this.logger.error("Main pane not found for status reporting");
      return;
    }

    const changedPanes = this.statusManager.getChangedPanes();
    if (changedPanes.length > 0) {
      const statusMessage = `Status changes detected in panes: ${
        changedPanes.join(", ")
      }`;
      const result = await this.communicator.sendToPane(
        mainPane.id,
        statusMessage,
      );
      if (!result.ok) {
        this.logger.warn(
          `Failed to send status change report: ${result.error.message}`,
        );
      }
    }

    // Clear change flags after reporting
    this.statusManager.clearChangeFlags();
  }

  async reportToMainPane(): Promise<void> {
    const mainPane = this.paneManager.getMainPane();
    if (!mainPane) {
      this.logger.error("Main pane not found");
      return;
    }

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

    const message = MessageGenerator.generateStatusMessage(
      activePaneDetails,
      targetPaneDetails,
      formattedStatusResults,
    );
    const result = await this.communicator.sendToPane(mainPane.id, message);
    if (!result.ok) {
      this.logger.warn(`Failed to send main report: ${result.error.message}`);
    }
  }

  async monitor(): Promise<void> {
    // this.logger.info(
    //   `[DEBUG] monitor() started: cancellation state = ${globalCancellationToken.isCancelled()}`,
    // );

    // If scheduled time is set, wait for it first
    if (this.scheduledTime) {
      // this.logger.info(
      //   `[DEBUG] Before waitUntilScheduledTime: cancellation state = ${globalCancellationToken.isCancelled()}`,
      // );
      try {
        const waitResult = await this.timeManager.waitUntilScheduledTime(
          this.scheduledTime,
          this.logger,
          this.keyboardHandler,
        );
        // this.logger.info(
        //   `[DEBUG] After waitUntilScheduledTime: waitResult.ok = ${waitResult.ok}, cancellation state = ${globalCancellationToken.isCancelled()}`,
        // );
        if (!waitResult.ok) {
          // this.logger.info(
          //   `[DEBUG] waitResult failed with error: ${waitResult.error.message}`,
          // );
          this.logger.info("Monitoring cancelled by user input. Exiting...");
          return;
        }
      } catch (_error) {
        // this.logger.error(
        //   `[DEBUG] waitUntilScheduledTime threw exception: ${_error}`,
        // );
        return;
      }
      this.scheduledTime = null; // Clear after first use
    }

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
      this.logger.info(
        `[DEBUG] Before cancellation check: cancellation state = ${globalCancellationToken.isCancelled()}, reason = ${globalCancellationToken.getReason()}`,
      );
      if (globalCancellationToken.isCancelled()) {
        this.logger.info("Monitoring cancelled by user input. Exiting...");
        return;
      }

      // 2. Send instruction file to main pane (only once)
      // this.logger.info(
      //   `[DEBUG] Checking instruction file: instructionFile = ${this.instructionFile}`,
      // );
      if (this.instructionFile) {
        // this.logger.info(`[DEBUG] About to send instruction file to main pane`);
        // const mainPaneBeforeSend = this.paneManager.getMainPane();
        // this.logger.info(
        //   `[DEBUG] Main pane before send: ${
        //     mainPaneBeforeSend ? mainPaneBeforeSend.id : "null"
        //   }`,
        // );
        await this.sendInstructionFileToMainPane();
        this.instructionFile = null;
        // this.logger.info(`[DEBUG] Instruction file sent and cleared`);
      } else {
        // this.logger.info(`[DEBUG] No instruction file to send`);
      }

      // 3. Process all panes
      await this.processAllPanes();

      // 4. Update status tracking and report changes
      await this.updateStatusTracking();

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

      // 6. Send additional Enter to all panes
      await this.sendAdditionalEnterToAllPanes();

      // 7. Report status changes and general report to main pane
      await this.reportStatusChanges();
      await this.reportToMainPane();

      // 8. Start 30-second ENTER sending cycle during waiting period
      const monitoringCycles = TIMING.MONITORING_CYCLE_DELAY /
        TIMING.ENTER_SEND_CYCLE_DELAY;
      this.logger.info(
        `Waiting for 5 minutes with 30-second ENTER cycles (${monitoringCycles} cycles)...`,
      );

      let interrupted = false;
      for (let i = 0; i < monitoringCycles; i++) {
        // console.log(`[DEBUG] Monitoring cycle ${i + 1}/${monitoringCycles}`);

        // Send ENTER to all panes (every 30 seconds)
        // console.log(
        //   `[DEBUG] Starting sendEnterToAllPanesCycle for cycle ${i + 1}`,
        // );
        await this.sendEnterToAllPanesCycle();
        // console.log(
        //   `[DEBUG] Completed sendEnterToAllPanesCycle for cycle ${i + 1}`,
        // );

        // Wait 30 seconds with cancellation check
        // console.log(
        //   `[DEBUG] Starting 30-second sleep with cancellation check for cycle ${
        //     i + 1
        //   }`,
        // );
        interrupted = await this.keyboardHandler.sleepWithCancellation(
          TIMING.ENTER_SEND_CYCLE_DELAY,
        );
        if (interrupted) {
          console.log(
            `[DEBUG] Sleep interrupted by cancellation in cycle ${i + 1}`,
          );
          this.logger.info("Monitoring cancelled by user input. Exiting...");
          break;
        }
        console.log(`[DEBUG] Completed 30-second sleep for cycle ${i + 1}`);
      }

      if (interrupted) {
        return;
      }

      // 9. After 5-minute cycle: Check for DONE/IDLE panes and send clear commands
      await this.checkAndClearDoneAndIdlePanes();

      // 10. Start another 30-second ENTER sending cycle after /clear commands
      this.logger.info(
        "Starting 30-second ENTER cycles after /clear commands...",
      );
      for (let i = 0; i < monitoringCycles; i++) {
        // Send ENTER to all panes (every 30 seconds)
        await this.sendEnterToAllPanesCycle();

        // Wait 30 seconds with cancellation check
        interrupted = await this.keyboardHandler.sleepWithCancellation(
          TIMING.ENTER_SEND_CYCLE_DELAY,
        );
        if (interrupted) {
          this.logger.info("Monitoring cancelled by user input. Exiting...");
          break;
        }
      }

      if (interrupted) {
        return;
      }

      // 11. Execute CI and check for errors
      const ciResult = await this.ciManager.detectCIEnvironment();
      if (ciResult.ok && ciResult.data) {
        await this.sendCIInstructionToMainPane();
        return;
      }

      this.logger.info("No errors detected, exiting monitoring");
    } catch (error) {
      this.logger.error("Monitoring error:", error);
      throw error;
    }
  }

  async startContinuousMonitoring(): Promise<void> {
    // console.log(`[DEBUG] startContinuousMonitoring: Starting continuous mode`);
    this.logger.info(
      "Starting continuous monitoring mode (Press any key to stop, auto-stop after 4 hours)",
    );

    let cycleCount = 0;
    while (true) {
      cycleCount++;
      // console.log(
      //   `[DEBUG] startContinuousMonitoring: Starting cycle ${cycleCount}`,
      // );

      // Check for 4-hour runtime limit
      const limitCheck = this.runtimeTracker.hasExceededLimit();
      if (!limitCheck.ok) {
        // console.log(
        //   `[DEBUG] startContinuousMonitoring: Runtime limit exceeded after ${cycleCount} cycles`,
        // );
        this.logger.info(
          "Automatic termination due to 4-hour runtime limit. Exiting...",
        );
        break;
      }

      // console.log(
      //   `[DEBUG] startContinuousMonitoring: Starting monitor() for cycle ${cycleCount}`,
      // );
      await this.monitor();
      // console.log(
      //   `[DEBUG] startContinuousMonitoring: Completed monitor() for cycle ${cycleCount}`,
      // );

      // After the first execution, scheduled time is cleared, so subsequent cycles use normal 5-minute intervals
      this.logger.info("Waiting for next cycle...\n");

      // Wait for the configured interval with cancellation support
      const cancelled = await this.keyboardHandler.sleepWithCancellation(
        TIMING.MONITORING_CYCLE_DELAY,
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
    // this.logger.info("[DEBUG] oneTimeMonitor() started: One-time execution mode");

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

      // Check for cancellation
      if (globalCancellationToken.isCancelled()) {
        this.logger.info(
          "One-time monitoring cancelled by user input. Exiting...",
        );
        return;
      }

      // 2. Send instruction file to main pane (only once)
      if (this.instructionFile) {
        // this.logger.info(`[DEBUG] About to send instruction file to main pane`);
        await this.sendInstructionFileToMainPane();
        this.instructionFile = null;
        // this.logger.info(`[DEBUG] Instruction file sent and cleared`);
      }

      // 3. Process all panes (send status update instructions)
      await this.processAllPanes();

      // 4. Update status tracking and report changes
      await this.updateStatusTracking();

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
}
