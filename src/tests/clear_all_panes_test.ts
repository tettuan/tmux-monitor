import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MonitoringOptions } from "../core/models.ts";

Deno.test("MonitoringOptions - clear all panes option", () => {
  const options = MonitoringOptions.create(
    false, // continuous
    null, // scheduled time
    null, // instruction file
    false, // kill all panes
    false, // clear panes
    true, // clear all panes
    false, // start claude
  );

  assertEquals(options.shouldClearAllPanes(), true);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.isContinuous(), false);
});

Deno.test("MonitoringOptions - default clear all panes to false", () => {
  const options = MonitoringOptions.create(
    true, // continuous
    null, // scheduled time
    null, // instruction file
  );

  assertEquals(options.shouldClearAllPanes(), false);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.isContinuous(), true);
});

Deno.test("MonitoringOptions - clear all panes with other options", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const options = MonitoringOptions.create(
    true, // continuous
    tomorrow, // scheduled time
    "instructions.txt", // instruction file
    false, // kill all panes
    false, // clear panes
    true, // clear all panes
    true, // start claude
  );

  assertEquals(options.shouldClearAllPanes(), true);
  assertEquals(options.shouldClearPanes(), false);
  assertEquals(options.shouldKillAllPanes(), false);
  assertEquals(options.shouldStartClaude(), true);
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getInstructionFile(), "instructions.txt");
});

Deno.test("MonitoringOptions - multiple clear options conflict", () => {
  const options = MonitoringOptions.create(
    false, // continuous
    null, // scheduled time
    null, // instruction file
    false, // kill all panes
    true, // clear panes
    true, // clear all panes
    false, // start claude
  );

  // Both clear options can be true, but clear-all takes precedence in implementation
  assertEquals(options.shouldClearAllPanes(), true);
  assertEquals(options.shouldClearPanes(), true);
  assertEquals(options.isContinuous(), false);
});
