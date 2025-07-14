import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TimeCalculator } from "../time_calculator.ts";

Deno.test("TimeCalculator: parseTimeString - valid time formats", () => {
  const calculator = new TimeCalculator();

  const testCases = [
    { input: "09:30", expectedHour: 9, expectedMinute: 30 },
    { input: "23:59", expectedHour: 23, expectedMinute: 59 },
    { input: "00:00", expectedHour: 0, expectedMinute: 0 },
    { input: "1:00", expectedHour: 1, expectedMinute: 0 },
  ];

  for (const testCase of testCases) {
    const result = calculator.parseTimeString(testCase.input);
    assert(result.ok, `Should parse ${testCase.input}`);

    const date = result.data;
    assertEquals(date.getHours(), testCase.expectedHour);
    assertEquals(date.getMinutes(), testCase.expectedMinute);
  }
});

Deno.test("TimeCalculator: parseTimeString - invalid time formats", () => {
  const calculator = new TimeCalculator();

  const invalidInputs = [
    "",
    "25:00",
    "12:60",
    "abc",
    "12",
    "12:30:45",
  ];

  for (const input of invalidInputs) {
    const result = calculator.parseTimeString(input);
    assert(!result.ok, `Should reject ${input}`);
  }
});

Deno.test("TimeCalculator: createScheduledTime - future time scheduling", () => {
  const calculator = new TimeCalculator();

  // Test with a specific base time: 2024-07-14 10:00:00
  const baseDate = new Date(2024, 6, 14, 10, 0, 0, 0); // Month is 0-indexed

  // Schedule for 15:30 (same day)
  const scheduledTime = calculator.createScheduledTime(baseDate, 15, 30);

  assertEquals(scheduledTime.getFullYear(), 2024);
  assertEquals(scheduledTime.getMonth(), 6); // July
  assertEquals(scheduledTime.getDate(), 14);
  assertEquals(scheduledTime.getHours(), 15);
  assertEquals(scheduledTime.getMinutes(), 30);
});

Deno.test("TimeCalculator: createScheduledTime - past time moves to next day", () => {
  const calculator = new TimeCalculator();

  // Test with a specific base time: 2024-07-14 15:00:00
  const baseDate = new Date(2024, 6, 14, 15, 0, 0, 0);

  // Schedule for 10:30 (past time, should move to next day)
  const scheduledTime = calculator.createScheduledTime(baseDate, 10, 30);

  assertEquals(scheduledTime.getFullYear(), 2024);
  assertEquals(scheduledTime.getMonth(), 6); // July
  assertEquals(scheduledTime.getDate(), 15); // Next day
  assertEquals(scheduledTime.getHours(), 10);
  assertEquals(scheduledTime.getMinutes(), 30);
});

Deno.test("TimeCalculator: createScheduledTime - past time scheduling", () => {
  const calculator = new TimeCalculator();

  // Test with a specific base time: 2024-07-14 15:30:00
  const baseDate = new Date(2024, 6, 14, 15, 30, 0, 0);

  // Schedule for 15:29 (past time, should move to next day)
  const scheduledTime = calculator.createScheduledTime(baseDate, 15, 29);

  assertEquals(scheduledTime.getFullYear(), 2024);
  assertEquals(scheduledTime.getMonth(), 6); // July
  assertEquals(scheduledTime.getDate(), 15); // Next day since target time is in past
  assertEquals(scheduledTime.getHours(), 15);
  assertEquals(scheduledTime.getMinutes(), 29);
});

Deno.test("TimeCalculator: timezone consistency", () => {
  const calculator = new TimeCalculator();

  // Test that timezone handling is consistent
  const baseDate = new Date(); // Current time in local timezone
  const hours = 23;
  const minutes = 45;

  const scheduledTime = calculator.createScheduledTime(
    baseDate,
    hours,
    minutes,
  );

  // The scheduled time should maintain the same timezone as the base date
  assertEquals(scheduledTime.getTimezoneOffset(), baseDate.getTimezoneOffset());
  assertEquals(scheduledTime.getHours(), hours);
  assertEquals(scheduledTime.getMinutes(), minutes);
});

Deno.test("TimeCalculator: isInFuture", () => {
  const calculator = new TimeCalculator();

  const baseTime = new Date(2024, 6, 14, 10, 0, 0, 0);
  const futureTime = new Date(2024, 6, 14, 11, 0, 0, 0);
  const pastTime = new Date(2024, 6, 14, 9, 0, 0, 0);

  assert(calculator.isInFuture(futureTime, baseTime));
  assert(!calculator.isInFuture(pastTime, baseTime));
});

Deno.test("TimeCalculator: formatTime", () => {
  const calculator = new TimeCalculator();

  const testCases = [
    { date: new Date(2024, 6, 14, 9, 30, 0, 0), expected: "09:30" },
    { date: new Date(2024, 6, 14, 23, 59, 0, 0), expected: "23:59" },
    { date: new Date(2024, 6, 14, 0, 0, 0, 0), expected: "00:00" },
  ];

  for (const testCase of testCases) {
    const result = calculator.formatTime(testCase.date);
    assertEquals(result, testCase.expected);
  }
});
