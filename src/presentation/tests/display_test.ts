import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PaneDisplayer } from "../display.ts";
import { PaneDetail } from "../../core/models.ts";
import { MockLogger } from "../../core/test-utils.ts";

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

Deno.test("PaneDisplayer - displayPaneList normal case", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const panes = [
    createMockPaneDetail("%1", true, "main", "bash"),
    createMockPaneDetail("%2", false, "editor", "vim"),
  ];

  // Verify it can execute without error
  displayer.displayPaneList(panes);
});

Deno.test("PaneDisplayer - displayPaneList empty list", () => {
  const displayer = PaneDisplayer.create(new MockLogger());

  // Verify it can execute without error
  displayer.displayPaneList([]);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes normal case", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const mainPanes = [createMockPaneDetail("%1", true, "main", "bash")];
  const targetPanes = [createMockPaneDetail("%2", false, "editor", "vim")];

  // Verify it can execute without error
  displayer.displayMainAndTargetPanes(mainPanes, targetPanes);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes empty list", () => {
  const displayer = PaneDisplayer.create(new MockLogger());

  // Verify it can execute without error
  displayer.displayMainAndTargetPanes([], []);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes main panes only", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const mainPanes = [createMockPaneDetail("%1", true, "main", "bash")];

  // Verify it can execute without error
  displayer.displayMainAndTargetPanes(mainPanes, []);
});

Deno.test("PaneDisplayer - displayMainAndTargetPanes target panes only", () => {
  const displayer = PaneDisplayer.create(new MockLogger());
  const targetPanes = [createMockPaneDetail("%2", false, "editor", "vim")];

  // Verify it can execute without error
  displayer.displayMainAndTargetPanes([], targetPanes);
});
