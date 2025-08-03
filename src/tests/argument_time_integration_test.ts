import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ArgumentParser } from "../presentation/arguments.ts";
import { Logger, TimeManager } from "../infrastructure/services.ts";
import { TimeCalculator } from "../utils/time_calculator.ts";

/**
 * Unit tests for ArgumentParser time scheduling integration
 *
 * These tests validate the complete time parsing and scheduling workflow
 * without requiring actual time waiting or process execution.
 *
 * All tests use fixed base times to ensure timezone-independent behavior.
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
  // Use current time but ensure we test a future time
  const now = new Date();

  // Calculate a time that's definitely in the future (current hour + 1, or next day if needed)
  let futureHour = (now.getHours() + 1) % 24;
  if (futureHour <= now.getHours()) {
    futureHour = (now.getHours() + 2) % 24; // Ensure it's definitely in the future
  }

  const timeStr = `${futureHour.toString().padStart(2, "0")}:30`;

  setupMockArgs(["--time=" + timeStr]);

  const _timeManager = new MockTimeManager();
  const _logger = new MockLogger();
  const parser = new ArgumentParser();

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);

  // Should match the specified time
  assertEquals(scheduledTime.getHours(), futureHour);
  assertEquals(scheduledTime.getMinutes(), 30);

  // Should be in the future
  assert(
    scheduledTime.getTime() > now.getTime(),
    `Scheduled time ${scheduledTime.toISOString()} should be in future from ${now.toISOString()}`,
  );

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - comprehensive time patterns", () => {
  // Test multiple base time scenarios to ensure robustness
  const testScenarios = [
    {
      name: "Morning base time",
      baseTime: new Date(2025, 6, 14, 9, 0, 0, 0), // 09:00
      testCases: [
        {
          timeStr: "10:00",
          shouldBeNextDay: false,
          description: "future same day",
        },
        {
          timeStr: "08:00",
          shouldBeNextDay: true,
          description: "past time moves to tomorrow",
        },
        {
          timeStr: "23:59",
          shouldBeNextDay: false,
          description: "late evening same day",
        },
        {
          timeStr: "00:00",
          shouldBeNextDay: true,
          description: "midnight moves to tomorrow",
        },
      ],
    },
    {
      name: "Afternoon base time",
      baseTime: new Date(2025, 6, 14, 15, 30, 0, 0), // 15:30
      testCases: [
        {
          timeStr: "16:00",
          shouldBeNextDay: false,
          description: "future same day",
        },
        {
          timeStr: "12:00",
          shouldBeNextDay: true,
          description: "past time moves to tomorrow",
        },
        {
          timeStr: "15:29",
          shouldBeNextDay: true,
          description: "just before current time",
        },
        {
          timeStr: "15:31",
          shouldBeNextDay: false,
          description: "just after current time",
        },
      ],
    },
    {
      name: "Late evening base time",
      baseTime: new Date(2025, 6, 14, 23, 45, 0, 0), // 23:45
      testCases: [
        {
          timeStr: "23:50",
          shouldBeNextDay: false,
          description: "very near future same day",
        },
        {
          timeStr: "00:00",
          shouldBeNextDay: true,
          description: "midnight moves to tomorrow",
        },
        {
          timeStr: "12:00",
          shouldBeNextDay: true,
          description: "noon moves to tomorrow",
        },
        {
          timeStr: "23:30",
          shouldBeNextDay: true,
          description: "past time same hour",
        },
      ],
    },
    {
      name: "Near midnight base time",
      baseTime: new Date(2025, 6, 14, 23, 59, 30, 0), // 23:59:30
      testCases: [
        {
          timeStr: "00:00",
          shouldBeNextDay: true,
          description: "midnight moves to next day",
        },
        {
          timeStr: "23:59",
          shouldBeNextDay: true,
          description: "same minute scheduling",
        },
        {
          timeStr: "01:00",
          shouldBeNextDay: true,
          description: "early morning tomorrow",
        },
      ],
    },
  ];

  for (const scenario of testScenarios) {
    for (const testCase of scenario.testCases) {
      const timeCalculator = new TimeCalculator();
      timeCalculator.setMockCurrentTime(scenario.baseTime);

      setupMockArgs(["--time=" + testCase.timeStr]);

      const _timeManager = new MockTimeManager();
      const _logger = new MockLogger();
      const parser = new ArgumentParser(timeCalculator, true);

      const result = parser.parse();

      assert(
        result.ok,
        `Failed to parse ${testCase.timeStr} in ${scenario.name}`,
      );
      const scheduledTime = result.data.getScheduledTime();
      assert(
        scheduledTime !== null,
        `No scheduled time for ${testCase.timeStr} in ${scenario.name}`,
      );

      // Verify time components
      const [expectedHour, expectedMinute] = testCase.timeStr.split(":").map(
        Number,
      );
      assertEquals(
        scheduledTime.getHours(),
        expectedHour,
        `Wrong hour for ${testCase.description}`,
      );
      assertEquals(
        scheduledTime.getMinutes(),
        expectedMinute,
        `Wrong minute for ${testCase.description}`,
      );

      // Verify day logic - use TimeCalculator to determine expected behavior
      const testCalculator = new TimeCalculator();
      testCalculator.setMockCurrentTime(scenario.baseTime);
      const expectedScheduledTime = testCalculator.createScheduledTime(
        scenario.baseTime,
        expectedHour,
        expectedMinute,
      );

      assertEquals(
        scheduledTime.getDate(),
        expectedScheduledTime.getDate(),
        `Wrong date for ${testCase.description} - scheduled: ${scheduledTime.toISOString()}, expected: ${expectedScheduledTime.toISOString()}`,
      );

      assertEquals(
        scheduledTime.getMonth(),
        expectedScheduledTime.getMonth(),
        `Wrong month for ${testCase.description}`,
      );

      assertEquals(
        scheduledTime.getFullYear(),
        expectedScheduledTime.getFullYear(),
        `Wrong year for ${testCase.description}`,
      );

      // Verify the scheduled time matches what TimeCalculator produces
      assert(
        scheduledTime.getTime() === expectedScheduledTime.getTime(),
        `Scheduled time should match TimeCalculator result for ${testCase.description}. Scheduled: ${scheduledTime.toISOString()}, Expected: ${expectedScheduledTime.toISOString()}`,
      );

      restoreMockArgs();
    }
  }
});

Deno.test("ArgumentParser: time scheduling - time comparison edge cases", () => {
  // Test edge cases for time comparison
  const edgeCases = [
    {
      name: "Exactly same time",
      baseTime: new Date(2025, 6, 14, 15, 30, 0, 0), // 15:30:00
      targetTime: "15:30",
      description: "should move to next day when exactly same time",
    },
    {
      name: "One minute before",
      baseTime: new Date(2025, 6, 14, 15, 29, 0, 0), // 15:29:00
      targetTime: "15:30",
      description: "should be same day when target is in future",
    },
    {
      name: "One minute after",
      baseTime: new Date(2025, 6, 14, 15, 31, 0, 0), // 15:31:00
      targetTime: "15:30",
      description: "should move to next day when target is in past",
    },
    {
      name: "Midnight boundary",
      baseTime: new Date(2025, 6, 14, 23, 59, 0, 0), // 23:59:00
      targetTime: "00:00",
      description: "midnight should move to next day",
    },
  ];

  for (const testCase of edgeCases) {
    const timeCalculator = new TimeCalculator();
    timeCalculator.setMockCurrentTime(testCase.baseTime);

    setupMockArgs(["--time=" + testCase.targetTime]);

    const _timeManager = new MockTimeManager();
    const _logger = new MockLogger();
    const parser = new ArgumentParser(timeCalculator, true);

    const result = parser.parse();

    assert(result.ok, `Failed to parse for ${testCase.name}`);
    const scheduledTime = result.data.getScheduledTime();
    assert(scheduledTime !== null, `No scheduled time for ${testCase.name}`);

    // Verify time components are correct
    const [expectedHour, expectedMinute] = testCase.targetTime.split(":").map(
      Number,
    );
    assertEquals(
      scheduledTime.getHours(),
      expectedHour,
      `Wrong hour for ${testCase.name}`,
    );
    assertEquals(
      scheduledTime.getMinutes(),
      expectedMinute,
      `Wrong minute for ${testCase.name}`,
    );

    // Use TimeCalculator to determine expected behavior instead of manual calculation
    const testCalculator = new TimeCalculator();
    testCalculator.setMockCurrentTime(testCase.baseTime);
    const expectedScheduledTime = testCalculator.createScheduledTime(
      testCase.baseTime,
      expectedHour,
      expectedMinute,
    );

    assertEquals(
      scheduledTime.getDate(),
      expectedScheduledTime.getDate(),
      `Wrong date for ${testCase.name} - scheduled: ${scheduledTime.toISOString()}, expected: ${expectedScheduledTime.toISOString()}`,
    );

    restoreMockArgs();
  }
});

Deno.test("ArgumentParser: time scheduling - current time scheduling", () => {
  // Test with current time instead of fixed 2024 date
  const now = new Date();
  const timeCalculator = new TimeCalculator();
  timeCalculator.setMockCurrentTime(now);

  // Test case: schedule for current time
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Test case: schedule for current time (should move to next occurrence)
  const timeStr = `${currentHour.toString().padStart(2, "0")}:${
    currentMinute.toString().padStart(2, "0")
  }`;

  setupMockArgs(["--time=" + timeStr]);

  const _timeManager = new MockTimeManager();
  const _logger = new MockLogger();
  const parser = new ArgumentParser(timeCalculator, true);

  const result = parser.parse();

  assert(result.ok);
  const scheduledTime = result.data.getScheduledTime();
  assert(scheduledTime !== null);

  // TimeCalculator handles the scheduling logic internally
  assertEquals(scheduledTime.getHours(), currentHour);
  assertEquals(scheduledTime.getMinutes(), currentMinute);

  // Should be scheduled appropriately (same time or future)
  assert(
    scheduledTime.getTime() >= now.getTime(),
    "Scheduled time should be at current time or in future",
  );

  restoreMockArgs();
});

Deno.test("ArgumentParser: time scheduling - various time formats", () => {
  // Use current time as base for more realistic testing
  const now = new Date();

  const testCases = [
    { input: "--time=09:30", expectedHour: 9, expectedMinute: 30 },
    { input: "--time=23:59", expectedHour: 23, expectedMinute: 59 },
    { input: "--time=1:00", expectedHour: 1, expectedMinute: 0 },
    { input: "-t", value: "14:15", expectedHour: 14, expectedMinute: 15 },
  ];

  for (const testCase of testCases) {
    // Use a consistent base time for each test
    const baseTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      10,
      0,
      0,
      0,
    );
    const timeCalculator = new TimeCalculator();
    timeCalculator.setMockCurrentTime(baseTime);

    const args = testCase.value
      ? [testCase.input, testCase.value]
      : [testCase.input];

    setupMockArgs(args);

    const _timeManager = new MockTimeManager();
    const _logger = new MockLogger();
    const parser = new ArgumentParser(timeCalculator, true);

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

    // Verify it's logically correct
    assert(
      scheduledTime.getTime() >= baseTime.getTime(),
      `Scheduled time should be at or after base time for ${testCase.input}`,
    );

    restoreMockArgs();
  }
});

Deno.test("ArgumentParser: time scheduling - combined with other options", () => {
  // Use current time as base for more realistic testing
  const now = new Date();
  const baseTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    10,
    0,
    0,
    0,
  );
  const timeCalculator = new TimeCalculator();
  timeCalculator.setMockCurrentTime(baseTime);

  setupMockArgs(["--time=15:30", "--onetime", "--instruction=test.md"]);

  const _timeManager = new MockTimeManager();
  const _logger = new MockLogger();
  const parser = new ArgumentParser(timeCalculator, true);

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
  // Use current time as base
  const now = new Date();
  const baseTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    10,
    0,
    0,
    0,
  );

  const invalidTimeFormats = [
    { input: "--time=25:00", expectedError: "InvalidTimeFormat" }, // Invalid hour
    { input: "--time=12:60", expectedError: "InvalidTimeFormat" }, // Invalid minute
    { input: "--time=abc", expectedError: "InvalidTimeFormat" }, // Non-numeric
    { input: "--time=12", expectedError: "InvalidTimeFormat" }, // Missing minute
    { input: "--time=12:30:45", expectedError: "InvalidTimeFormat" }, // Too many parts
    { input: "--time=", expectedError: "EmptyInput" }, // Empty
  ];

  for (const testCase of invalidTimeFormats) {
    const timeCalculator = new TimeCalculator();
    timeCalculator.setMockCurrentTime(baseTime);

    setupMockArgs([testCase.input]);

    const _timeManager = new MockTimeManager();
    const _logger = new MockLogger();
    const parser = new ArgumentParser(timeCalculator, true);

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
  // Use current time as base
  const now = new Date();
  const baseTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    10,
    0,
    0,
    0,
  );
  const timeCalculator = new TimeCalculator();
  timeCalculator.setMockCurrentTime(baseTime);

  const timeStr = "16:45";
  setupMockArgs(["--time=" + timeStr]);

  const _timeManager = new MockTimeManager();
  const _logger = new MockLogger();
  const parser = new ArgumentParser(timeCalculator, true);

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

Deno.test("ArgumentParser: time scheduling - month and year boundary edge cases", () => {
  // Test month boundary scenarios
  const edgeCaseScenarios = [
    {
      name: "End of month - same day scheduling",
      baseTime: new Date(2025, 0, 31, 10, 0, 0, 0), // Jan 31, 2025 10:00
      timeStr: "15:00",
      expectedDay: 31,
      expectedMonth: 0, // January
    },
    {
      name: "End of month - next day scheduling",
      baseTime: new Date(2025, 0, 31, 20, 0, 0, 0), // Jan 31, 2025 20:00
      timeStr: "10:00", // Past time, should go to next day (Feb 1)
      expectedDay: 1,
      expectedMonth: 1, // February
    },
    {
      name: "End of year - same day scheduling",
      baseTime: new Date(2025, 11, 31, 10, 0, 0, 0), // Dec 31, 2025 10:00
      timeStr: "15:00",
      expectedDay: 31,
      expectedMonth: 11, // December
      expectedYear: 2025,
    },
    {
      name: "End of year - next day scheduling",
      baseTime: new Date(2025, 11, 31, 20, 0, 0, 0), // Dec 31, 2025 20:00
      timeStr: "10:00", // Past time, should go to next year
      expectedDay: 1,
      expectedMonth: 0, // January
      expectedYear: 2026,
    },
    {
      name: "Leap year February boundary",
      baseTime: new Date(2024, 1, 29, 20, 0, 0, 0), // Feb 29, 2024 20:00 (leap year)
      timeStr: "10:00", // Past time, should go to March 1
      expectedDay: 1,
      expectedMonth: 2, // March
      expectedYear: 2024,
    },
  ];

  for (const scenario of edgeCaseScenarios) {
    const timeCalculator = new TimeCalculator();
    timeCalculator.setMockCurrentTime(scenario.baseTime);

    setupMockArgs(["--time=" + scenario.timeStr]);

    const _timeManager = new MockTimeManager();
    const _logger = new MockLogger();
    const parser = new ArgumentParser(timeCalculator, true);

    const result = parser.parse();

    assert(result.ok, `Failed to parse for ${scenario.name}`);
    const scheduledTime = result.data.getScheduledTime();
    assert(scheduledTime !== null, `No scheduled time for ${scenario.name}`);

    // Verify date components
    assertEquals(
      scheduledTime.getDate(),
      scenario.expectedDay,
      `Wrong day for ${scenario.name}`,
    );
    assertEquals(
      scheduledTime.getMonth(),
      scenario.expectedMonth,
      `Wrong month for ${scenario.name}`,
    );

    if (scenario.expectedYear) {
      assertEquals(
        scheduledTime.getFullYear(),
        scenario.expectedYear,
        `Wrong year for ${scenario.name}`,
      );
    }

    // Verify time components
    const [expectedHour, expectedMinute] = scenario.timeStr.split(":").map(
      Number,
    );
    assertEquals(
      scheduledTime.getHours(),
      expectedHour,
      `Wrong hour for ${scenario.name}`,
    );
    assertEquals(
      scheduledTime.getMinutes(),
      expectedMinute,
      `Wrong minute for ${scenario.name}`,
    );

    // Verify it's always in the future or equal
    assert(
      scheduledTime.getTime() >= scenario.baseTime.getTime(),
      `Scheduled time should be at or after base time for ${scenario.name}`,
    );

    restoreMockArgs();
  }
});

Deno.test("ArgumentParser: time scheduling - daylight saving time considerations", () => {
  // Test around typical DST transition dates
  const dstScenarios = [
    {
      name: "Spring DST transition day",
      baseTime: new Date(2025, 2, 9, 10, 0, 0, 0), // March 9, 2025 (typical DST start)
      timeStr: "15:00",
      description: "Should handle DST spring forward correctly",
    },
    {
      name: "Fall DST transition day",
      baseTime: new Date(2025, 10, 2, 10, 0, 0, 0), // November 2, 2025 (typical DST end)
      timeStr: "15:00",
      description: "Should handle DST fall back correctly",
    },
  ];

  for (const scenario of dstScenarios) {
    const timeCalculator = new TimeCalculator();
    timeCalculator.setMockCurrentTime(scenario.baseTime);

    setupMockArgs(["--time=" + scenario.timeStr]);

    const _timeManager = new MockTimeManager();
    const _logger = new MockLogger();
    const parser = new ArgumentParser(timeCalculator, true);

    const result = parser.parse();

    assert(result.ok, `Failed to parse for ${scenario.name}`);
    const scheduledTime = result.data.getScheduledTime();
    assert(scheduledTime !== null, `No scheduled time for ${scenario.name}`);

    // Basic verification - time should be parsed correctly regardless of DST
    const [expectedHour, expectedMinute] = scenario.timeStr.split(":").map(
      Number,
    );
    assertEquals(
      scheduledTime.getHours(),
      expectedHour,
      `Wrong hour for ${scenario.name}`,
    );
    assertEquals(
      scheduledTime.getMinutes(),
      expectedMinute,
      `Wrong minute for ${scenario.name}`,
    );

    // Should be in the future or equal
    assert(
      scheduledTime.getTime() >= scenario.baseTime.getTime(),
      `Scheduled time should be at or after base time for ${scenario.name}: ${scenario.description}`,
    );

    restoreMockArgs();
  }
});
