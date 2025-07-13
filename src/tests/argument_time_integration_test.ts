import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ArgumentParser } from "../arguments.ts";
import { Logger, TimeManager } from "../services.ts";

/**
 * Unit tests for ArgumentParser time scheduling integration
 *
 * These tests validate the complete time parsing and scheduling workflow
 * without requiring actual time waiting or process execution.
 */

// Mock implementations for testing
class MockTimeManager extends TimeManager {
  constructor() {
    super();
  }
}

class MockLogger extends Logger {
  constructor() {
    super();
  }
}

function setupMockArgs(args: string[]): void {
  Object.defineProperty(Deno, "args", {
    value: args,
    writable: true,
    configurable: true,
  });
}

function restoreMockArgs(): void {
  Object.defineProperty(Deno, "args", {
    value: [],
    writable: true,
    configurable: true,
  });
}

Deno.test("ArgumentParser: time scheduling - future time within same day", () => {
  // Use a fixed time that's likely to be in the future
  const timeStr = "23:45";

  setupMockArgs(["--time=" + timeStr]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);
  const now = new Date();

  // Should be in the future
  assert(scheduledTime.getTime() > now.getTime());

  // Should match the specified time
  assertEquals(scheduledTime.getHours(), 23);
  assertEquals(scheduledTime.getMinutes(), 45);

  // If current time is before 23:45, should be same day, otherwise next day
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const scheduledTimeInMinutes = 23 * 60 + 45;

  if (currentTimeInMinutes < scheduledTimeInMinutes - 1) { // -1 for buffer
    // Should be same day
    assertEquals(scheduledTime.getDate(), now.getDate());
    assertEquals(scheduledTime.getMonth(), now.getMonth());
    assertEquals(scheduledTime.getFullYear(), now.getFullYear());
  } else {
    // Should be next day
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assertEquals(scheduledTime.getDate(), tomorrow.getDate());
  }

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - past time moves to tomorrow", () => {
  // Use a time that is actually in the past (1 hour ago)
  const now = new Date();
  const pastHour = (now.getHours() - 1 + 24) % 24;
  const pastMinute = 0;
  const timeStr = `${pastHour.toString().padStart(2, "0")}:${
    pastMinute.toString().padStart(2, "0")
  }`;

  setupMockArgs(["--time=" + timeStr]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);

  const currentTime = new Date();

  // The key test: since the time is in the past, the scheduled time should be in the future
  assert(scheduledTime.getTime() > currentTime.getTime());

  // Should match the specified time
  assertEquals(scheduledTime.getHours(), pastHour);
  assertEquals(scheduledTime.getMinutes(), pastMinute);

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - midnight handling", () => {
  setupMockArgs(["--time=00:00"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);

  // Midnight should be scheduled for tomorrow (unless it's very early morning)
  const now = new Date();
  assertEquals(scheduledTime.getHours(), 0);
  assertEquals(scheduledTime.getMinutes(), 0);

  // Should be in the future
  assert(scheduledTime.getTime() > now.getTime());

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - current time with buffer effect", () => {
  // Use current time (should be moved to tomorrow due to 30s buffer)
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${
    now.getMinutes().toString().padStart(2, "0")
  }`;

  setupMockArgs(["--time=" + timeStr]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);

  // Due to 30-second buffer, should typically be scheduled for tomorrow
  // unless we're at the very start of a minute
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Should be in the future
  assert(scheduledTime.getTime() > now.getTime());

  // Should match the specified time
  assertEquals(scheduledTime.getHours(), now.getHours());
  assertEquals(scheduledTime.getMinutes(), now.getMinutes());

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - various time formats", () => {
  const testCases = [
    { input: "--time=09:30", expectedHour: 9, expectedMinute: 30 },
    { input: "--time=23:59", expectedHour: 23, expectedMinute: 59 },
    { input: "--time=1:00", expectedHour: 1, expectedMinute: 0 },
    { input: "-t", value: "14:15", expectedHour: 14, expectedMinute: 15 },
  ];

  for (const testCase of testCases) {
    const args = testCase.value
      ? [testCase.input, testCase.value]
      : [testCase.input];

    setupMockArgs(args);

    const timeManager = new MockTimeManager();
    const logger = new MockLogger();
    const parser = new ArgumentParser(timeManager, logger);

    const result = parser.parse();

    assert(result.ok, `Failed to parse ${testCase.input}`);
    const scheduledTime = result.data.getScheduledTime();
    assert(scheduledTime !== null, `No scheduled time for ${testCase.input}`);

    assertEquals(
      scheduledTime.getHours(),
      testCase.expectedHour,
      `Wrong hour for ${testCase.input}`,
    );
    assertEquals(
      scheduledTime.getMinutes(),
      testCase.expectedMinute,
      `Wrong minute for ${testCase.input}`,
    );

    restoreMockArgs();
  }
});

Deno.test("ArgumentParser: time scheduling - combined with other options", () => {
  setupMockArgs(["--time=15:30", "--onetime", "--instruction=test.md"]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  const result = parser.parse();

  assert(result.ok);
  const options = result.data;

  // Time scheduling should work with other options
  const scheduledTime = options.getScheduledTime();
  assert(scheduledTime !== null);
  assertEquals(scheduledTime.getHours(), 15);
  assertEquals(scheduledTime.getMinutes(), 30);

  // Other options should be parsed correctly
  assert(!options.isContinuous()); // onetime mode
  assertEquals(options.getInstructionFile(), "test.md");

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - error handling for invalid time", () => {
  const invalidTimeFormats = [
    { input: "--time=25:00", expectedError: "InvalidTimeFormat" }, // Invalid hour
    { input: "--time=12:60", expectedError: "InvalidTimeFormat" }, // Invalid minute
    { input: "--time=abc", expectedError: "InvalidTimeFormat" }, // Non-numeric
    { input: "--time=12", expectedError: "InvalidTimeFormat" }, // Missing minute
    { input: "--time=12:30:45", expectedError: "InvalidTimeFormat" }, // Too many parts
    { input: "--time=", expectedError: "EmptyInput" }, // Empty
  ];

  for (const testCase of invalidTimeFormats) {
    setupMockArgs([testCase.input]);

    const timeManager = new MockTimeManager();
    const logger = new MockLogger();
    const parser = new ArgumentParser(timeManager, logger);

    const result = parser.parse();

    assert(!result.ok, `Should fail for invalid time: ${testCase.input}`);
    assertEquals(
      result.error.kind,
      testCase.expectedError,
      `Wrong error kind for: ${testCase.input}, expected: ${testCase.expectedError}, got: ${result.error.kind}`,
    );

    restoreMockArgs();
  }
});

Deno.test("ArgumentParser: time scheduling - consistency across multiple parses", () => {
  const timeStr = "16:45";
  setupMockArgs(["--time=" + timeStr]);

  const timeManager = new MockTimeManager();
  const logger = new MockLogger();
  const parser = new ArgumentParser(timeManager, logger);

  // Parse multiple times
  const result1 = parser.parse();
  const result2 = parser.parse();

  assert(result1.ok);
  assert(result2.ok);

  const time1 = result1.data.getScheduledTime();
  const time2 = result2.data.getScheduledTime();

  assert(time1 !== null);
  assert(time2 !== null);

  // Should produce consistent results
  assertEquals(time1.getTime(), time2.getTime());
  assertEquals(time1.getHours(), 16);
  assertEquals(time1.getMinutes(), 45);
  assertEquals(time2.getHours(), 16);
  assertEquals(time2.getMinutes(), 45);

  restoreMockArgs();
});
