import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TmuxSession } from "../session.ts";

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

// Mock Logger
class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

Deno.test("TmuxSession - create", () => {
  const session = TmuxSession.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );
  assertExists(session);
});

Deno.test("TmuxSession - findMostActiveSession 正常系", async () => {
  const session = TmuxSession.create(
    new MockCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, "test-session"); // アタッチされたセッションが優先される
  }
});

Deno.test("TmuxSession - findMostActiveSession セッションなし", async () => {
  const mockExecutor = {
    execute: () => Promise.resolve({ ok: true as const, data: "" }),
    executeTmuxCommand: () => Promise.resolve({ ok: true as const, data: "" }),
    killAllPanes: () => Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - findMostActiveSession コマンド失敗", async () => {
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
    killAllPanes: () => Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes 正常系", async () => {
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

Deno.test("TmuxSession - getAllPanes コマンド失敗", async () => {
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
    killAllPanes: () => Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes 不正なデータ", async () => {
  const mockExecutor = {
    execute: () => Promise.resolve({ ok: true as const, data: "invalid:data" }),
    executeTmuxCommand: () =>
      Promise.resolve({ ok: true as const, data: "invalid:data" }),
    killAllPanes: () => Promise.resolve({ ok: true as const, data: "mock kill all panes" }),
  };

  const session = TmuxSession.create(mockExecutor, new MockLogger());

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 0); // 不正なデータは除外される
  }
});
