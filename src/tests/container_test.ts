import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIContainer } from "../container.ts";
import type { ArgumentParser } from "../arguments.ts";

Deno.test("DIContainer - singleton pattern", () => {
  const container1 = DIContainer.getInstance();
  const container2 = DIContainer.getInstance();
  assertEquals(container1, container2);
});

Deno.test("DIContainer - initialization", () => {
  const container = DIContainer.getInstance();
  container.initialize();

  // Test that basic services are registered
  const logger = container.get("logger");
  assertExists(logger);

  const commandExecutor = container.get("commandExecutor");
  assertExists(commandExecutor);
});

Deno.test("DIContainer - argumentParser dependency", () => {
  const container = DIContainer.getInstance();
  container.initialize();

  const argumentParser = container.get<ArgumentParser>("argumentParser");
  assertExists(argumentParser);

  // Test parsing with no arguments
  const result = argumentParser.parse();
  assertExists(result);
  assertEquals(result.ok, true);
});
