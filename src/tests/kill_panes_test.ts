import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../models.ts";

Deno.test("MonitoringOptions - kill all panes option", () => {
  const options = MonitoringOptions.create(false, null, null, true, false);
  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), false);
});

Deno.test("MonitoringOptions - default kill all panes to false", () => {
  const options = MonitoringOptions.create(false, null, null, false, false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
});

Deno.test("MonitoringOptions - kill all panes with other options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "test.txt",
    true,
    false,
  );

  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getInstructionFile(), "test.txt");
});
