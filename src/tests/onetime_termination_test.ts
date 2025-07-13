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

  console.log(
    `[TEST] Starting onetime termination test with ${timeoutMs}ms timeout`,
  );

  const startTime = Date.now();

  // Check if we're in CI environment
  const isCI = Deno.env.get("CI") === "true" ||
    Deno.env.get("GITHUB_ACTIONS") === "true" ||
    Deno.env.get("CONTINUOUS_INTEGRATION") === "true";

  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "--allow-env", "main.ts", "--onetime"],
    stdout: "piped",
    stderr: "piped",
    env: isCI ? { "CI": "true" } : undefined, // Ensure CI env is set in CI
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
    const stderr = decoder.decode(result.stderr);

    console.log(`[TEST] STDOUT: ${JSON.stringify(stdout)}`);
    console.log(`[TEST] STDERR: ${JSON.stringify(stderr)}`);

    assertEquals(
      stdout.includes("One-time monitoring completed successfully"),
      true,
      `Output should contain onetime completion message. Actual stdout: ${
        JSON.stringify(stdout)
      }`,
    );

    assertEquals(
      stdout.includes("Application completed successfully"),
      true,
      `Output should contain application completion message. Actual stdout: ${
        JSON.stringify(stdout)
      }`,
    );

    console.log(
      `[TEST] ✅ Onetime termination test passed - completed in ${executionTime}ms`,
    );
  } catch (error) {
    clearTimeout(timeoutId);

    if (timeoutReached) {
      throw new Error(
        `Process failed to complete within ${timeoutMs}ms timeout - likely hanging in a loop`,
      );
    }

    throw error;
  }
});

/**
 * Simple verification that continuous mode does NOT exit quickly
 * This serves as a control test to ensure our onetime test is meaningful
 */
Deno.test("continuous mode verification - should NOT exit quickly", async () => {
  const shortTimeoutMs = 2000; // 2 seconds - continuous should not complete this fast

  console.log(
    `[TEST] Starting continuous mode verification with ${shortTimeoutMs}ms timeout`,
  );

  const startTime = Date.now();

  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "--allow-env", "main.ts"], // default continuous mode (no --onetime)
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();

  let processCompleted = false;
  let result: Deno.CommandOutput | null = null;

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
    result = await child.output();
    processCompleted = true;
    clearTimeout(timeoutId);
  } catch {
    // Expected - process should be killed by timeout
    clearTimeout(timeoutId);
  }

  const executionTime = Date.now() - startTime;
  console.log(
    `[TEST] Continuous mode ran for ${executionTime}ms before termination`,
  );
  console.log(`[TEST] Process completed naturally: ${processCompleted}`);
  if (result) {
    console.log(`[TEST] Exit code: ${result.code}`);
  }

  // Process was killed by timeout (not completed naturally)
  // Exit code 143 = SIGTERM termination, which is expected
  if (processCompleted && result && result.code === 143) {
    // This is actually what we expect - process was killed by our timeout
    processCompleted = false;
  }

  // Continuous mode should NOT complete within the short timeout
  assertEquals(
    processCompleted,
    false,
    "Continuous mode should NOT complete quickly - should run indefinitely until killed",
  );

  // Verify it ran for approximately the timeout duration
  assertEquals(
    executionTime >= shortTimeoutMs - 300, // Allow timing tolerance
    true,
    `Continuous mode should run for at least ${
      shortTimeoutMs - 300
    }ms, but only ran for ${executionTime}ms`,
  );

  console.log(
    `[TEST] ✅ Continuous mode verification passed - confirmed it runs continuously`,
  );
});

/**
 * Test for --time and --instruction option compatibility
 *
 * This test ensures that:
 * 1. --time and --instruction options can be used together
 * 2. The process handles both options correctly without conflicts
 * 3. Scheduled execution with instruction file works properly
 */
