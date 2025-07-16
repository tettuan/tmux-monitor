import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MonitoringOptions,
  PaneDetail,
  ValidatedTime,
  type WorkerStatus,
  WorkerStatusParser,
} from "../models.ts";

// =============================================================================
// PaneDetail Tests
// =============================================================================

Deno.test("PaneDetail.create - valid pane detail", () => {
  const result = PaneDetail.create(
    "session1",
    "0",
    "window1",
    "%1",
    "0",
    "/dev/ttys001",
    "12345",
    "bash",
    "/home/user",
    "test-title",
    "1",
    "0",
    "80",
    "24",
    "bash",
  );

  assertEquals(result.ok, true);

  if (result.ok) {
    assertEquals(result.data.sessionName, "session1");
    assertEquals(result.data.windowIndex, "0");
    assertEquals(result.data.windowName, "window1");
    assertEquals(result.data.paneId, "%1");
    assertEquals(result.data.paneIndex, "0");
    assertEquals(result.data.tty, "/dev/ttys001");
    assertEquals(result.data.pid, "12345");
    assertEquals(result.data.currentCommand, "bash");
    assertEquals(result.data.currentPath, "/home/user");
    assertEquals(result.data.title, "test-title");
    assertEquals(result.data.active, "1");
    assertEquals(result.data.zoomed, "0");
    assertEquals(result.data.width, "80");
    assertEquals(result.data.height, "24");
    assertEquals(result.data.startCommand, "bash");
  }
});

