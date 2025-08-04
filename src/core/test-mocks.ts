/**
 * Common test mocks for refactored interfaces
 */

import {
  Logger,
  LoggerConfig,
  TimeManager,
  Timestamp,
} from "../infrastructure/services.ts";
import type { Result, ValidationError } from "./types.ts";

/**
 * Mock Logger that implements the refactored Logger interface
 */
export class MockLogger extends Logger {
  public messages: Array<{ level: string; message: string; error?: Error }> =
    [];

  constructor() {
    // Create a default INFO logger config
    const config = LoggerConfig.create("INFO");
    super(config.ok ? config.data : LoggerConfig.fromEnv());
  }

  // Override methods to capture messages
  override debug(message: string): void {
    this.messages.push({ level: "DEBUG", message });
    super.debug(message);
  }

  override info(message: string): void {
    this.messages.push({ level: "INFO", message });
    super.info(message);
  }

  override warn(message: string): void {
    this.messages.push({ level: "WARN", message });
    super.warn(message);
  }

  override error(message: string, error?: Error): void {
    this.messages.push({ level: "ERROR", message, error });
    super.error(message, error);
  }

  // Helper methods for testing
  clearMessages(): void {
    this.messages = [];
  }

  getLastMessage():
    | { level: string; message: string; error?: Error }
    | undefined {
    return this.messages[this.messages.length - 1];
  }

  hasMessage(level: string, content: string): boolean {
    return this.messages.some((msg) =>
      msg.level === level && msg.message.includes(content)
    );
  }
}

/**
 * Mock TimeManager that extends the refactored TimeManager
 */
export class MockTimeManager extends TimeManager {
  private mockTime?: number;

  setMockTime(time: number): void {
    this.mockTime = time;
  }

  override getCurrentTime(): Timestamp {
    if (this.mockTime) {
      const result = Timestamp.create(this.mockTime);
      return result.ok ? result.data : super.getCurrentTime();
    }
    return super.getCurrentTime();
  }

  override getCurrentTimeISO(): string {
    return this.mockTime
      ? new Date(this.mockTime).toISOString()
      : super.getCurrentTimeISO();
  }
}

