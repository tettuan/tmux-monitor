import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CIManager } from "../ci.ts";
import { MockCommandExecutor, MockLogger } from "../../core/test-utils.ts";

Deno.test("CIManager - create", () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());
  assertExists(manager);
});

Deno.test("CIManager - detectCIEnvironment no CI environment", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // Clear and save CI environment variables
  const originalVars = new Map<string, string>();
  const ciIndicators = [
    "CI",
    "CONTINUOUS_INTEGRATION",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "JENKINS_URL",
    "CIRCLECI",
    "TRAVIS",
    "BUILDKITE",
    "DRONE",
  ];

  for (const indicator of ciIndicators) {
    const value = Deno.env.get(indicator);
    if (value) {
      originalVars.set(indicator, value);
      Deno.env.delete(indicator);
    }
  }

  try {
    const result = await manager.detectCIEnvironment();

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.data, false);
    }
  } finally {
    // Restore original environment variables
    for (const [key, value] of originalVars) {
      Deno.env.set(key, value);
    }
  }
});

Deno.test("CIManager - detectCIEnvironment CI environment present", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // Set CI environment variable
  Deno.env.set("CI", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // Clear environment variable
  Deno.env.delete("CI");
});

Deno.test("CIManager - detectCIEnvironment GitHub Actions", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // Set GitHub Actions environment variable
  Deno.env.set("GITHUB_ACTIONS", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // Clear environment variable
  Deno.env.delete("GITHUB_ACTIONS");
});

Deno.test("CIManager - detectCIEnvironment multiple CI environment variables", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // Set multiple CI environment variables
  Deno.env.set("CI", "true");
  Deno.env.set("GITLAB_CI", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // Clear environment variables
  Deno.env.delete("CI");
  Deno.env.delete("GITLAB_CI");
});

Deno.test("CIManager - handleCIMonitoring", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  const result = await manager.handleCIMonitoring();

  assertEquals(result.ok, true);
});

Deno.test("CIManager - major CI environment provider detection", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  const ciProviders = [
    "CI",
    "CONTINUOUS_INTEGRATION",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "JENKINS_URL",
    "CIRCLECI",
    "TRAVIS",
    "BUILDKITE",
    "DRONE",
  ];

  for (const provider of ciProviders) {
    // Set environment variable
    Deno.env.set(provider, "true");

    const result = await manager.detectCIEnvironment();

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.data, true);
    }

    // Clear environment variable
    Deno.env.delete(provider);
  }
});
