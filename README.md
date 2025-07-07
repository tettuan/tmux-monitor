# @tmux-monitor/core

[![JSR](https://jsr.io/badges/@tmux-monitor/core)](https://jsr.io/@tmux-monitor/core)
[![JSR Score](https://jsr.io/badges/@tmux-monitor/core/score)](https://jsr.io/@tmux-monitor/core)

A comprehensive tmux monitoring tool with totality principles, real-time monitoring, and keyboard interrupt handling.

## Features

- **🎯 Totality Principles**: Type-safe design with exhaustive error handling
- **🖥️ Real-time Monitoring**: Live tmux session and pane status updates
- **⚡ Immediate Cancellation**: Any key press or Ctrl+C stops monitoring instantly
- **📅 Scheduled Execution**: Run monitoring at specific times
- **🔄 Continuous Mode**: Long-running monitoring with configurable cycles
- **🚀 CI/CD Integration**: Built-in CI environment detection
- **📝 TypeScript Support**: Full TypeScript definitions and type safety
- **🛠️ Flexible API**: Use as library or standalone application

## Installation

```bash
# Import from JSR
deno add @tmux-monitor/core
```

```typescript
import { runMonitoring, createMonitorApp } from "@tmux-monitor/core";
```

## Quick Start

### Simple Usage

```typescript
import { runMonitoring } from "@tmux-monitor/core";

// Start monitoring with default configuration
await runMonitoring();
```

### Advanced Usage

```typescript
import { 
  createMonitorApp, 
  createLogger, 
  createCommandExecutor,
  CancellationToken 
} from "@tmux-monitor/core";

// Create application instance
const app = createMonitorApp();
await app.run();

// Use individual components
const logger = createLogger();
const executor = createCommandExecutor();

// Execute tmux commands
const result = await executor.executeTmuxCommand("tmux list-sessions");
if (result.ok) {
  logger.info(`Sessions: ${result.data}`);
} else {
  logger.error("Failed to list sessions", result.error);
}
```

### Command Line Usage

```bash
# Start monitoring
deno run --allow-all jsr:@tmux-monitor/core/main

# Continuous monitoring
deno run --allow-all jsr:@tmux-monitor/core/main --continuous

# Scheduled monitoring
deno run --allow-all jsr:@tmux-monitor/core/main --time=14:30

# With instruction file
deno run --allow-all jsr:@tmux-monitor/core/main --instruction=./instructions.txt
```

## API Reference

### Core Functions

- `runMonitoring()` - Start monitoring with default configuration
- `createMonitorApp()` - Create a new Application instance
- `createLogger()` - Create a Logger instance
- `createCommandExecutor()` - Create a CommandExecutor instance

### Core Classes

- `Application` - Main application orchestrator
- `CommandExecutor` - System command execution with error handling
- `Logger` - Structured logging with multiple levels
- `CancellationToken` - Centralized cancellation management
- `KeyboardInterruptHandler` - Keyboard interrupt detection

### Configuration

- `TIMING` - Configuration constants for delays and timeouts
- `WORKER_STATUS_TYPES` - Worker status type definitions

## Examples

### Library Integration

```typescript
import { 
  createMonitorApp, 
  Logger, 
  CommandExecutor,
  type Result 
} from "@tmux-monitor/core";

class MyTmuxManager {
  private logger = new Logger();
  private executor = new CommandExecutor();

  async checkSessions(): Promise<Result<string[], any>> {
    const result = await this.executor.executeTmuxCommand("tmux list-sessions");
    if (result.ok) {
      return { ok: true, data: result.data.split('\n') };
    }
    return result;
  }

  async startMonitoring(): Promise<void> {
    this.logger.info("Starting tmux monitoring...");
    const app = createMonitorApp();
    await app.run();
  }
}
```

### Custom Cancellation

```typescript
import { CancellationToken } from "@tmux-monitor/core";

const token = new CancellationToken();

// Setup cancellation
setTimeout(() => {
  token.cancel("Timeout reached");
}, 5000);

// Use with delays
const interrupted = await token.delay(10000);
if (interrupted) {
  console.log("Operation was cancelled");
}
```

## Requirements

- Deno 1.40+
- tmux installed and available in PATH
- Terminal with raw mode support (for keyboard interrupts)

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please check the repository for contribution guidelines.
