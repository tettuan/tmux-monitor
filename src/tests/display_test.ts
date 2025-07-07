import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PaneDisplayer } from "../display.ts";
import { PaneDetail } from "../models.ts";

// Mock Logger
class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

// Mock PaneDetail factory
function createMockPaneDetail(
  id: string,
  active: boolean,
  title: string,
  command: string,
): PaneDetail {
  const result = PaneDetail.create(
    "test-session",
    "0",
    "main",
    id,
    "0",
    "/dev/ttys000",
    "1234",
    command,
    "/Users/test",
    title,
    active ? "1" : "0",
    "0",
    "80",
    "24",
    "bash",
  );
  if (result.ok) {
    return result.data;
  }
  throw new Error("Failed to create mock pane detail");
}

Deno.test("PaneDisplayer - create", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  assertExists(displayer);
});

Deno.test("PaneDisplayer - displayPaneList 正常系", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const panes = [
    createMockPaneDetail("%1", true, "main", "bash"),
    createMockPaneDetail("%2", false, "editor", "vim"),
  ];

  // エラーなく実行できることを確認
  displayer.displayPaneList(panes);
});

Deno.test("PaneDisplayer - displayPaneList 空のリスト", () => {
  const displayer = PaneDisplayer.create(new MockLogger());

  // エラーなく実行できることを確認
  displayer.displayPaneList([]);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes 正常系", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const mainPanes = [createMockPaneDetail("%1", true, "main", "bash")];
  const targetPanes = [createMockPaneDetail("%2", false, "editor", "vim")];

  // エラーなく実行できることを確認
  displayer.displayMainAndTargetPanes(mainPanes, targetPanes);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes 空のリスト", () => {
  const displayer = PaneDisplayer.create(new MockLogger());

  // エラーなく実行できることを確認
  displayer.displayMainAndTargetPanes([], []);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes メインペインのみ", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const mainPanes = [createMockPaneDetail("%1", true, "main", "bash")];

  // エラーなく実行できることを確認
  displayer.displayMainAndTargetPanes(mainPanes, []);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes ターゲットペインのみ", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const targetPanes = [createMockPaneDetail("%2", false, "editor", "vim")];

  // エラーなく実行できることを確認
  displayer.displayMainAndTargetPanes([], targetPanes);
});
