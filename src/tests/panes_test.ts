import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PaneStatusManager, StatusAnalyzer } from "../panes.ts";
import { WorkerStatusParser } from "../models.ts";

// Mock Logger
class MockLogger {
  debug = (msg: string) => console.log(`DEBUG: ${msg}`);
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

// PaneManager tests are removed as the class has been integrated into MonitoringApplicationService

Deno.test("StatusAnalyzer - isNodeCommand normal case", () => {
  const analyzer = new StatusAnalyzer(new MockLogger());

  assertEquals(analyzer.isNodeCommand("node"), true);
  assertEquals(analyzer.isNodeCommand("npm"), true);
  assertEquals(analyzer.isNodeCommand("yarn"), true);
  assertEquals(analyzer.isNodeCommand("deno"), true);
  assertEquals(analyzer.isNodeCommand("bash"), false);
  assertEquals(analyzer.isNodeCommand("vim"), false);
});

Deno.test("StatusAnalyzer - isNodeCommand edge cases", () => {
  const analyzer = new StatusAnalyzer(new MockLogger());

  assertEquals(analyzer.isNodeCommand(""), false);
  assertEquals(analyzer.isNodeCommand("  "), false);
  assertEquals(analyzer.isNodeCommand("NODE"), true); // case insensitive
});

Deno.test("PaneStatusManager - updateStatus new pane", () => {
  const manager = new PaneStatusManager();
  const status = WorkerStatusParser.parse("WORKING");

  const changed = manager.updateStatus("%1", status);
  assertEquals(changed, true);
});

Deno.test("PaneStatusManager - updateStatus status change", () => {
  const manager = new PaneStatusManager();
  const workingStatus = WorkerStatusParser.parse("WORKING");
  const doneStatus = WorkerStatusParser.parse("DONE");

  // Initial status setting
  manager.updateStatus("%1", workingStatus);

  // Status change
  const changed = manager.updateStatus("%1", doneStatus);
  assertEquals(changed, true);
});

Deno.test("PaneStatusManager - updateStatus no change", () => {
  const manager = new PaneStatusManager();
  const status = WorkerStatusParser.parse("WORKING");

  // Initial status setting
  manager.updateStatus("%1", status);

  // Same status setting
  const changed = manager.updateStatus("%1", status);
  assertEquals(changed, false);
});

Deno.test("PaneStatusManager - getChangedPanes", () => {
  const manager = new PaneStatusManager();
  const workingStatus = WorkerStatusParser.parse("WORKING");
  const doneStatus = WorkerStatusParser.parse("DONE");

  // Status setting (new panes)
  manager.updateStatus("%1", workingStatus);
  manager.updateStatus("%2", workingStatus);

  // New panes are not considered as changed
  let changedPanes = manager.getChangedPanes();
  assertEquals(changedPanes.length, 0);

  // Status change
  manager.updateStatus("%1", doneStatus);

  // Now there is one changed pane
  changedPanes = manager.getChangedPanes();
  assertEquals(changedPanes.length, 1);
  assertEquals(changedPanes[0].paneId, "%1");
});

Deno.test("WorkerStatusParser - parse normal case", () => {
  const idleStatus = WorkerStatusParser.parse("IDLE");
  assertEquals(idleStatus.kind, "IDLE");

  const workingStatus = WorkerStatusParser.parse("WORKING");
  assertEquals(workingStatus.kind, "WORKING");

  const unknownStatus = WorkerStatusParser.parse("UNKNOWN_STATUS");
  assertEquals(unknownStatus.kind, "UNKNOWN");
});

Deno.test("WorkerStatusParser - toString", () => {
  const idleStatus = WorkerStatusParser.parse("IDLE");
  assertEquals(WorkerStatusParser.toString(idleStatus), "IDLE");

  const workingStatus = WorkerStatusParser.parse("WORKING");
  assertEquals(WorkerStatusParser.toString(workingStatus), "WORKING");
});

Deno.test("WorkerStatusParser - isEqual", () => {
  const status1 = WorkerStatusParser.parse("WORKING");
  const status2 = WorkerStatusParser.parse("WORKING");
  const status3 = WorkerStatusParser.parse("IDLE");

  assertEquals(WorkerStatusParser.isEqual(status1, status2), true);
  assertEquals(WorkerStatusParser.isEqual(status1, status3), false);
});
