import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../core/models.ts";

Deno.test("MonitoringOptions - start Claude option", () => {
  const options = MonitoringOptions.create(
    false,
    null,
    null,
    false,
    false,
    true,
  );
  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
});

Deno.test("MonitoringOptions - default start Claude to false", () => {
  const options = MonitoringOptions.create(
    false,
    null,
    null,
    false,
    false,
    false,
  );
  assertEquals(options.shouldStartClaude(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
});

Deno.test("MonitoringOptions - start Claude with other options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "test.txt",
    false,
    false,
    true,
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "test.txt");
});

Deno.test("MonitoringOptions - all flags combined", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "instruction.txt",
    true,
    true,
    true,
  );

  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), "instruction.txt");
});
