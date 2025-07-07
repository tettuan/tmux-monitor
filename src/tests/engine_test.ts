import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MonitoringEngine } from "../engine.ts";

class MockCommunicator {
  sendInstructionFile = () => Promise.resolve({ ok: true, data: null });
  sendToPane = () => Promise.resolve({ ok: true, data: null });
}

class MockTimeManager {
  sleep = (_ms: number) => Promise.resolve();
  now = () => new Date();
}

class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

// Test basic functionality without full MonitoringEngine construction
Deno.test("MonitoringEngine - 基本的なクラスの存在確認", () => {
  // MonitoringEngineがインポートできることを確認
  assertExists(MonitoringEngine);
});

// Test static methods and utilities
Deno.test("Mock classes - 基本的な動作確認", () => {
  const logger = new MockLogger();
  const timeManager = new MockTimeManager();
  const communicator = new MockCommunicator();

  assertExists(logger);
  assertExists(timeManager);
  assertExists(communicator);
});

// Test async mock operations
Deno.test("Mock classes - 非同期操作確認", async () => {
  const communicator = new MockCommunicator();
  const result = await communicator.sendInstructionFile();

  assertExists(result);
});
