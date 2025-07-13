#!/usr/bin/env deno run --allow-run --allow-read

/**
 * Enhanced test script for IDLE detection debugging
 * 
 * This script specifically tests IDLE detection and shows debug output
 * for content comparison when panes are determined to be IDLE.
 */

import { PaneContentMonitor, PaneTitleManager } from "./src/pane_monitor.ts";
import { CommandExecutor, Logger } from "./src/services.ts";

async function testIdleDetection() {
  console.log("🔍 Testing IDLE Detection with Debug Output...");
  
  const logger = new Logger();
  const commandExecutor = new CommandExecutor();
  
  // Initialize monitoring components
  const paneMonitor = PaneContentMonitor.create(commandExecutor, logger);
  const titleManager = PaneTitleManager.create(commandExecutor, logger);
  
  // Get list of current tmux panes
  const panesResult = await commandExecutor.execute([
    "tmux",
    "list-panes",
    "-a",
    "-F",
    "#{pane_id}"
  ]);
  
  if (!panesResult.ok) {
    console.error("❌ Failed to get tmux panes:", panesResult.error.message);
    console.log("💡 Make sure tmux is running with at least one session");
    return;
  }
  
  const paneIds = panesResult.data
    .split("\n")
    .filter(line => line.trim() !== "")
    .slice(0, 2); // Test with first 2 panes for focused testing
  
  if (paneIds.length === 0) {
    console.error("❌ No tmux panes found");
    console.log("💡 Please start tmux and create at least one pane");
    return;
  }
  
  console.log(`📋 Testing IDLE detection on ${paneIds.length} panes:`, paneIds);
  console.log("\n⚠️  NOTE: Leave the panes idle (don't type) to see IDLE detection debug output");
  
  // First capture (will be IDLE by default)
  console.log("\n📸 Taking first capture...");
  let monitorResults = await paneMonitor.monitorPanes(paneIds);
  console.log("   First capture results:");
  for (const result of monitorResults) {
    console.log(`   📊 Pane ${result.paneId}: ${result.status}`);
  }
  
  // Update titles
  await titleManager.updatePaneTitles(monitorResults);
  
  // Wait and capture again - should show IDLE with debug output
  console.log("\n⏳ Waiting 3 seconds, then capturing again...");
  console.log("   (This should trigger IDLE detection with debug output)");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log("\n📸 Taking second capture (should show IDLE debug info)...");
  monitorResults = await paneMonitor.monitorPanes(paneIds);
  console.log("   Second capture results:");
  for (const result of monitorResults) {
    console.log(`   📊 Pane ${result.paneId}: ${result.status} (changes: ${result.hasChanges})`);
  }
  
  // Update titles again
  await titleManager.updatePaneTitles(monitorResults);
  
  // Third capture to see more IDLE debug output
  console.log("\n⏳ Waiting another 3 seconds for third capture...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log("\n📸 Taking third capture (more IDLE debug info)...");
  monitorResults = await paneMonitor.monitorPanes(paneIds);
  console.log("   Third capture results:");
  for (const result of monitorResults) {
    console.log(`   📊 Pane ${result.paneId}: ${result.status} (changes: ${result.hasChanges})`);
  }
  
  await titleManager.updatePaneTitles(monitorResults);
  
  console.log("\n✨ IDLE Detection Test completed!");
  console.log("📋 Check the log output above for [DEBUG-IDLE] entries");
  console.log("🏷️  Check your tmux panes - titles should show current status without duplication");
  
  // Cleanup: restore clean titles
  console.log("\n🧹 Cleaning up titles...");
  for (const paneId of paneIds) {
    await titleManager.restorePaneTitle(paneId, "tmux");
  }
  
  console.log("✅ Cleanup completed");
}

if (import.meta.main) {
  await testIdleDetection();
}
