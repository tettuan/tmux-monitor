import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringOptions } from "../models.ts";
import { globalCancellationToken } from "../cancellation.ts";

/**
 * Test suite for onetime mode exit behavior
 * 
 * This test verifies that --onetime option exits cleanly without hanging
 */

/**
 * Integration test that actually runs the CLI command
 */
Deno.test("CLI - onetime command exits within timeout", async () => {
  const timeoutMs = 15000; // 15 second timeout for CLI command
  
  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "main.ts", "--onetime"],
    stdout: "piped",
    stderr: "piped",
  });

  const startTime = Date.now();
  
  try {
    const child = command.spawn();
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        child.kill("SIGKILL"); // Force kill if timeout
        reject(new Error(`CLI command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Wait for either completion or timeout
    const result = await Promise.race([
      child.output(),
      timeoutPromise
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify the command completed successfully
    assertEquals(result.success, true, "CLI command should exit successfully");
    
    // Verify it completed within reasonable time (less than 12 seconds)
    assertEquals(duration < 12000, true, `Command took ${duration}ms, should be less than 12000ms`);
    
    console.log(`✅ CLI onetime command completed successfully in ${duration}ms`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`CLI onetime test failed: ${errorMessage}`);
  }
});

Deno.test("Application - onetime mode sets cancellation token", async () => {
  const app = new Application();
  
  // Mock the monitoring engine to avoid actual tmux calls
  const mockMonitor = {
    oneTimeMonitor: async () => {
      // Simulate successful completion
      return Promise.resolve();
    },
    startContinuousMonitoring: async () => {
      throw new Error("Should not be called in onetime mode");
    }
  };

  // Mock the container to return our mock monitor
  const originalCreateEngine = app["container"].createMonitoringEngine;
  app["container"].createMonitoringEngine = () => mockMonitor;

  // Mock the argument parser to return onetime options
  const originalParse = app["container"].get("argumentParser").parse;
  app["container"].get("argumentParser").parse = () => {
    const options = MonitoringOptions.create(false, null, null, false); // onetime mode
    return { ok: true, data: options };
  };

  // Import global cancellation token to check state
  const { globalCancellationToken } = await import("../cancellation.ts");
  
  // Reset cancellation state
  globalCancellationToken.reset();
  
  // Run the application
  await app.run();
  
  // Verify that cancellation token was set after onetime completion
  assertEquals(globalCancellationToken.isCancelled(), true);
  assertEquals(globalCancellationToken.getReason(), "Onetime monitoring completed");
  
  // Restore original methods
  app["container"].createMonitoringEngine = originalCreateEngine;
  app["container"].get("argumentParser").parse = originalParse;
});

/**
 * Integration test that actually runs the CLI command
 */
Deno.test("CLI - onetime command exits within timeout", async () => {
  const timeoutMs = 10000; // 10 second timeout for CLI command
  
  const command = new Deno.Command("deno", {
    args: ["run", "--allow-run", "main.ts", "--onetime"],
    stdout: "piped",
    stderr: "piped",
  });

  const startTime = Date.now();
  
  try {
    const child = command.spawn();
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        child.kill("SIGKILL"); // Force kill if timeout
        reject(new Error(`CLI command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Wait for either completion or timeout
    const result = await Promise.race([
      child.output(),
      timeoutPromise
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify the command completed successfully
    assertEquals(result.success, true, "CLI command should exit successfully");
    
    // Verify it completed within reasonable time (less than 8 seconds)
    assertEquals(duration < 8000, true, `Command took ${duration}ms, should be less than 8000ms`);
    
    console.log(`✅ CLI onetime command completed successfully in ${duration}ms`);
    
  } catch (error) {
    throw new Error(`CLI onetime test failed: ${error.message}`);
  }
});

/**
 * Test to verify continuous mode does NOT exit immediately
 */
Deno.test("Application - continuous mode does not exit immediately", async () => {
  const app = new Application();
  
  // Mock the monitoring engine
  let continuousStarted = false;
  const mockMonitor = {
    oneTimeMonitor: async () => {
      throw new Error("Should not be called in continuous mode");
    },
    startContinuousMonitoring: async () => {
      continuousStarted = true;
      // Simulate continuous monitoring that waits for cancellation
      const { globalCancellationToken } = await import("../cancellation.ts");
      await globalCancellationToken.delay(100); // Short delay
      return Promise.resolve();
    }
  };

  // Mock the container
  app["container"].createMonitoringEngine = () => mockMonitor;
  
  // Mock the argument parser to return continuous options
  app["container"].get("argumentParser").parse = () => {
    const options = MonitoringOptions.create(true, null, null, false); // continuous mode
    return { ok: true, data: options };
  };

  // Cancel after a short delay to allow continuous monitoring to start
  setTimeout(() => {
    const { globalCancellationToken } = require("../cancellation.ts");
    globalCancellationToken.cancel("Test cancellation");
  }, 50);

  await app.run();
  
  // Verify continuous monitoring was started
  assertEquals(continuousStarted, true, "Continuous monitoring should have started");
});
