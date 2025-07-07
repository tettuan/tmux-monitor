import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../models.ts";

Deno.test("MonitoringOptions - kill all panes option", () => {
  const options = MonitoringOptions.create(false, null, null, true);
  assertEquals(options.shouldKillAllPanes(), true);
});

Deno.test("MonitoringOptions - default kill all panes to false", () => {
  const options = MonitoringOptions.create(false, null, null);
  assertEquals(options.shouldKillAllPanes(), false);
});

Deno.test("MonitoringOptions - kill all panes with other options", () => {
  const scheduledTime = new Date();
  const options = MonitoringOptions.create(
    true,
    scheduledTime,
    "test.txt",
    true,
  );

  assertEquals(options.shouldKillAllPanes(), true);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getInstructionFile(), "test.txt");
});
