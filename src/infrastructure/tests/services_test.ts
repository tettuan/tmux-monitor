import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  Command,
  CommandExecutor,
  Duration,
  isSuccessResult,
  KeyboardInterruptHandler,
  Logger,
  LoggerConfig,
  RuntimeTracker,
  TimeManager,
  Timestamp,
} from "../services.ts";

// Mock Deno.Command for testing
class MockCommand {
  constructor(private cmd: string, private options: { args?: string[] }) {}

  output() {
    // Handle bash -c commands
    if (this.cmd === "bash" && this.options.args?.[0] === "-c") {
      const command = this.options.args?.[1] || "";

      // executeTmuxCommand passes commands without "tmux" prefix
      if (command === "echo 'test'") {
        return {
          success: true,
          stdout: new TextEncoder().encode("test"),
          stderr: new TextEncoder().encode(""),
        };
      }

      // Return failure for false command
      if (command === "false") {
        return {
          success: false,
          stdout: new TextEncoder().encode(""),
          stderr: new TextEncoder().encode("command failed"),
        };
      }

      // Default success for any other commands
      return {
        success: true,
        stdout: new TextEncoder().encode("success"),
        stderr: new TextEncoder().encode(""),
      };
    }

    // Handle sh -c commands
    if (this.cmd === "sh" && this.options.args?.[0] === "-c") {
      const command = this.options.args?.[1] || "";

      if (command === "echo 'test'") {
        return {
          success: true,
          stdout: new TextEncoder().encode("test"),
          stderr: new TextEncoder().encode(""),
        };
      }
    }

    // Default success for non-bash commands
    return {
      success: true,
      stdout: new TextEncoder().encode("success"),
      stderr: new TextEncoder().encode(""),
    };
  }
}

// =============================================================================
// Command Value Object Tests
// =============================================================================

Deno.test("Command.create - valid command", () => {
  const result = Command.create("tmux", ["list-panes"]);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.program, "tmux");
    assertEquals(result.data.args.length, 1);
    assertEquals(result.data.args[0], "list-panes");
  }
});

Deno.test("Command.create - empty program", () => {
  const result = Command.create("");

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("Command.createTmux - valid subcommand", () => {
  const result = Command.createTmux("list-panes", ["-a"]);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.program, "tmux");
    assertEquals(result.data.args.length, 2);
    assertEquals(result.data.args[0], "list-panes");
    assertEquals(result.data.args[1], "-a");
  }
});

// =============================================================================
// CommandExecutor Tests
// =============================================================================

Deno.test("CommandExecutor.executeTmuxCommand - success", async () => {
  // Mock Deno.Command
  const originalCommand = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Deno.Command = MockCommand;

  try {
    const executor = new CommandExecutor();
    const result = await executor.executeTmuxCommand("echo 'test'");

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.data, "test");
    }
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).Deno.Command = originalCommand;
  }
});

Deno.test("CommandExecutor.executeTmuxCommand - failure", async () => {
  // Mock Deno.Command
  const originalCommand = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Deno.Command = MockCommand;

  try {
    const executor = new CommandExecutor();
    const result = await executor.executeTmuxCommand("false");

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.kind, "CommandFailed");
    }
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).Deno.Command = originalCommand;
  }
});

Deno.test("CommandExecutor.executeTmuxCommand - empty command", async () => {
  // Mock Deno.Command
  const originalCommand = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Deno.Command = MockCommand;

  try {
    const executor = new CommandExecutor();
    const result = await executor.executeTmuxCommand("");

    // Empty command with bash -c "" should succeed but return empty output
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.data, "success");
    }
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).Deno.Command = originalCommand;
  }
});

Deno.test("CommandExecutor.execute - with Command object", async () => {
  // Mock Deno.Command
  const originalCommand = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Deno.Command = MockCommand;

  try {
    const executor = new CommandExecutor();
    const cmdResult = Command.create("sh", ["-c", "echo 'test'"]);

    assertEquals(cmdResult.ok, true);
    if (cmdResult.ok) {
      const result = await executor.execute(cmdResult.data);

      assertEquals(result.ok, true);
      if (
        result.ok && typeof result.data === "object" && "kind" in result.data
      ) {
        assertEquals(result.data.kind, "success");
        if (isSuccessResult(result.data)) {
          assertEquals(result.data.stdout, "test");
        }
      }
    }
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).Deno.Command = originalCommand;
  }
});

// =============================================================================
// Logger Tests
// =============================================================================

Deno.test("Logger.info - with timestamp", () => {
  // Mock console.log
  let loggedMessage = "";
  const originalLog = console.log;
  console.log = (message: string) => {
    loggedMessage = message;
  };

  try {
    const configResult = LoggerConfig.create("INFO");
    assertEquals(configResult.ok, true);

    if (configResult.ok) {
      const logger = new Logger(configResult.data);
      logger.info("test message");

      // The new logger includes timestamps
      assertEquals(loggedMessage.includes("[INFO] test message"), true);
      assertEquals(
        loggedMessage.includes(new Date().getFullYear().toString()),
        true,
      );
    }
  } finally {
    console.log = originalLog;
  }
});

