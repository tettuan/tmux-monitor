import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ValidatedTime } from "../models.ts";

/**
 * Unit tests for time scheduling and conversion logic
 *
 * These tests validate the core time parsing and scheduling functionality
 * without requiring actual process execution or time waiting.
 */

Deno.test("ValidatedTime: create() - valid time format HH:MM", () => {
  const result = ValidatedTime.create("14:30");

  assert(result.ok);
  const date = result.data.getDate();
  assertEquals(date.getHours(), 14);
  assertEquals(date.getMinutes(), 30);
  assertEquals(date.getSeconds(), 0);
  assertEquals(date.getMilliseconds(), 0);
});

Deno.test("ValidatedTime: create() - valid time format H:MM (single digit hour)", () => {
  const result = ValidatedTime.create("9:15");

  assert(result.ok);
  const date = result.data.getDate();
  assertEquals(date.getHours(), 9);
  assertEquals(date.getMinutes(), 15);
});

Deno.test("ValidatedTime: create() - midnight time 00:00", () => {
  const result = ValidatedTime.create("00:00");

  assert(result.ok);
  const date = result.data.getDate();
  assertEquals(date.getHours(), 0);
  assertEquals(date.getMinutes(), 0);
});

Deno.test("ValidatedTime: create() - late night time 23:59", () => {
  const result = ValidatedTime.create("23:59");

  assert(result.ok);
  const date = result.data.getDate();
  assertEquals(date.getHours(), 23);
  assertEquals(date.getMinutes(), 59);
});

Deno.test("ValidatedTime: create() - invalid format missing colon", () => {
  const result = ValidatedTime.create("1430");

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");
  if (result.error.kind === "InvalidTimeFormat") {
    assertEquals(result.error.input, "1430");
  }
});

Deno.test("ValidatedTime: create() - invalid format too many parts", () => {
  const result = ValidatedTime.create("14:30:45");

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");
});

Deno.test("ValidatedTime: create() - invalid hour value", () => {
  const result = ValidatedTime.create("25:30");

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");
});

Deno.test("ValidatedTime: create() - invalid minute value", () => {
  const result = ValidatedTime.create("14:60");

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");
});

Deno.test("ValidatedTime: create() - negative hour", () => {
  const result = ValidatedTime.create("-1:30");

  assert(!result.ok);
  assertEquals(result.error.kind, "InvalidTimeFormat");
});

Deno.test("ValidatedTime: create() - empty string", () => {
  const result = ValidatedTime.create("");

  assert(!result.ok);
  assertEquals(result.error.kind, "EmptyInput");
});

Deno.test("ValidatedTime: create() - whitespace only", () => {
  const result = ValidatedTime.create("   ");

  assert(!result.ok);
  assertEquals(result.error.kind, "EmptyInput");
});

Deno.test("ValidatedTime: create() - future time scheduling (same day)", () => {
  // Create a time that's definitely in the future (using a fixed future time)
  // We'll use 23:30 which should typically be in the future unless it's very late
  const timeStr = "23:30";

  const result = ValidatedTime.create(timeStr);

  assert(result.ok);
  const scheduledDate = result.data.getDate();
  const now = new Date();

  assertEquals(scheduledDate.getHours(), 23);
  assertEquals(scheduledDate.getMinutes(), 30);

  // Should be in the future
  assert(scheduledDate.getTime() > now.getTime());

  // If current time is before 23:30, should be same day
  // If current time is after 23:30, should be next day
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const scheduledTimeInMinutes = 23 * 60 + 30;

  if (currentTimeInMinutes < scheduledTimeInMinutes - 1) { // -1 for buffer
    // Should be same day
    assertEquals(scheduledDate.getDate(), now.getDate());
  } else {
    // Should be next day
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assertEquals(scheduledDate.getDate(), tomorrow.getDate());
  }
});

Deno.test("ValidatedTime: create() - past time scheduling (next day)", () => {
  const now = new Date();

  // Use a time that is actually in the past (1 hour ago)
  const pastHour = (now.getHours() - 1 + 24) % 24;
  const pastMinute = 0;

  const timeStr = `${pastHour.toString().padStart(2, "0")}:${
    pastMinute.toString().padStart(2, "0")
  }`;

  const result = ValidatedTime.create(timeStr);

  assert(result.ok);
  const scheduledDate = result.data.getDate();

  // The key test: since the time is in the past, the scheduled time should be in the future
  assert(scheduledDate.getTime() > now.getTime());

  // Should match the specified hour and minute
  assertEquals(scheduledDate.getHours(), pastHour);
  assertEquals(scheduledDate.getMinutes(), pastMinute);
});

Deno.test("ValidatedTime: create() - current time with buffer (next day)", () => {
  // Create a time that's very close to current time (should be scheduled for tomorrow due to 30s buffer)
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const timeStr = `${currentHour.toString().padStart(2, "0")}:${
    currentMinute.toString().padStart(2, "0")
  }`;

  const result = ValidatedTime.create(timeStr);

  assert(result.ok);
  const scheduledDate = result.data.getDate();

  // Due to 30-second buffer, should be scheduled for tomorrow
  const expectedDate = new Date(now);
  expectedDate.setDate(expectedDate.getDate() + 1);

  assertEquals(scheduledDate.getDate(), expectedDate.getDate());
  assertEquals(scheduledDate.getMonth(), expectedDate.getMonth());
  assertEquals(scheduledDate.getFullYear(), expectedDate.getFullYear());
});

Deno.test("ValidatedTime: create() - scheduling logic consistency", () => {
  // Test that scheduling logic is consistent across multiple calls
  const timeStr = "15:30";

  const result1 = ValidatedTime.create(timeStr);
  const result2 = ValidatedTime.create(timeStr);

  assert(result1.ok);
  assert(result2.ok);

  const date1 = result1.data.getDate();
  const date2 = result2.data.getDate();

  // Both should schedule for the same absolute time
  assertEquals(date1.getTime(), date2.getTime());
  assertEquals(date1.getHours(), 15);
  assertEquals(date1.getMinutes(), 30);
  assertEquals(date2.getHours(), 15);
  assertEquals(date2.getMinutes(), 30);
});

Deno.test("ValidatedTime: create() - edge case midnight tomorrow", () => {
  // Test midnight scheduling
  const result = ValidatedTime.create("00:00");

  assert(result.ok);
  const scheduledDate = result.data.getDate();

  assertEquals(scheduledDate.getHours(), 0);
  assertEquals(scheduledDate.getMinutes(), 0);

  // Midnight should typically be scheduled for tomorrow
  const now = new Date();
  assert(scheduledDate.getTime() > now.getTime());
});

Deno.test("ValidatedTime: create() - date preservation across day boundary", () => {
  // Test that when a time is moved to next day, other date components are preserved correctly
  const now = new Date();
  const pastTimeStr = "01:00"; // Early morning time, likely in the past

  const result = ValidatedTime.create(pastTimeStr);

  assert(result.ok);
  const scheduledDate = result.data.getDate();

  assertEquals(scheduledDate.getHours(), 1);
  assertEquals(scheduledDate.getMinutes(), 0);
  assertEquals(scheduledDate.getSeconds(), 0);
  assertEquals(scheduledDate.getMilliseconds(), 0);

  // Should be in the future
  assert(scheduledDate.getTime() > now.getTime());

  // Should have proper month/year (could be next month if end of month)
  const timeDiff = scheduledDate.getTime() - now.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);

  // Should be less than 25 hours in the future (1 day + 1 hour max)
  assert(hoursDiff < 25);
  // Should be more than 0 hours in the future
  assert(hoursDiff > 0);
});
