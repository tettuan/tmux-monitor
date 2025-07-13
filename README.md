# @aidevtool/tmux-monitor

[![JSR](https://jsr.io/badges/@aidevtool/tmux-monitor)](https://jsr.io/@aidevtool/tmux-monitor)
[![JSR Score](https://jsr.io/badges/@aidevtool/tmux-monitor/score)](https://jsr.io/@aidevtool/tmux-monitor)

A comprehensive tmux monitoring tool designed for command-line usage with real-time monitoring and keyboard interrupt handling.

## Features

- **🖥️ Real-time Monitoring**: Live tmux session and pane status updates
- **⚡ Immediate Cancellation**: Any key press or Ctrl+C stops monitoring instantly
- **📅 Scheduled Execution**: Run monitoring at specific times
- **🔄 Continuous Mode**: Long-running monitoring with 30-second content detection intervals
- **🚀 CI/CD Integration**: Built-in CI environment detection
- **📝 Instruction Files**: Send startup commands to main pane
- **🏷️ Smart Pane Titles**: Automatic pane title updates based on activity status
- **🔍 Content Change Detection**: 30-second interval content monitoring for WORKING/IDLE status determination
- **🛠️ Cross-platform**: Works on macOS, Linux, and Windows (with WSL)

## Quick Start - CLI Usage

The primary way to use tmux-monitor is through the CLI interface:

### Direct Execution from JSR

```bash
# Basic monitoring (continuous mode by default)
deno run --allow-run jsr:@aidevtool/tmux-monitor

# One-time monitoring (single cycle then exit)
deno run --allow-run jsr:@aidevtool/tmux-monitor --onetime

# Scheduled execution
deno run --allow-run jsr:@aidevtool/tmux-monitor --time=14:30

# With instruction file (requires read permission)
deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --instruction=./startup.txt

# Scheduled execution with instruction file (common combination)
deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --time=14:30 --instruction=./startup.txt
```

### Global Installation

```bash
# Install with specific permissions (recommended)
deno install --allow-run --allow-read -n tmux-monitor jsr:@aidevtool/tmux-monitor

# Then use anywhere
tmux-monitor
tmux-monitor --onetime
tmux-monitor --time=14:30
tmux-monitor --instruction=./startup.txt
tmux-monitor --time=14:30 --instruction=./startup.txt
```

### Available CLI Options

- `--onetime` or `-o`: Run single monitoring cycle then exit (overrides default continuous mode)
- `--time=HH:MM` or `-t HH:MM`: Schedule monitoring start time
- `--instruction=PATH` or `-i PATH`: Load instruction file with startup commands
- `--kill-all-panes`: Safely terminate all tmux panes (SIGTERM first, then SIGKILL)
- `--start-claude`: Start Claude (`cld` command) if not already running in any pane
- `--clear`: Send "/clear" command to Node.js panes only (one-time execution then exit)

## How It Works

1. **Session Discovery**: Automatically finds the most active tmux session
2. **Pane Classification**: Separates main pane (active) from target panes (inactive)
3. **Content Monitoring**: Captures pane content every 30 seconds to detect changes
4. **Status Analysis**: Compares content changes to determine WORKING/IDLE status
5. **Title Updates**: Updates pane titles with current status (e.g., "[WORKING] tmux", "[IDLE] tmux")
6. **Status Updates**: Sends status update instructions to target panes
7. **Monitoring**: Reports pane status back to main pane
8. **Display**: Shows comprehensive pane list with real-time updates

The monitoring operates on a continuous cycle with 30-second intervals for content change detection, providing real-time status updates without the need for longer monitoring cycles.

## Requirements

- **Deno**: 1.40+ (runtime)
- **tmux**: Installed and available in PATH
- **Terminal**: Raw mode support for keyboard interrupts

## Permissions

The CLI requires these specific Deno permissions:

### Essential Permissions
- `--allow-run`: Execute tmux commands (tmux list-sessions, tmux send-keys, etc.)

### Conditional Permissions
- `--allow-read`: Read instruction files (only when `--instruction` flag is used)

### Optional Permissions
- `--allow-net`: Network access for potential future features (currently unused)

### Recommended Usage

For maximum security, use specific permissions:
```bash
# Basic monitoring (most common use case)
deno run --allow-run jsr:@aidevtool/tmux-monitor

# With instruction file
deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --instruction=./startup.txt

# For global installation
deno install --allow-run --allow-read -n tmux-monitor jsr:@aidevtool/tmux-monitor
```

## Usage Examples

### Basic Monitoring

```bash
# Monitor current tmux session (minimum permissions)
deno run --allow-run jsr:@aidevtool/tmux-monitor
```

### Continuous Monitoring

```bash
# Keep monitoring until interrupted (default behavior with 30-second status checks)
deno run --allow-run jsr:@aidevtool/tmux-monitor
```

### Scheduled Execution

```bash
# Start monitoring at 2:30 PM
deno run --allow-run jsr:@aidevtool/tmux-monitor --time=14:30

# Scheduled execution with instruction file (common workflow)
deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --time=14:30 --instruction=./startup.txt
```

### With Instruction File

Create an instruction file (`startup.txt`):
```
echo "Starting monitoring..."
date
```

```bash
# Run with instruction file (requires read permission)
deno run --allow-run --allow-read jsr:@aidevtool/tmux-monitor --instruction=./startup.txt
```

### Terminate All Panes

```bash
# Safely terminate all tmux panes (SIGTERM first, then SIGKILL after 3 seconds)
deno run --allow-run jsr:@aidevtool/tmux-monitor --kill-all-panes
```

### Start Claude if Not Running

```bash
# Check if Claude is running and start it with 'cld' command if not found
# (Continuous monitoring is the default behavior with 30-second status detection)
deno run --allow-run jsr:@aidevtool/tmux-monitor --start-claude

# For one-time execution only (exit after single check)
deno run --allow-run jsr:@aidevtool/tmux-monitor --start-claude --onetime
```

## Library Usage (Advanced)

For programmatic use, import the minimal API:

```typescript
import { createMonitorApp, runMonitoring } from "@aidevtool/tmux-monitor/lib";

// Simple usage
await runMonitoring();

// Advanced usage
const app = createMonitorApp();
await app.run();
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Use appropriate permissions - `--allow-run` is essential, add `--allow-read` for instruction files
2. **tmux Not Found**: Ensure tmux is installed and in PATH
3. **No Sessions**: Start a tmux session first with `tmux new-session`
4. **Keyboard Interrupt**: Any key press will stop monitoring immediately

### Debug Mode

```bash
# Enable debug logging
DENO_LOG=debug deno run --allow-run jsr:@aidevtool/tmux-monitor
```

## Contributing

Contributions are welcome! Please check the repository for contribution guidelines.

## License

MIT License - see LICENSE file for details.
