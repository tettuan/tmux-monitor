import {
  assertEquals,
  assertFalse,
  assertNotEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { CancellationToken, globalCancellationToken } from "../cancellation.ts";

Deno.test("CancellationToken - initial state", () => {
  const token = new CancellationToken();
  
  assertFalse(token.isCancelled());
  assertEquals(token.getReason(), null);
  assertEquals(token.getTimestamp(), null);
});

Deno.test("CancellationToken - cancellation", () => {
  const token = new CancellationToken();
  const reason = "Test cancellation";
  
  token.cancel(reason);
  
  assert(token.isCancelled());
  assertEquals(token.getReason(), reason);
  assertNotEquals(token.getTimestamp(), null);
});

Deno.test("CancellationToken - multiple cancellations", () => {
  const token = new CancellationToken();
  const firstReason = "First reason";
  const secondReason = "Second reason";
  
  token.cancel(firstReason);
  const firstTimestamp = token.getTimestamp();
  
  token.cancel(secondReason);
  
  assert(token.isCancelled());
  assertEquals(token.getReason(), firstReason); // Should keep first reason
  assertEquals(token.getTimestamp(), firstTimestamp); // Should keep first timestamp
});

Deno.test("CancellationToken - reset", () => {
  const token = new CancellationToken();
  
  token.cancel("Test");
  assert(token.isCancelled());
  
  token.reset();
  assertFalse(token.isCancelled());
  assertEquals(token.getReason(), null);
  assertEquals(token.getTimestamp(), null);
});

Deno.test("CancellationToken - throwIfCancelled", () => {
  const token = new CancellationToken();
  
  // Should not throw when not cancelled
  token.throwIfCancelled();
  
  // Should throw when cancelled
  token.cancel("Test error");
  
  let thrownError = false;
  try {
    token.throwIfCancelled();
  } catch (error) {
    thrownError = true;
    assert(error instanceof Error);
    assert(error.message.includes("Test error"));
  }
  
  assert(thrownError);
});

Deno.test("CancellationToken - delay without cancellation", async () => {
  const token = new CancellationToken();
  
  const startTime = Date.now();
  const cancelled = await token.delay(100);
  const endTime = Date.now();
  
  assertFalse(cancelled);
  assert(endTime - startTime >= 100);
});

Deno.test("CancellationToken - delay with cancellation", async () => {
  const token = new CancellationToken();
  
  // Cancel after 50ms
  setTimeout(() => token.cancel("Timeout"), 50);
  
  const startTime = Date.now();
  const cancelled = await token.delay(1000);
  const endTime = Date.now();
  
  assert(cancelled);
  assert(endTime - startTime < 1000);
  assert(endTime - startTime >= 50);
});

Deno.test("CancellationToken - race without cancellation", async () => {
  const token = new CancellationToken();
  
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve("success"), 100);
  });
  
  const result = await token.race(promise);
  assertEquals(result, "success");
});

Deno.test("CancellationToken - race with cancellation", async () => {
  const token = new CancellationToken();
  
  // Create a promise that will never resolve
  const promise = new Promise<string>(() => {
    // This promise will never resolve
  });
  
  // Cancel immediately
  token.cancel("Cancelled");
  
  let thrownError = false;
  try {
    await token.race(promise);
  } catch (error) {
    thrownError = true;
    assert(error instanceof Error);
    assert(error.message.includes("Cancelled"));
  }
  
  assert(thrownError, "Expected cancellation error to be thrown");
});

Deno.test("globalCancellationToken - exists", () => {
  // Just ensure the global token exists and is properly typed
  assertFalse(globalCancellationToken.isCancelled());
});

Deno.test("globalCancellationToken - reset for test isolation", () => {
  // Reset global token to ensure test isolation
  globalCancellationToken.reset();
  assertFalse(globalCancellationToken.isCancelled());
});
