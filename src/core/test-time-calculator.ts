/**
 * Mock TimeCalculator for testing
 */

import type { Result, ValidationError } from "../core/types.ts";
import { TimeCalculator } from "../utils/time_calculator.ts";

export class MockTimeCalculator extends TimeCalculator {
  private mockCurrentTimeOverride?: Date;

  override setMockCurrentTime(date: Date | null): void {
    this.mockCurrentTimeOverride = date || undefined;
    super.setMockCurrentTime(date || new Date());
  }

  override parseTimeString(
    timeStr: string,
    baseDate?: Date,
  ): Result<Date, ValidationError & { message: string }> {
    if (!timeStr || timeStr.trim() === "") {
      return {
        ok: false,
        error: {
          kind: "EmptyInput",
          message: "Time string cannot be empty",
        },
      };
    }

    // Simple HH:MM parser for tests
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return {
        ok: false,
        error: {
          kind: "InvalidTimeFormat",
          input: timeStr,
          message: `Invalid time format: ${timeStr}. Expected HH:MM format.`,
        },
      };
    }

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return {
        ok: false,
        error: {
          kind: "InvalidTimeFormat",
          input: timeStr,
          message:
            `Invalid time values: ${timeStr}. Hour must be 0-23, minute must be 0-59.`,
        },
      };
    }

    const base = baseDate || this.mockCurrentTimeOverride || new Date();
    const result = new Date(base);
    result.setHours(hour, minute, 0, 0);

    // If the time is in the past, move to next day
    if (result.getTime() <= base.getTime()) {
      result.setDate(result.getDate() + 1);
    }

    return { ok: true, data: result };
  }
}
