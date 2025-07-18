import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../core/models.ts";

Deno.test("MonitoringOptions - start Claude option", () => {
  const options = MonitoringOptions.create(
    false, // continuous
    null, // scheduledTime
    null, // instructionFile
    false, // killAllPanes
    false, // clearPanes
    false, // clearAllPanes
    true, // startClaude
  );
  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldClearAllPanes(), false);
});

Deno.test("MonitoringOptions - default start Claude to false", () => {
  const options = MonitoringOptions.create(
    false, // continuous
    null, // scheduledTime
    null, // instructionFile
    false, // killAllPanes
    false, // clearPanes
    false, // clearAllPanes
    false, // startClaude
  );
  assertEquals(options.shouldStartClaude(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldClearAllPanes(), false);
});

Deno.test("MonitoringOptions - start Claude with other options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true, // continuous
    scheduledTime, // scheduledTime
    "test.txt", // instructionFile
    false, // killAllPanes
    false, // clearPanes
    false, // clearAllPanes
    true, // startClaude
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldClearAllPanes(), false);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "test.txt");
});

Deno.test("MonitoringOptions - all flags combined", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true, // continuous
    scheduledTime, // scheduledTime
    "instruction.txt", // instructionFile
    true, // killAllPanes
    true, // clearPanes
    true, // clearAllPanes
    true, // startClaude
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.shouldClearAllPanes(), true);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "instruction.txt");
});
