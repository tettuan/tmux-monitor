import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../../core/models.ts";

// 単純なMonitoringOptionsのテストのみに集中
Deno.test("ArgumentParser - start-claude flag creates correct MonitoringOptions", () => {
  // MonitoringOptions.createメソッドを直接テスト
  const options = MonitoringOptions.create(
    false,
    null,
    null,
    false,
    false,
    false,
    true,
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.isContinuous(), false);
});

Deno.test("ArgumentParser - start-claude with continuous monitoring", () => {
  const options = MonitoringOptions.create(
    true,
    null,
    null,
    false,
    false,
    false,
    true,
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.isContinuous(), true);
});

Deno.test("ArgumentParser - all options combined", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "test.txt",
    true,
    true,
    false,
    true,
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "test.txt");
});
