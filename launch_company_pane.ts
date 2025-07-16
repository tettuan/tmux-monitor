#!/usr/bin/env -S deno run --allow-run

import { CommandExecutor } from "./src/services.ts";

async function launchCompanyPane() {
  const executor = new CommandExecutor();

  try {
    // Create a new horizontal pane
    console.log("Creating new pane...");
    const createResult = await executor.executeTmuxCommand(
      "tmux split-window -h",
    );
    if (!createResult.ok) {
      throw new Error(`Failed to create pane: ${createResult.error.message}`);
    }

    // Get the ID of the newly created pane (it will be the active pane)
    const paneIdResult = await executor.executeTmuxCommand(
      "tmux display-message -p '#{pane_id}'",
    );
    if (!paneIdResult.ok) {
      throw new Error(`Failed to get pane ID: ${paneIdResult.error.message}`);
    }
    const paneId = paneIdResult.data.trim();
    console.log(`Created pane: ${paneId}`);

    // Set the pane title to "Company"
    console.log("Setting pane title to 'Company'...");
    const titleResult = await executor.executeTmuxCommand(
      `tmux select-pane -t ${paneId} -T "Company"`,
    );
    if (!titleResult.ok) {
      throw new Error(`Failed to set pane title: ${titleResult.error.message}`);
    }

    // Start Claude Code in the new pane
    console.log("Starting Claude Code...");
    const startResult = await executor.executeTmuxCommand(
      `tmux send-keys -t ${paneId} "cld" Enter`,
    );
    if (!startResult.ok) {
      throw new Error(
        `Failed to start Claude Code: ${startResult.error.message}`,
      );
    }

    console.log("✅ Claude Code company pane launched successfully!");
  } catch (error) {
    console.error("❌ Error launching company pane:", error);
  }
}

if (import.meta.main) {
  await launchCompanyPane();
}
