import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../models.ts";

Deno.test("MonitoringOptions - clear panes option", () => {
  const options = MonitoringOptions.create(false, null, null, false, true);
  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.isContinuous(), false); // --clear forces one-time mode
});

Deno.test("MonitoringOptions - default clear panes to false", () => {
  const options = MonitoringOptions.create(false, null, null);
  assertEquals(options.shouldClearPanes(), false);
});

Deno.test("MonitoringOptions - clear panes with other options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "test.txt",
    false,
    true,
  );

  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getInstructionFile(), "test.txt");
});

Deno.test("MonitoringOptions - both kill and clear flags", () => {
  const options = MonitoringOptions.create(false, null, null, true, true);
  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.shouldClearPanes(), true);
});