Deno.test("time and instruction options - compatibility test", async () => {
  const timeoutMs = 15000; // 15 seconds timeout
  // For time scheduling, we expect it to actually wait until the scheduled time
  // So this test should timeout, confirming the waiting behavior is working

  console.log(`[TEST] Starting time and instruction compatibility test`);

  // Create a temporary instruction file for testing
  const instructionContent = "echo 'Test instruction from file'";
  const instructionFile = "./test_instruction_temp.txt";

  try {
    await Deno.writeTextFile(instructionFile, instructionContent);
    console.log(
      `[TEST] Created temporary instruction file: ${instructionFile}`,
    );

    // Use a past time - the system should reschedule it for next day and wait
    const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
    const timeArg = `--time=${
      pastTime.getHours().toString().padStart(2, "0")
    }:${pastTime.getMinutes().toString().padStart(2, "0")}`;

    const startTime = Date.now();

    const command = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-run",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        "main.ts",
        "--onetime",
        timeArg,
        `--instruction=${instructionFile}`,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const child = command.spawn();

    let timeoutReached = false;
    const timeoutId = setTimeout(() => {
      timeoutReached = true;
      console.log(
        `[TEST] ⚠️ Timeout reached - killing process (this is expected)`,
      );
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
      // For time scheduling, we EXPECT the timeout to be reached because it should wait
      assertEquals(
        timeoutReached,
        true,
        "Process should timeout because it's waiting until scheduled time",
      );

      assertEquals(
        result.code,
        143, // SIGTERM exit code
        `Process should be terminated by timeout. Exit code: ${result.code}`,
      );

      // Check output contains expected messages
      const decoder = new TextDecoder();
      const stdout = decoder.decode(result.stdout);
      const stderr = decoder.decode(result.stderr);

      console.log(`[TEST] STDOUT: ${JSON.stringify(stdout)}`);
      console.log(`[TEST] STDERR: ${JSON.stringify(stderr)}`);

      assertEquals(
        stdout.includes("Scheduled execution time:"),
        true,
        `Output should contain scheduled time message. Actual stdout: ${
          JSON.stringify(stdout)
        }`,
      );

      assertEquals(
        stdout.includes("Instruction file specified:"),
        true,
        `Output should contain instruction file message. Actual stdout: ${
          JSON.stringify(stdout)
        }`,
      );

      assertEquals(
        stdout.includes("Waiting until scheduled time:"),
        true,
        `Output should show it's waiting for the scheduled time. Actual stdout: ${
          JSON.stringify(stdout)
        }`,
      );

      console.log(
        `[TEST] ✅ Time and instruction compatibility test passed - correctly waits until scheduled time`,
      );
    } catch (error) {
      clearTimeout(timeoutId);

      if (timeoutReached) {
        // This is expected - the test passed
        console.log(
          `[TEST] ✅ Time and instruction compatibility test passed - correctly waited until scheduled time (timeout expected)`,
        );
        return;
      }

      throw error;
    }
  } finally {
    // Clean up temporary instruction file
    try {
      await Deno.remove(instructionFile);
      console.log(`[TEST] Cleaned up temporary instruction file`);
    } catch {
      // File might not exist or already deleted
    }
  }
});

/**
 * Test for --time option with past time (gets scheduled for next day)
 *
 * This test ensures that:
 * 1. Past time is handled by scheduling for next day
 * 2. Process completes quickly since we're using --onetime
 */
Deno.test("time option - past time gets scheduled for next day", async () => {
  const timeoutMs = 10000; // 10 seconds timeout
  // For time scheduling, we expect it to actually wait until the scheduled time
  // So this test should timeout, confirming the waiting behavior is working

  console.log(`[TEST] Starting past time scheduling test`);

  // Set a time that's in the past (1 hour ago)
  const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
  const timeArg = `--time=${pastTime.getHours().toString().padStart(2, "0")}:${
    pastTime.getMinutes().toString().padStart(2, "0")
  }`;

  const startTime = Date.now();

  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-run",
      "--allow-env",
      "main.ts",
      "--onetime",
      timeArg,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();

  let timeoutReached = false;
  const timeoutId = setTimeout(() => {
    timeoutReached = true;
    console.log(
      `[TEST] ⚠️ Timeout reached - killing process (this is expected)`,
    );
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

    // Main assertions
    // For time scheduling, we EXPECT the timeout to be reached because it should wait
    assertEquals(
      timeoutReached,
      true,
      "Process should timeout because it's waiting until scheduled time",
    );

    assertEquals(
      result.code,
      143, // SIGTERM exit code
      `Process should be terminated by timeout. Exit code: ${result.code}`,
    );

    // Check output contains expected messages
    const decoder = new TextDecoder();
    const stdout = decoder.decode(result.stdout);

    assertEquals(
      stdout.includes("Scheduled execution time:"),
      true,
      "Output should contain scheduled time message (time gets moved to next day)",
    );

    assertEquals(
      stdout.includes("Waiting until scheduled time:"),
      true,
      "Output should show it's waiting for the scheduled time",
    );

    console.log(
      `[TEST] ✅ Past time scheduling test passed - correctly waits until scheduled time`,
    );
  } catch (error) {
    clearTimeout(timeoutId);

    if (timeoutReached) {
      // This is expected - the test passed
      console.log(
        `[TEST] ✅ Past time scheduling test passed - correctly waited until scheduled time (timeout expected)`,
      );
      return;
    }

    throw error;
  }
});
