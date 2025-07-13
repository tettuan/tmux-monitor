import { createError, type Result, type ValidationError } from "./types.ts";

// =============================================================================
// Domain Models with Totality Principles
// =============================================================================

/**
 * Worker status discriminated union representing all possible pane worker states.
 *
 * Uses discriminated union pattern for type safety and exhaustive pattern matching.
 * Each status variant contains relevant contextual information specific to that state.
 *
 * @example
 * ```typescript
 * const status: WorkerStatus = { kind: "WORKING", details: "Processing data" };
 * ```
 */
// Worker status as discriminated union instead of string literals
export type WorkerStatus =
  | { kind: "IDLE" }
  | { kind: "WORKING"; details?: string }
  | { kind: "BLOCKED"; reason?: string }
  | { kind: "DONE"; result?: string }
  | { kind: "TERMINATED"; reason?: string }
  | { kind: "UNKNOWN"; lastKnownState?: string };

/**
 * Pane state discriminated union representing tmux pane activity states.
 *
 * Provides type-safe representation of whether a pane is active, inactive, or
 * in an unknown state, along with relevant contextual information.
 *
 * @example
 * ```typescript
 * const state: PaneState = { kind: "Active", command: "vim", title: "editor" };
 * ```
 */
// Pane state as discriminated union instead of optional properties
export type PaneState =
  | { kind: "Active"; command: string; title: string }
  | { kind: "Inactive"; command: string; title: string }
  | { kind: "Unknown" };

/**
 * Monitoring mode discriminated union defining how monitoring should operate.
 *
 * Supports various monitoring patterns including single runs, continuous monitoring,
 * and scheduled operations with proper type safety for each mode's requirements.
 *
 * @example
 * ```typescript
 * const mode: MonitoringMode = { kind: "Scheduled", scheduledTime: new Date() };
 * ```
 */
// Monitoring mode as discriminated union instead of nullable properties
export type MonitoringMode =
  | { kind: "SingleRun" }
  | { kind: "Continuous" }
  | { kind: "Scheduled"; scheduledTime: Date }
  | { kind: "ScheduledContinuous"; scheduledTime: Date };

/**
 * Instruction configuration discriminated union for startup instructions.
 *
 * Defines whether monitoring should send startup instructions from a file
 * or operate without additional instructions.
 *
 * @example
 * ```typescript
 * const config: InstructionConfig = { kind: "WithFile", filePath: "./startup.txt" };
 * ```
 */
export type InstructionConfig =
  | { kind: "None" }
  | { kind: "WithFile"; filePath: string };

// =============================================================================
// Smart Constructors
// =============================================================================

/**
 * Pane smart constructor with validation and type-safe creation.
 *
 * Creates validated Pane instances with proper state management and error handling.
 * Uses smart constructor pattern to ensure all panes are created in valid states.
 *
 * @example
 * ```typescript
 * const result = Pane.create("pane1", true, "vim", "Editor");
 * if (result.ok) {
 *   console.log("Created pane:", result.data);
 * }
 * ```
 */
// Pane smart constructor
export class Pane {
  private constructor(
    readonly id: string,
    readonly state: PaneState,
  ) {}

  static create(
    id: string,
    active: boolean,
    command?: string,
    title?: string,
  ): Result<Pane, ValidationError & { message: string }> {
    if (!id || id.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    let state: PaneState;
    if (active) {
      state = {
        kind: "Active",
        command: command || "unknown",
        title: title || "untitled",
      };
    } else if (command !== undefined || title !== undefined) {
      state = {
        kind: "Inactive",
        command: command || "unknown",
        title: title || "untitled",
      };
    } else {
      state = { kind: "Unknown" };
    }

    return { ok: true, data: new Pane(id, state) };
  }

  isActive(): boolean {
    return this.state.kind === "Active";
  }

  getCommand(): string | null {
    switch (this.state.kind) {
      case "Active":
      case "Inactive":
        return this.state.command;
      case "Unknown":
        return null;
    }
  }

  getTitle(): string | null {
    switch (this.state.kind) {
      case "Active":
      case "Inactive":
        return this.state.title;
      case "Unknown":
        return null;
    }
  }
}

/**
 * Detailed pane information value object with comprehensive tmux pane data.
 *
 * Contains all relevant information about a tmux pane including session details,
 * window information, process details, and display properties. Uses smart constructor
 * pattern for validation and safe creation.
 *
 * @example
 * ```typescript
 * const result = PaneDetail.create(
 *   "session1", "0", "main", "%1", "0", "/dev/ttys000",
 *   "1234", "vim", "/home/user", "Editor", "1", "0", "80", "24", "bash"
 * );
 * if (result.ok) {
 *   console.log("Pane detail:", result.data);
 * }
 * ```
 */
// PaneDetail value object
export class PaneDetail {
  private constructor(
    readonly sessionName: string,
    readonly windowIndex: string,
    readonly windowName: string,
    readonly paneId: string,
    readonly paneIndex: string,
    readonly tty: string,
    readonly pid: string,
    readonly currentCommand: string,
    readonly currentPath: string,
    readonly title: string,
    readonly active: string,
    readonly zoomed: string,
    readonly width: string,
    readonly height: string,
    readonly startCommand: string,
  ) {}

