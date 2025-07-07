import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CIManager } from "../ci.ts";

// Mock Logger
class MockLogger {
  info = (msg: string) => console.log(`INFO: ${msg}`);
  error = (msg: string) => console.error(`ERROR: ${msg}`);
  warn = (msg: string) => console.warn(`WARN: ${msg}`);
}

// Mock CommandExecutor
class MockCommandExecutor {
  execute = (_command: string[]) => {
    return Promise.resolve({ ok: true as const, data: "mock output" });
  };

  executeTmuxCommand = (_command: string) => {
    return Promise.resolve({ ok: true as const, data: "mock output" });
  };

  killAllPanes = () => {
    return Promise.resolve({ ok: true as const, data: "mock kill all panes" });
  };
}

Deno.test("CIManager - create", () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());
  assertExists(manager);
});

Deno.test("CIManager - detectCIEnvironment CI環境なし", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // CI環境変数をクリアして保存
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
    // 元の環境変数を復元
    for (const [key, value] of originalVars) {
      Deno.env.set(key, value);
    }
  }
});

Deno.test("CIManager - detectCIEnvironment CI環境あり", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // CI環境変数を設定
  Deno.env.set("CI", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // 環境変数をクリア
  Deno.env.delete("CI");
});

Deno.test("CIManager - detectCIEnvironment GitHub Actions", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // GitHub Actions環境変数を設定
  Deno.env.set("GITHUB_ACTIONS", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // 環境変数をクリア
  Deno.env.delete("GITHUB_ACTIONS");
});

Deno.test("CIManager - detectCIEnvironment 複数のCI環境変数", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  // 複数のCI環境変数を設定
  Deno.env.set("CI", "true");
  Deno.env.set("GITLAB_CI", "true");

  const result = await manager.detectCIEnvironment();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, true);
  }

  // 環境変数をクリア
  Deno.env.delete("CI");
  Deno.env.delete("GITLAB_CI");
});

Deno.test("CIManager - handleCIMonitoring", async () => {
  const manager = CIManager.create(new MockCommandExecutor(), new MockLogger());

  const result = await manager.handleCIMonitoring();

  assertEquals(result.ok, true);
});

Deno.test("CIManager - CI環境検出の主要なプロバイダー", async () => {
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
    // 環境変数を設定
    Deno.env.set(provider, "true");

    const result = await manager.detectCIEnvironment();

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.data, true);
    }

    // 環境変数をクリア
    Deno.env.delete(provider);
  }
});
