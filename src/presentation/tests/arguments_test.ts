import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ArgumentParser } from "../arguments.ts";
import { Logger, TimeManager } from "../../infrastructure/services.ts";

// =============================================================================
// Mock classes for testing
// =============================================================================

class MockTimeManager extends TimeManager {
  constructor() {
    super();
  }

  // Override methods for predictable testing
  override getCurrentTime(): Date {
    return new Date("2024-01-01T10:00:00");
  }
}

class MockLogger extends Logger {
  constructor() {
    super();
  }
}

// =============================================================================
// Test helper functions
// =============================================================================

function setupMockArgs(args: string[]): void {
  // Store original args
  const _originalArgs = Deno.args;

  // Mock Deno.args
  Object.defineProperty(Deno, "args", {
    value: args,
    writable: true,
    configurable: true,
  });
}

function restoreMockArgs(): void {
  // Restore original args behavior
  Object.defineProperty(Deno, "args", {
    value: [],
    writable: true,
    configurable: true,
  });
}

// =============================================================================
// ArgumentParser Tests
// =============================================================================

Deno.test("ArgumentParser: parse() - no arguments", () => {
  setupMockArgs([]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(result.data.isContinuous()); // Default is now continuous mode
  assertEquals(result.data.getScheduledTime(), null);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - time flag --time=HH:MM", () => {
  setupMockArgs(["--time=14:30"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(result.data.isContinuous()); // Default is continuous mode unless --onetime specified

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 14);
  assertEquals(scheduledTime.getMinutes(), 30);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - time flag -t HH:MM", () => {
  setupMockArgs(["-t", "04:00"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 4);
  assertEquals(scheduledTime.getMinutes(), 0);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - invalid time format", () => {
  setupMockArgs(["--time=invalid"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - instruction file --instruction=path", () => {
  setupMockArgs(["--instruction=test/file.md"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assertEquals(result.data.getInstructionFile(), "test/file.md");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - instruction file -i path", () => {
  setupMockArgs(["-i", "draft/file.md"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assertEquals(result.data.getInstructionFile(), "draft/file.md");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - combined arguments", () => {
  setupMockArgs(["--time=14:30", "--instruction=test.md"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(result.data.isContinuous()); // Default is continuous mode

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 14);
  assertEquals(scheduledTime.getMinutes(), 30);

  assertEquals(result.data.getInstructionFile(), "test.md");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - missing argument for -t flag", () => {
  setupMockArgs(["-t"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  // Should succeed but with no scheduled time since no value provided
  assert(result.ok);
  assertEquals(result.data.getScheduledTime(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - missing argument for -i flag", () => {
  setupMockArgs(["-i"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  // Should succeed but with no instruction file since no value provided
  assert(result.ok);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - multiple time arguments (last one wins)", () => {
  setupMockArgs(["--time=10:00", "-t", "14:30"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 14);
  assertEquals(scheduledTime.getMinutes(), 30);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - edge case empty time string", () => {
  setupMockArgs(["--time="]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(!result.ok);
  assertEquals(result.error.kind, "EmptyInput");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - edge case empty instruction string", () => {
  setupMockArgs(["--instruction="]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - onetime flag --onetime", () => {
  setupMockArgs(["--onetime"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // --onetime overrides default continuous mode
  assertEquals(result.data.getScheduledTime(), null);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - onetime flag -o", () => {
  setupMockArgs(["-o"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // -o overrides default continuous mode
  assertEquals(result.data.getScheduledTime(), null);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - onetime with time flag", () => {
  setupMockArgs(["--onetime", "--time=15:45"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // --onetime overrides continuous mode

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 15);
  assertEquals(scheduledTime.getMinutes(), 45);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - clear flag --clear", () => {
  setupMockArgs(["--clear"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // --clear forces one-time mode
  assertEquals(result.data.shouldClearPanes(), true);
  assertEquals(result.data.shouldKillAllPanes(), false);
  assertEquals(result.data.getScheduledTime(), null);
  assertEquals(result.data.getInstructionFile(), null);

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - clear with other options", () => {
  setupMockArgs(["--clear", "--time=16:30", "--instruction=test.txt"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // --clear forces one-time mode
  assertEquals(result.data.shouldClearPanes(), true);
  assertEquals(result.data.shouldKillAllPanes(), false);

  const scheduledTime = result.data.getScheduledTime();
  assertExists(scheduledTime);
  assertEquals(scheduledTime.getHours(), 16);
  assertEquals(scheduledTime.getMinutes(), 30);
  assertEquals(result.data.getInstructionFile(), "test.txt");

  restoreMockArgs();
});

Deno.test("ArgumentParser: parse() - clear and kill-all-panes together", () => {
  setupMockArgs(["--clear", "--kill-all-panes"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  assert(!result.data.isContinuous()); // --clear forces one-time mode
  assertEquals(result.data.shouldClearPanes(), true);
  assertEquals(result.data.shouldKillAllPanes(), true);

  restoreMockArgs();
});
