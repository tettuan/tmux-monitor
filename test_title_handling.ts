#!/usr/bin/env deno run --allow-run --allow-read

/**
 * Test script for title handling and preservation
 * 
 * This script tests the improved title handling logic to ensure
 * original titles are preserved correctly without being overwritten by "tmux".
 */

import { PaneTitleManager } from "./src/pane_monitor.ts";
import { CommandExecutor, Logger } from "./src/services.ts";

async function testTitleHandling() {
  console.log("🏷️  Testing Title Handling and Preservation...");
  
  const logger = new Logger();
  const commandExecutor = new CommandExecutor();
  const titleManager = PaneTitleManager.create(commandExecutor, logger);
  
  // Get a test pane
  const panesResult = await commandExecutor.execute([
    "tmux",
    "list-panes",
    "-a",
    "-F",
    "#{pane_id}:#{pane_title}"
  ]);
  
  if (!panesResult.ok) {
    console.error("❌ Failed to get tmux panes:", panesResult.error.message);
    return;
  }
  
  const paneLines = panesResult.data
    .split("\n")
    .filter(line => line.trim() !== "")
    .slice(0, 1); // Test with just one pane
  
  if (paneLines.length === 0) {
    console.error("❌ No tmux panes found");
    return;
  }
  
  const [paneId, originalTitle] = paneLines[0].split(":");
  console.log(`📋 Testing with pane ${paneId}, original title: "${originalTitle}"`);
  
  // Test 1: Clean title functionality
  console.log("\n🧹 Testing cleanTitle functionality:");
  
  const testTitles = [
    "tmux",
    "[WORKING] tmux", 
    "[IDLE] vim session",
    "[WORKING] [IDLE] complex title",
    "[TERMINATED] node app",
    "normal title without prefix",
    ""
  ];
  
  for (const testTitle of testTitles) {
    const cleaned = titleManager.cleanTitle(testTitle);
    console.log(`  "${testTitle}" → "${cleaned}"`);
  }
  
  // Test 2: Update title with original preservation
  console.log("\n🔄 Testing title updates with preservation:");
  
  // Update to WORKING
  console.log("Setting to WORKING...");
  await titleManager.updatePaneTitle(paneId, "WORKING");
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update to IDLE (should preserve the base title)
  console.log("Setting to IDLE...");
  await titleManager.updatePaneTitle(paneId, "IDLE");
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update back to WORKING (should still preserve the base title)
  console.log("Setting back to WORKING...");
  await titleManager.updatePaneTitle(paneId, "WORKING");
  
  // Test 3: Restore original title
  console.log("\n↩️  Restoring original title...");
  await titleManager.restorePaneTitle(paneId, originalTitle);
  
  console.log("✅ Title handling test completed!");
  console.log("📝 Check the debug output above for [TITLE-DEBUG] entries");
  console.log("🏷️  Check your tmux pane - title should be restored to original");
}

if (import.meta.main) {
  await testTitleHandling();
}
