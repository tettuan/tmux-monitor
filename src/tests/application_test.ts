import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Application } from "../application.ts";

Deno.test("Application - basic instantiation", () => {
  const app = new Application();
  assertExists(app);
});

Deno.test("Application - run method exists", () => {
  const app = new Application();
  assertEquals(typeof app.run, "function");
});

// Test the basic application structure without actually running it
Deno.test("Application - run method structure test", () => {
  const app = new Application();

  // Just verify the run method exists and is a function
  assertEquals(typeof app.run, "function");

  // Note: We don't call app.run() to avoid resource leaks in test environment
  // The actual functionality is tested through integration tests when tmux is available
});