Deno.test("PaneDetail.create - empty session name should fail", () => {
  const result = PaneDetail.create(
    "",
    "0",
    "window1",
    "%1",
    "0",
    "/dev/ttys001",
    "12345",
    "bash",
    "/home/user",
    "test-title",
    "1",
    "0",
    "80",
    "24",
    "bash",
  );

  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("PaneDetail.create - empty pane id should fail", () => {
  const result = PaneDetail.create(
    "session1",
    "0",
    "window1",
    "",
    "0",
    "/dev/ttys001",
    "12345",
    "bash",
    "/home/user",
    "test-title",
    "1",
    "0",
    "80",
    "24",
    "bash",
  );

  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("PaneDetail.create - empty active status should fail", () => {
  const result = PaneDetail.create(
    "session1",
    "0",
    "window1",
    "%1",
    "0",
    "/dev/ttys001",
    "12345",
    "bash",
    "/home/user",
    "test-title",
    "",
    "0",
    "80",
    "24",
    "bash",
  );

  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

// =============================================================================
// WorkerStatusParser Tests
// =============================================================================

Deno.test("WorkerStatusParser.parse - IDLE", () => {
  const status = WorkerStatusParser.parse("IDLE");
  assertEquals(status.kind, "IDLE");
});

Deno.test("WorkerStatusParser.parse - WORKING", () => {
  const status = WorkerStatusParser.parse("WORKING");
  assertEquals(status.kind, "WORKING");
});

Deno.test("WorkerStatusParser.parse - BLOCKED", () => {
  const status = WorkerStatusParser.parse("BLOCKED");
  assertEquals(status.kind, "BLOCKED");
});

Deno.test("WorkerStatusParser.parse - DONE", () => {
  const status = WorkerStatusParser.parse("DONE");
  assertEquals(status.kind, "DONE");
});

Deno.test("WorkerStatusParser.parse - TERMINATED", () => {
  const status = WorkerStatusParser.parse("TERMINATED");
  assertEquals(status.kind, "TERMINATED");
});

Deno.test("WorkerStatusParser.parse - lowercase", () => {
  const status = WorkerStatusParser.parse("working");
  assertEquals(status.kind, "WORKING");
});

Deno.test("WorkerStatusParser.parse - with whitespace", () => {
  const status = WorkerStatusParser.parse("  IDLE  ");
  assertEquals(status.kind, "IDLE");
});

Deno.test("WorkerStatusParser.parse - unknown status", () => {
  const status = WorkerStatusParser.parse("UNKNOWN_STATUS");
  assertEquals(status.kind, "UNKNOWN");
  if (status.kind === "UNKNOWN") {
    assertEquals(status.lastKnownState, "UNKNOWN_STATUS");
  }
});

Deno.test("WorkerStatusParser.toString - all statuses", () => {
  assertEquals(WorkerStatusParser.toString({ kind: "IDLE" }), "IDLE");
  assertEquals(WorkerStatusParser.toString({ kind: "WORKING" }), "WORKING");
  assertEquals(WorkerStatusParser.toString({ kind: "BLOCKED" }), "BLOCKED");
  assertEquals(WorkerStatusParser.toString({ kind: "DONE" }), "DONE");
  assertEquals(
    WorkerStatusParser.toString({ kind: "TERMINATED" }),
    "TERMINATED",
  );
  assertEquals(WorkerStatusParser.toString({ kind: "UNKNOWN" }), "UNKNOWN");
});

Deno.test("WorkerStatusParser.isEqual - same statuses", () => {
  const status1: WorkerStatus = { kind: "IDLE" };
  const status2: WorkerStatus = { kind: "IDLE" };
  assertEquals(WorkerStatusParser.isEqual(status1, status2), true);
});

Deno.test("WorkerStatusParser.isEqual - different statuses", () => {
  const status1: WorkerStatus = { kind: "IDLE" };
  const status2: WorkerStatus = { kind: "WORKING" };
  assertEquals(WorkerStatusParser.isEqual(status1, status2), false);
});

// =============================================================================
// ValidatedTime Tests
// =============================================================================

Deno.test("ValidatedTime.create - valid time", () => {
  const result = ValidatedTime.create("14:30");
  assertEquals(result.ok, true);

  if (result.ok) {
    const date = result.data.getDate();
    assertEquals(date.getHours(), 14);
    assertEquals(date.getMinutes(), 30);
  }
});

Deno.test("ValidatedTime.create - single digit hour", () => {
  const result = ValidatedTime.create("9:15");
  assertEquals(result.ok, true);

  if (result.ok) {
    const date = result.data.getDate();
    assertEquals(date.getHours(), 9);
    assertEquals(date.getMinutes(), 15);
  }
});

Deno.test("ValidatedTime.create - midnight", () => {
  const result = ValidatedTime.create("0:00");
  assertEquals(result.ok, true);

  if (result.ok) {
    const date = result.data.getDate();
    assertEquals(date.getHours(), 0);
    assertEquals(date.getMinutes(), 0);
  }
});

Deno.test("ValidatedTime.create - 23:59", () => {
  const result = ValidatedTime.create("23:59");
  assertEquals(result.ok, true);

  if (result.ok) {
    const date = result.data.getDate();
    assertEquals(date.getHours(), 23);
    assertEquals(date.getMinutes(), 59);
  }
});

Deno.test("ValidatedTime.create - empty string", () => {
  const result = ValidatedTime.create("");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("ValidatedTime.create - whitespace", () => {
  const result = ValidatedTime.create("   ");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("ValidatedTime.create - invalid format", () => {
  const result = ValidatedTime.create("invalid");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "InvalidTimeFormat");
  }
});

Deno.test("ValidatedTime.create - invalid hour", () => {
  const result = ValidatedTime.create("25:30");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "InvalidTimeFormat");
  }
});

Deno.test("ValidatedTime.create - invalid minute", () => {
  const result = ValidatedTime.create("12:60");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "InvalidTimeFormat");
  }
});

Deno.test("ValidatedTime.create - negative hour", () => {
  const result = ValidatedTime.create("-1:30");
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.error.kind, "InvalidTimeFormat");
  }
});

// =============================================================================
// MonitoringOptions Tests
// =============================================================================

Deno.test("MonitoringOptions.create - single run", () => {
  const options = MonitoringOptions.create(false, null, null);
  assertEquals(options.mode.kind, "SingleRun");
  assertEquals(options.instruction.kind, "None");
  assertEquals(options.isContinuous(), false);
  assertEquals(options.isScheduled(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), null);
  assertEquals(options.getInstructionFile(), null);
});

Deno.test("MonitoringOptions.create - continuous", () => {
  const options = MonitoringOptions.create(true, null, null);
  assertEquals(options.mode.kind, "Continuous");
  assertEquals(options.instruction.kind, "None");
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), null);
  assertEquals(options.getInstructionFile(), null);
});

Deno.test("MonitoringOptions.create - scheduled", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(false, scheduledTime, null);
  assertEquals(options.mode.kind, "Scheduled");
  assertEquals(options.instruction.kind, "None");
  assertEquals(options.isContinuous(), false);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), null);
});

Deno.test("MonitoringOptions.create - scheduled continuous", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(true, scheduledTime, null);
  assertEquals(options.mode.kind, "ScheduledContinuous");
  assertEquals(options.instruction.kind, "None");
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), null);
});

Deno.test("MonitoringOptions.create - with instruction file", () => {
  const options = MonitoringOptions.create(false, null, "test.md");
  assertEquals(options.mode.kind, "SingleRun");
  assertEquals(options.instruction.kind, "WithFile");
  assertEquals(options.isContinuous(), false);
  assertEquals(options.isScheduled(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), null);
  assertEquals(options.getInstructionFile(), "test.md");
});

Deno.test("MonitoringOptions.create - all options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(true, scheduledTime, "test.md");
  assertEquals(options.mode.kind, "ScheduledContinuous");
  assertEquals(options.instruction.kind, "WithFile");
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "test.md");
});
