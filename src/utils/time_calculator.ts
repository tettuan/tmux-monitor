import type { Result, ValidationError } from "../core/types.ts";

/**
 * Time calculation utility class for handling timezone-aware time operations.
 *
 * This class provides timezone-safe time calculation methods to prevent
 * common timezone-related issues in scheduling and time manipulation.
 *
 * @example
 * ```typescript
 * const calculator = new TimeCalculator();
 * const result = calculator.parseTimeString("14:30");
 * if (result.ok) {
 *   console.log("Scheduled time:", result.data);
 * }
 * ```
 */
export class TimeCalculator {
  private mockCurrentTime?: Date;

  /**
   * Set a mock current time for testing purposes.
   * When set, getCurrentTime() will return this time instead of the real current time.
   *
   * @param mockTime - Fixed time to return, or null to disable mocking
   */
  setMockCurrentTime(mockTime: Date | null): void {
    this.mockCurrentTime = mockTime || undefined;
  }

  /**
   * Parse a time string (HH:MM format) and create a Date object for the next occurrence.
   * Handles timezone properly by using local time consistently.
   *
   * @param timeStr - Time string in HH:MM format
   * @param baseDate - Base date to calculate from (defaults to current time)
   * @returns Result containing the calculated Date or validation error
   */
  parseTimeString(
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

    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      return {
        ok: false,
        error: {
          kind: "InvalidTimeFormat",
          message: `Invalid time format: ${timeStr}. Expected HH:MM format.`,
          input: timeStr,
        },
      };
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return {
        ok: false,
        error: {
          kind: "InvalidTimeFormat",
          message:
            `Invalid time values: hours=${hours}, minutes=${minutes}. Hours must be 0-23, minutes must be 0-59.`,
          input: timeStr,
        },
      };
    }

    const now = baseDate || this.getCurrentTime();
    const scheduledTime = this.createScheduledTime(now, hours, minutes);

    return { ok: true, data: scheduledTime };
  }

  /**
   * Create a scheduled time based on a base date and target time.
   * Ensures the scheduled time is in the future relative to the base date.
   *
   * @param baseDate - Base date to calculate from
   * @param hours - Target hours (0-23)
   * @param minutes - Target minutes (0-59)
   * @returns Date object representing the next occurrence of the specified time
   */
  createScheduledTime(
    baseDate: Date,
    hours: number,
    minutes: number,
  ): Date {
    // Create a new Date object in the same timezone as baseDate
    const scheduledTime = new Date(baseDate.getTime());

    // Set the time components
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If the scheduled time is not in the future, move to next day
    if (scheduledTime.getTime() <= baseDate.getTime()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    return scheduledTime;
  }

  /**
   * Get the time difference in milliseconds between two dates.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Time difference in milliseconds
   */
  getTimeDifference(startDate: Date, endDate: Date): number {
    return endDate.getTime() - startDate.getTime();
  }

  /**
   * Check if a given time is in the future relative to a base time.
   *
   * @param targetTime - Time to check
   * @param baseTime - Base time to compare against (defaults to current time)
   * @returns True if target time is in the future
   */
  isInFuture(
    targetTime: Date,
    baseTime?: Date,
  ): boolean {
    const base = baseTime || this.getCurrentTime();
    return targetTime.getTime() > base.getTime();
  }

  /**
   * Format a date to HH:MM string in local timezone.
   *
   * @param date - Date to format
   * @returns Formatted time string
   */
  formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  /**
   * Get the current date/time in a consistent manner.
   * This method provides a single point for time retrieval that can be easily mocked in tests.
   *
   * @returns Current date/time (or mock time if set)
   */
  getCurrentTime(): Date {
    return this.mockCurrentTime || new Date();
  }
}

/**
 * Default instance of TimeCalculator for general use.
 * Can be used directly for most time calculation needs.
 */
export const timeCalculator = new TimeCalculator();
