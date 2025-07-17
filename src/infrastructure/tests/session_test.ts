import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TmuxSession } from "../session.ts";
import { MockLogger } from "../../core/test-utils.ts";

// Mock CommandExecutor
class MockCommandExecutor {
  execute = (command: string[]) => {
    if (command.includes("list-sessions")) {
      return Promise.resolve({
        ok: true as const,
        data: "test-session:2:1\nother-session:1:0",
      });
    }
    if (command.includes("list-panes")) {
      return Promise.resolve({
        ok: true as const,
        data:
          "test-session:0:main:%1:0:/dev/ttys000:1234:bash:/Users/test:main:1:0:80:24:bash",
      });
    }
    return Promise.resolve({
      ok: false as const,
      error: {
        kind: "CommandFailed" as const,
        command: command.join(" "),
        stderr: "Unknown command",
        message: "Unknown command",
      },
    });
  };

  executeTmuxCommand = (_command: string) => {
    return Promise.resolve({ ok: true as const, data: "mock output" });
  };

  killAllPanes = () => {
    return Promise.resolve({ ok: true as const, data: "mock kill all panes" });
  };
}

Deno.test("TmuxSession - create", () => {
  const session = TmuxSession.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );
  assertExists(session);
});

Deno.test("TmuxSession - findMostActiveSession normal case", async () => {
  const session = TmuxSession.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, "test-session"); // attached session takes priority
  }
});

Deno.test("TmuxSession - findMostActiveSession no sessions", async () => {
  const mockExecutor = {
    execute: () => Promise.resolve({ ok: true as const, data: "" }),
    executeTmuxCommand: () => Promise.resolve({ ok: true as const, data: "" }),
    killAllPanes: () =>
      Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - findMostActiveSession command failure", async () => {
  const mockExecutor = {
    execute: () =>
      Promise.resolve({
        ok: false as const,
        error: {
          kind: "CommandFailed" as const,
          command: "test",
          stderr: "Command failed",
          message: "Command failed",
        },
      }),
    executeTmuxCommand: () =>
      Promise.resolve({
        ok: false as const,
        error: {
          kind: "CommandFailed" as const,
          command: "test",
          stderr: "Command failed",
          message: "Command failed",
        },
      }),
    killAllPanes: () =>
      Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes normal case", async () => {
  const session = TmuxSession.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 1);
    assertEquals(result.data[0].sessionName, "test-session");
    assertEquals(result.data[0].paneId, "%1");
  }
});

Deno.test("TmuxSession - getAllPanes command failure", async () => {
  const mockExecutor = {
    execute: () =>
      Promise.resolve({
        ok: false as const,
        error: {
          kind: "CommandFailed" as const,
          command: "test",
          stderr: "Command failed",
          message: "Command failed",
        },
      }),
    executeTmuxCommand: () =>
      Promise.resolve({
        ok: false as const,
        error: {
          kind: "CommandFailed" as const,
          command: "test",
          stderr: "Command failed",
          message: "Command failed",
        },
      }),
    killAllPanes: () =>
      Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes invalid data", async () => {
  const mockExecutor = {
    execute: () => Promise.resolve({ ok: true as const, data: "invalid:data" }),
    executeTmuxCommand: () =>
      Promise.resolve({ ok: true as const, data: "invalid:data" }),
    killAllPanes: () =>
      Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 0); // Invalid data is excluded
  }
});
