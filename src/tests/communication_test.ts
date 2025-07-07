import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MessageGenerator, PaneCommunicator } from "../communication.ts";
import { PaneDetail } from "../models.ts";

// Mock Logger
class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

// Mock CommandExecutor
class MockCommandExecutor {
  execute = (command: string[]) => {
    if (command.includes("tmux") && command.includes("send-keys")) {
      return Promise.resolve({ ok: true, data: "" });
    }
    return Promise.resolve({ ok: false, error: "Unknown command" });
  };

  executeTmuxCommand = (_command: string) => {
    return Promise.resolve({ ok: true as const, data: "mock output" });
  };

  killAllPanes = () => {
    return Promise.resolve({ ok: true as const, data: "mock kill all panes" });
  };
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

Deno.test("MessageGenerator - generateStatusMessage normal case", () => {
  const activePane = createMockPaneDetail("%1", true, "main", "bash");
  const inactivePane = createMockPaneDetail("%2", false, "editor", "vim");

  const statusResults = [
    { pane: inactivePane, status: "WORKING" },
  ];

  const message = MessageGenerator.generateStatusMessage(
    [activePane],
    [inactivePane],
    statusResults,
  );

  assertEquals(message.includes("Active Panes (1)"), true);
  assertEquals(message.includes("Inactive Panes (1)"), true);
  assertEquals(message.includes("[%1] main - bash"), true);
  assertEquals(message.includes("[%2] editor - vim"), true);
  assertEquals(message.includes("Status: WORKING"), true);
});

Deno.test("MessageGenerator - generateStatusMessage empty panes", () => {
  const message = MessageGenerator.generateStatusMessage([], [], []);

  assertEquals(message.includes("Active Panes (0)"), true);
  assertEquals(message.includes("Inactive Panes (0)"), true);
});

Deno.test("MessageGenerator - generatePaneListMessage normal case", () => {
  const pane1 = createMockPaneDetail("%1", true, "main", "bash");
  const pane2 = createMockPaneDetail("%2", false, "editor", "vim");

  const message = MessageGenerator.generatePaneListMessage([pane1, pane2]);

  assertEquals(message.includes("Complete Pane List"), true);
  assertEquals(message.includes("[%1] main"), true);
  assertEquals(message.includes("[%2] editor"), true);
  assertEquals(message.includes("Command: bash"), true);
  assertEquals(message.includes("Command: vim"), true);
  assertEquals(message.includes("Status: ACTIVE"), true);
  assertEquals(message.includes("Status: INACTIVE"), true);
  assertEquals(message.includes("Size: 80x24"), true);
});

Deno.test("MessageGenerator - generatePaneListMessage empty panes", () => {
  const message = MessageGenerator.generatePaneListMessage([]);

  assertEquals(message.includes("Complete Pane List"), true);
  assertEquals(message.length > 0, true);
});

Deno.test("PaneCommunicator - create", () => {
  const communicator = PaneCommunicator.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );
  assertExists(communicator);
});

Deno.test("PaneCommunicator - sendStatusUpdateToPane normal case", async () => {
  const communicator = PaneCommunicator.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await communicator.sendStatusUpdateToPane("%1");

  assertEquals(result.ok, true);
});

Deno.test("PaneCommunicator - sendStatusUpdateToPane command failure", async () => {
  const mockExecutor = {
    execute: () => Promise.resolve({ ok: false, error: "Command failed" }),
  };

  const communicator = PaneCommunicator.create(mockExecutor, new MockLogger());

  const result = await communicator.sendStatusUpdateToPane("%1");

  assertEquals(result.ok, false);
});

Deno.test("PaneCommunicator - sendToPane normal case", async () => {
  const communicator = PaneCommunicator.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await communicator.sendToPane("%1", "test message");

  assertEquals(result.ok, true);
});

Deno.test("PaneCommunicator - sendToPane empty message", async () => {
  const communicator = PaneCommunicator.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await communicator.sendToPane("%1", "");

  assertEquals(result.ok, true);
});

Deno.test("PaneCommunicator - sendInstructionFile file not found", async () => {
  const communicator = PaneCommunicator.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await communicator.sendInstructionFile(
    "%1",
    "/nonexistent/file.txt",
  );

  assertEquals(result.ok, false);
});

// Check actual timestamp for DateTime testing
Deno.test("MessageGenerator - message with timestamp", () => {
  const beforeTime = new Date().getTime();
  const message = MessageGenerator.generateStatusMessage([], [], []);
  const afterTime = new Date().getTime();

  // Verify that the message contains a timestamp
  assertEquals(message.includes("Pane Status Report"), true);
  assertEquals(message.includes("["), true);
  assertEquals(message.includes("]"), true);

  // Simple verification that actual time is included in the message
  const timestampMatch = message.match(
    /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/,
  );
  if (timestampMatch) {
    const messageTime = new Date(timestampMatch[1]).getTime();
    assertEquals(messageTime >= beforeTime, true);
    assertEquals(messageTime <= afterTime, true);
  }
});
