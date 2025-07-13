#!/usr/bin/env deno run --allow-run --allow-read

/**
 * Test script for pane monitoring functionality
 * 
 * This script tests the new 30-second pane content monitoring feature
 * that tracks pane changes and updates titles accordingly.
 */

import { PaneContentMonitor, PaneTitleManager } from "./src/pane_monitor.ts";
import { CommandExecutor, Logger } from "./src/services.ts";

async function testPaneMonitoring() {
  console.log("🔍 Testing Pane Content Monitoring...");
  
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
    .slice(0, 3); // Test with first 3 panes
  
  if (paneIds.length === 0) {
    console.error("❌ No tmux panes found");
    console.log("💡 Please start tmux and create at least one pane");
    return;
  }
  
  console.log(`📋 Found ${paneIds.length} panes to monitor:`, paneIds);
  
  // Test content capture
  console.log("\n🔍 Testing content capture...");
  for (const paneId of paneIds) {
    const captureResult = await paneMonitor.capturePane(paneId);
    if (captureResult.ok) {
      const content = captureResult.data.content;
      const lineCount = content.split('\n').length;
      console.log(`✅ Pane ${paneId}: captured ${lineCount} lines`);
    } else {
      console.log(`❌ Pane ${paneId}: ${captureResult.error.message}`);
    }
  }
  
  // Test monitoring (comparison)
  console.log("\n⏱️  Testing 30-second monitoring cycle...");
  console.log("   Initial capture (will default to IDLE)...");
  
  let monitorResults = await paneMonitor.monitorPanes(paneIds);
  console.log("   First monitoring results:");
  for (const result of monitorResults) {
    console.log(`   📊 Pane ${result.paneId}: ${result.status} (changes: ${result.hasChanges})`);
  }
  
  // Update titles with initial status
  console.log("\n🏷️  Updating pane titles...");
  await titleManager.updatePaneTitles(monitorResults);
  
  // Wait and monitor again to test comparison
  console.log("\n⏳ Waiting 5 seconds then monitoring again...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  monitorResults = await paneMonitor.monitorPanes(paneIds);
  console.log("   Second monitoring results:");
  for (const result of monitorResults) {
    console.log(`   📊 Pane ${result.paneId}: ${result.status} (changes: ${result.hasChanges})`);
  }
  
  // Update titles again
  await titleManager.updatePaneTitles(monitorResults);
  
  console.log("\n✨ Test completed!");
  console.log("💡 Check your tmux panes - their titles should now show [WORKING] or [IDLE]");
  console.log("💡 Try typing in the panes and run this test again to see status changes");
  
  // Wait a bit then restore titles
  console.log("\n⏳ Waiting 3 seconds then restoring original titles...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Get original titles and restore them
  for (const paneId of paneIds) {
    await titleManager.restorePaneTitle(paneId, "tmux");
  }
  
  console.log("✅ Original titles restored");
}

if (import.meta.main) {
  await testPaneMonitoring();
}
