/**
 * Mock TimeCalculator for testing
 */

import type { Result, ValidationError } from "../core/types.ts";

export class MockTimeCalculator {
  private mockCurrentTime?: Date;

  setMockCurrentTime(date: Date | null): void {
    this.mockCurrentTime = date || undefined;
  }

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

    const base = baseDate || this.mockCurrentTime || new Date();
    const result = new Date(base);
    result.setHours(hour, minute, 0, 0);

    // If the time is in the past, move to next day
    if (result.getTime() <= base.getTime()) {
      result.setDate(result.getDate() + 1);
    }

    return { ok: true, data: result };
  }

  createScheduledTime(
    baseTime: Date,
    targetHour: number,
    targetMinute: number,
  ): Date {
    const scheduled = new Date(baseTime);
    scheduled.setHours(targetHour, targetMinute, 0, 0);

    // If scheduled time is in the past, move to next day
    if (scheduled.getTime() <= baseTime.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
  }

  getTimeDifference(target: Date, from?: Date): number {
    const fromTime = from || this.mockCurrentTime || new Date();
    return target.getTime() - fromTime.getTime();
  }

  formatRelativeTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  isInFuture(date: Date): boolean {
    const now = this.mockCurrentTime || new Date();
    return date.getTime() > now.getTime();
  }

  formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  getCurrentTime(): Date {
    return this.mockCurrentTime || new Date();
  }
}
