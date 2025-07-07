import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PaneManager, PaneStatusManager, StatusAnalyzer } from "../panes.ts";
import { Pane, WorkerStatusParser } from "../models.ts";

// Mock Logger
class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

Deno.test("PaneManager - インスタンス作成", () => {
  const manager = new PaneManager(new MockLogger());
  assertExists(manager);
});

Deno.test("PaneManager - separate 正常系", () => {
  const manager = new PaneManager(new MockLogger());

  const activePane = Pane.create("%1", true, "bash", "main");
  const inactivePane = Pane.create("%2", false, "vim", "editor");

  if (activePane.ok && inactivePane.ok) {
    const result = manager.separate([activePane.data, inactivePane.data]);

    assertEquals(result.ok, true);
    assertEquals(manager.getMainPane()?.id, "%1");
    assertEquals(manager.getTargetPanes().length, 1);
    assertEquals(manager.getTargetPanes()[0].id, "%2");
  }
});

Deno.test("PaneManager - separate 空のペイン配列", () => {
  const manager = new PaneManager(new MockLogger());

  const result = manager.separate([]);

  assertEquals(result.ok, false);
});

Deno.test("PaneManager - separate アクティブなペインなし", () => {
  const manager = new PaneManager(new MockLogger());

  const pane1 = Pane.create("%1", false, "bash", "main");
  const pane2 = Pane.create("%2", false, "vim", "editor");

  if (pane1.ok && pane2.ok) {
    const result = manager.separate([pane1.data, pane2.data]);

    assertEquals(result.ok, true);
    assertEquals(manager.getMainPane(), null);
    assertEquals(manager.getTargetPanes().length, 2);
  }
});

Deno.test("StatusAnalyzer - isNodeCommand 正常系", () => {
  const analyzer = new StatusAnalyzer(new MockLogger());

  assertEquals(analyzer.isNodeCommand("node"), true);
  assertEquals(analyzer.isNodeCommand("npm"), true);
  assertEquals(analyzer.isNodeCommand("yarn"), true);
  assertEquals(analyzer.isNodeCommand("deno"), true);
  assertEquals(analyzer.isNodeCommand("bash"), false);
  assertEquals(analyzer.isNodeCommand("vim"), false);
});

Deno.test("StatusAnalyzer - isNodeCommand エッジケース", () => {
  const analyzer = new StatusAnalyzer(new MockLogger());

  assertEquals(analyzer.isNodeCommand(""), false);
  assertEquals(analyzer.isNodeCommand("  "), false);
  assertEquals(analyzer.isNodeCommand("NODE"), true); // 大文字小文字を無視
});

Deno.test("PaneStatusManager - updateStatus 新しいペイン", () => {
  const manager = new PaneStatusManager();
  const status = WorkerStatusParser.parse("WORKING");

  const changed = manager.updateStatus("%1", status);
  assertEquals(changed, true);
});

Deno.test("PaneStatusManager - updateStatus ステータス変更", () => {
  const manager = new PaneStatusManager();
  const workingStatus = WorkerStatusParser.parse("WORKING");
  const doneStatus = WorkerStatusParser.parse("DONE");

  // 最初のステータス設定
  manager.updateStatus("%1", workingStatus);

  // ステータス変更
  const changed = manager.updateStatus("%1", doneStatus);
  assertEquals(changed, true);
});

Deno.test("PaneStatusManager - updateStatus 変更なし", () => {
  const manager = new PaneStatusManager();
  const status = WorkerStatusParser.parse("WORKING");

  // 最初のステータス設定
  manager.updateStatus("%1", status);

  // 同じステータス設定
  const changed = manager.updateStatus("%1", status);
  assertEquals(changed, false);
});

Deno.test("PaneStatusManager - getChangedPanes", () => {
  const manager = new PaneStatusManager();
  const workingStatus = WorkerStatusParser.parse("WORKING");
  const doneStatus = WorkerStatusParser.parse("DONE");

  // ステータス設定（新しいペイン）
  manager.updateStatus("%1", workingStatus);
  manager.updateStatus("%2", workingStatus);

  // 新しいペインは変更されたとは見なされない
  let changedPanes = manager.getChangedPanes();
  assertEquals(changedPanes.length, 0);

  // ステータス変更
  manager.updateStatus("%1", doneStatus);

  // 今度は変更されたペインが1つ
  changedPanes = manager.getChangedPanes();
  assertEquals(changedPanes.length, 1);
  assertEquals(changedPanes[0].paneId, "%1");
});

Deno.test("WorkerStatusParser - parse 正常系", () => {
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
