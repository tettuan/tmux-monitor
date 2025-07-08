import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Test for --onetime option termination behavior
 * 
 * This test ensures that:
 * 1. --onetime option completes within a reasonable time limit
 * 2. The process terminates normally (not via timeout)
 * 3. The application returns proper exit codes
 */

Deno.test("onetime option - confirms normal termination within timeout", async () => {
  const timeoutMs = 10000; // 10 seconds timeout - generous for CI environments
  const maxExpectedTimeMs = 5000; // Should complete within 5 seconds normally

  console.log(`[TEST] Starting onetime termination test with ${timeoutMs}ms timeout`);

  const startTime = Date.now();

  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "main.ts", "--onetime"],
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  
  // Simple timeout check without complex Promise racing
  let timeoutReached = false;
  const timeoutId = setTimeout(() => {
    timeoutReached = true;
    console.log(`[TEST] ⚠️ Timeout reached - killing process`);
    try {
      child.kill("SIGTERM");
    } catch {
      // Process might already be terminated
    }
  }, timeoutMs);

  try {
    const result = await child.output();
    const executionTime = Date.now() - startTime;
    
    clearTimeout(timeoutId);

    console.log(`[TEST] Process completed in ${executionTime}ms`);
    console.log(`[TEST] Exit code: ${result.code}`);
    console.log(`[TEST] Timeout reached: ${timeoutReached}`);

    // Main assertions
    assertEquals(
      timeoutReached,
      false,
      "Process should complete before timeout (not hang indefinitely)",
    );

    assertEquals(
      result.success,
      true,
      `Process should exit successfully. Exit code: ${result.code}`,
    );

    assertEquals(
      executionTime < maxExpectedTimeMs,
      true,
      `Process should complete within ${maxExpectedTimeMs}ms, but took ${executionTime}ms`,
    );

    assertEquals(
      result.code,
      0,
      `Process should exit with code 0, but got ${result.code}`,
    );

    // Check output contains expected messages
    const decoder = new TextDecoder();
    const stdout = decoder.decode(result.stdout);
    
    assertEquals(
      stdout.includes("One-time monitoring completed successfully"),
      true,
      "Output should contain onetime completion message",
    );

    assertEquals(
      stdout.includes("Application completed successfully"),
      true,
      "Output should contain application completion message",
    );

    console.log(`[TEST] ✅ Onetime termination test passed - completed in ${executionTime}ms`);

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (timeoutReached) {
      throw new Error(`Process failed to complete within ${timeoutMs}ms timeout - likely hanging in a loop`);
    }
    
    throw error;
  }
});

/**
 * Simple verification that continuous mode does NOT exit quickly
 * This serves as a control test to ensure our onetime test is meaningful
 */
Deno.test("continuous mode verification - should NOT exit quickly", async () => {
  const shortTimeoutMs = 1500; // 1.5 seconds - continuous should not complete this fast

  console.log(`[TEST] Starting continuous mode verification with ${shortTimeoutMs}ms timeout`);

  const startTime = Date.now();

  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "main.ts"], // default continuous mode
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  
  let processCompleted = false;
  
  // Set timeout to kill process
  const timeoutId = setTimeout(() => {
    console.log(`[TEST] Killing continuous mode process after timeout`);
    try {
      child.kill("SIGTERM");
    } catch {
      // Process might already be terminated
    }
  }, shortTimeoutMs);

  try {
    await child.output();
    processCompleted = true;
    clearTimeout(timeoutId);
  } catch {
    // Expected - process should be killed by timeout
    clearTimeout(timeoutId);
  }

  const executionTime = Date.now() - startTime;
  console.log(`[TEST] Continuous mode ran for ${executionTime}ms before termination`);

  // Continuous mode should NOT complete within the short timeout
  assertEquals(
    processCompleted,
    false,
    "Continuous mode should NOT complete quickly - should run indefinitely",
  );

  // Verify it ran for approximately the timeout duration
  assertEquals(
    executionTime >= shortTimeoutMs - 200, // Allow timing tolerance
    true,
    `Continuous mode should run for at least ${shortTimeoutMs}ms, but only ran for ${executionTime}ms`,
  );

  console.log(`[TEST] ✅ Continuous mode verification passed - confirmed it runs continuously`);
});