  static create(
    sessionName: string,
    windowIndex: string,
    windowName: string,
    paneId: string,
    paneIndex: string,
    tty: string,
    pid: string,
    currentCommand: string,
    currentPath: string,
    title: string,
    active: string,
    zoomed: string,
    width: string,
    height: string,
    startCommand: string,
  ): Result<PaneDetail, ValidationError & { message: string }> {
    // Validate required fields
    const requiredFields = [
      { value: sessionName, name: "sessionName" },
      { value: paneId, name: "paneId" },
      { value: active, name: "active" },
    ];

    for (const field of requiredFields) {
      if (!field.value || field.value.trim() === "") {
        return { ok: false, error: createError({ kind: "EmptyInput" }) };
      }
    }

    return {
      ok: true,
      data: new PaneDetail(
        sessionName,
        windowIndex,
        windowName,
        paneId,
        paneIndex,
        tty,
        pid,
        currentCommand,
        currentPath,
        title,
        active,
        zoomed,
        width,
        height,
        startCommand,
      ),
    };
  }
}

/**
 * Time validation smart constructor for scheduled monitoring operations.
 *
 * Validates and creates time objects from string input with comprehensive
 * validation including format checking and scheduling logic for next occurrence.
 *
 * @example
 * ```typescript
 * const result = ValidatedTime.create("14:30");
 * if (result.ok) {
 *   console.log("Scheduled time:", result.data.getDate());
 * }
 * ```
 */
// Time validation smart constructor
export class ValidatedTime {
  private constructor(readonly value: Date) {}

  static create(
    timeStr: string,
  ): Result<ValidatedTime, ValidationError & { message: string }> {
    if (!timeStr || timeStr.trim() === "") {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      return {
        ok: false,
        error: createError({ kind: "InvalidTimeFormat", input: timeStr }),
      };
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return {
        ok: false,
        error: createError({ kind: "InvalidTimeFormat", input: timeStr }),
      };
    }

    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If the scheduled time is in the past (considering current time), schedule for tomorrow
    if (scheduledTime.getTime() <= now.getTime()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    return { ok: true, data: new ValidatedTime(scheduledTime) };
  }

  getDate(): Date {
    return this.value;
  }
}

/**
 * Monitoring options smart constructor for application configuration.
 *
 * Encapsulates all monitoring configuration options with validation and
 * type-safe creation. Handles various monitoring modes and optional features.
 *
 * @example
 * ```typescript
 * const result = MonitoringOptions.create(
 *   true, null, "./startup.txt", false, true, false
 * );
 * if (result.ok) {
 *   console.log("Options:", result.data);
 * }
 * ```
 */
// MonitoringOptions smart constructor
export class MonitoringOptions {
  private constructor(
    readonly mode: MonitoringMode,
    readonly instruction: InstructionConfig,
    readonly killAllPanes: boolean = false,
    readonly clearPanes: boolean = false,
    readonly startClaude: boolean = false,
  ) {}

  static create(
    continuous: boolean,
    scheduledTime: Date | null,
    instructionFile: string | null,
    killAllPanes: boolean = false,
    clearPanes: boolean = false,
    startClaude: boolean = false,
  ): MonitoringOptions {
    let mode: MonitoringMode;
    if (scheduledTime) {
      mode = continuous
        ? { kind: "ScheduledContinuous", scheduledTime }
        : { kind: "Scheduled", scheduledTime };
    } else {
      mode = continuous ? { kind: "Continuous" } : { kind: "SingleRun" };
    }

    const instruction: InstructionConfig = instructionFile
      ? { kind: "WithFile", filePath: instructionFile }
      : { kind: "None" };

    return new MonitoringOptions(
      mode,
      instruction,
      killAllPanes,
      clearPanes,
      startClaude,
    );
  }

  isContinuous(): boolean {
    return this.mode.kind === "Continuous" ||
      this.mode.kind === "ScheduledContinuous";
  }

  isScheduled(): boolean {
    return this.mode.kind === "Scheduled" ||
      this.mode.kind === "ScheduledContinuous";
  }

  shouldKillAllPanes(): boolean {
    return this.killAllPanes;
  }

  shouldClearPanes(): boolean {
    return this.clearPanes;
  }

  shouldStartClaude(): boolean {
    return this.startClaude;
  }

  getScheduledTime(): Date | null {
    switch (this.mode.kind) {
      case "Scheduled":
      case "ScheduledContinuous":
        return this.mode.scheduledTime;
      case "SingleRun":
      case "Continuous":
        return null;
    }
  }

  getInstructionFile(): string | null {
    switch (this.instruction.kind) {
      case "WithFile":
        return this.instruction.filePath;
      case "None":
        return null;
    }
  }
}

/**
 * Worker status parser utility class for status string conversion and validation.
 *
 * Provides utilities for parsing status strings into typed WorkerStatus objects,
 * converting back to strings, and comparing status values with type safety.
 *
 * @example
 * ```typescript
 * const status = WorkerStatusParser.parse("WORKING");
 * const statusString = WorkerStatusParser.toString(status);
 * const isEqual = WorkerStatusParser.isEqual(status1, status2);
 * ```
 */
// WorkerStatus helper functions
export class WorkerStatusParser {
  static parse(statusString: string): WorkerStatus {
    const trimmed = statusString.trim().toUpperCase();

    switch (trimmed) {
      case "IDLE":
        return { kind: "IDLE" };
      case "WORKING":
        return { kind: "WORKING" };
      case "BLOCKED":
        return { kind: "BLOCKED" };
      case "DONE":
        return { kind: "DONE" };
      case "TERMINATED":
        return { kind: "TERMINATED" };
      default:
        return { kind: "UNKNOWN", lastKnownState: trimmed };
    }
  }

  static toString(status: WorkerStatus): string {
    switch (status.kind) {
      case "IDLE":
        return "IDLE";
      case "WORKING":
        return "WORKING";
      case "BLOCKED":
        return "BLOCKED";
      case "DONE":
        return "DONE";
      case "TERMINATED":
        return "TERMINATED";
      case "UNKNOWN":
        return "UNKNOWN";
    }
  }

  static isEqual(a: WorkerStatus, b: WorkerStatus): boolean {
    return this.toString(a) === this.toString(b);
  }
}