Deno.test("Logger.error - basic error", () => {
  // Mock console.error
  let loggedMessage = "";
  const originalError = console.error;
  console.error = (message: string) => {
    loggedMessage = message;
  };

  try {
    // Create logger with explicit config to avoid env access
    const configResult = LoggerConfig.create("INFO");
    assertEquals(configResult.ok, true);
    if (configResult.ok) {
      const logger = new Logger(configResult.data);
      logger.error("test error");

      assertEquals(loggedMessage.includes("[ERROR] test error"), true);
    }
  } finally {
    console.error = originalError;
  }
});

Deno.test("Logger.error - with error object", () => {
  // Mock console.error
  let loggedMessage = "";
  const originalError = console.error;
  console.error = (message: string) => {
    loggedMessage = message;
  };

  try {
    // Create logger with explicit config to avoid env access
    const configResult = LoggerConfig.create("INFO");
    assertEquals(configResult.ok, true);
    if (configResult.ok) {
      const logger = new Logger(configResult.data);
      const testError = new Error("test");
      logger.error("test error", testError);

      assertEquals(loggedMessage.includes("[ERROR] test error"), true);
      assertEquals(loggedMessage.includes("Error: test"), true);
    }
  } finally {
    console.error = originalError;
  }
});

// =============================================================================
// TimeManager Tests
// =============================================================================

Deno.test("TimeManager.sleep - short duration", async () => {
  const timeManager = new TimeManager();
  const start = Date.now();
  await timeManager.sleep(10); // 10ms
  const end = Date.now();

  // Allow some tolerance for timing
  const elapsed = end - start;
  assertEquals(elapsed >= 10, true);
  assertEquals(elapsed < 50, true); // Should not take too long
});

Deno.test("TimeManager.getCurrentTime - returns Timestamp", () => {
  const timeManager = new TimeManager();
  const timestamp = timeManager.getCurrentTime();

  assertEquals(timestamp instanceof Timestamp, true);
  assertEquals(timestamp.value > 0, true);
});

Deno.test("TimeManager.getCurrentTimeISO - returns ISO string", () => {
  const timeManager = new TimeManager();
  const iso = timeManager.getCurrentTimeISO();

  // Should be a valid ISO string
  assertEquals(typeof iso, "string");
  assertEquals(iso.includes("T"), true);
  assertEquals(new Date(iso).toString() !== "Invalid Date", true);
});

// =============================================================================
// RuntimeTracker Tests
// =============================================================================

Deno.test("RuntimeTracker.getStartTime - returns number", () => {
  const tracker = new RuntimeTracker();
  const startTime = tracker.getStartTime();

  assertEquals(typeof startTime, "number");
  assertEquals(startTime > 0, true);
});

Deno.test("RuntimeTracker.getElapsedTime - returns Duration", () => {
  const tracker = new RuntimeTracker();
  const elapsed = tracker.getElapsedTime();

  assertEquals(elapsed instanceof Duration, true);
  assertEquals(elapsed.milliseconds >= 0, true);
});

// =============================================================================
// Duration Tests
// =============================================================================

Deno.test("Duration.fromMilliseconds - valid duration", () => {
  const result = Duration.fromMilliseconds(1000);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.milliseconds, 1000);
    // Duration doesn't have toSeconds method in the implementation
    assertEquals(result.data.milliseconds / 1000, 1);
  }
});

Deno.test("Duration.fromMilliseconds - negative duration", () => {
  const result = Duration.fromMilliseconds(-1000);

  assertEquals(result.ok, false);
  if (!result.ok) {
    // The implementation returns InvalidFormat for negative durations
    assertEquals(result.error.kind, "InvalidFormat");
  }
});

Deno.test("Duration.between - valid range", () => {
  const start = Date.now();
  const end = start + 1000;
  const result = Duration.between(start, end);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.milliseconds, 1000);
  }
});

// =============================================================================
// Timestamp Tests
// =============================================================================

Deno.test("Timestamp.create - valid timestamp", () => {
  const now = Date.now();
  const result = Timestamp.create(now);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.value, now);
  }
});

Deno.test("Timestamp.create - negative timestamp", () => {
  const result = Timestamp.create(-1);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "InvalidFormat");
  }
});

Deno.test("Timestamp.now - returns current timestamp", () => {
  const before = Date.now();
  const timestamp = Timestamp.now();
  const after = Date.now();

  assertEquals(timestamp.value >= before, true);
  assertEquals(timestamp.value <= after, true);
});

// =============================================================================
// KeyboardInterruptHandler Tests
// =============================================================================

Deno.test("KeyboardInterruptHandler.setup - no immediate cancellation", () => {
  const handler = new KeyboardInterruptHandler();
  // Skip setup() as it affects terminal state

  assertEquals(handler.isCancellationRequested(), false);
});

Deno.test("KeyboardInterruptHandler.isCancellationRequested - initial state", () => {
  const handler = new KeyboardInterruptHandler();
  assertEquals(handler.isCancellationRequested(), false);
});

Deno.test("KeyboardInterruptHandler.sleepWithCancellation - no cancellation", async () => {
  const handler = new KeyboardInterruptHandler();
  const timeManager = new TimeManager();

  const start = Date.now();
  const cancelled = await handler.sleepWithCancellation(10, timeManager);
  const end = Date.now();

  assertEquals(cancelled, false);
  assertEquals(end - start >= 10, true);
});

// Note: Testing actual cancellation would require simulating keyboard input,
// which is complex in a test environment. The cancellation logic is covered
// by the manual testing of the monitor tool.