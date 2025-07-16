#!/usr/bin/env -S deno run --allow-run

// tmux capture-paneコマンドのテスト
const command = ["tmux", "capture-pane", "-t", "%2", "-p", "-S", "-10"];

console.log("Executing command:", command.join(" "));

try {
  const process = new Deno.Command(command[0], {
    args: command.slice(1),
    stdout: "piped",
    stderr: "piped",
  });

  const result = await process.output();

  if (result.success) {
    const stdout = new TextDecoder().decode(result.stdout);
    console.log("SUCCESS:");
    console.log("Output length:", stdout.length);
    console.log("Output:", JSON.stringify(stdout));
  } else {
    const stderr = new TextDecoder().decode(result.stderr);
    console.log("FAILED:");
    console.log("Exit code:", result.code);
    console.log("Stderr:", stderr);
  }
} catch (error) {
  console.log("ERROR:", error);
}
