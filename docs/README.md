# Tmux Monitor

A comprehensive tmux monitoring tool built with Deno and totality principles.

## Features

- **Totality Principles**: Type-safe design with exhaustive error handling
- **tmux Integration**: Monitor tmux sessions, panes, and their status
- **Flexible Usage**: Use as a library or standalone application
- **JSR Ready**: Published on JSR (JavaScript Registry) for easy import

## Installation

### From JSR (Recommended)

```typescript
// Import the entire library
import { createMonitorApp, runMonitoring } from "jsr:@tmux-monitor/core";

// Or import specific modules
import { Logger, CommandExecutor } from "jsr:@tmux-monitor/core";
```

### From Source

```bash
# Clone the repository
git clone https://github.com/your-username/tmux-monitor.git
cd tmux-monitor
```

## Usage

### As a Library

```typescript
import { createMonitorApp, runMonitoring, createLogger } from "jsr:@tmux-monitor/core";

// Simple usage
await runMonitoring();

// Advanced usage
const app = createMonitorApp();
await app.run();

// Use individual components
const logger = createLogger();
logger.info("Starting monitoring...");
```

### As a Standalone Application

```bash
# Run the main application
deno run --allow-all main.ts

# Or use the task runner
deno task start
```

## Prerequisites

- [Deno](https://deno.land/) 2.4.0 or higher
- tmux installed on your system

### Development

```bash
# Run in development mode with file watching
deno task dev

# Run tests
deno task test

# Format code
deno task fmt

# Lint code
deno task lint
```

## Project Structure

```
├── main.ts          # Entry point
├── mod.ts           # Module exports
├── deno.json        # Deno configuration
├── tests/           # Test files
└── docs/            # Documentation
```

## Available Commands

- `deno task start` - Run the application
- `deno task dev` - Run in development mode with file watching
- `deno task test` - Run tests
- `deno task fmt` - Format code
- `deno task lint` - Lint code

## VS Code Integration

This project is configured to work with VS Code and the Deno extension. The workspace settings are configured to:

- Enable Deno language server
- Use Deno as the TypeScript/JavaScript formatter
- Enable Deno linting
- Provide proper IntelliSense support

## GitHub Copilot Integration

This project includes GitHub Copilot instructions in `.github/copilot-instructions.md` to help provide context-aware code suggestions that follow the project's conventions and best practices.

## Continuous Integration

This project uses GitHub Actions for automated testing and publishing:

### CI Workflow
- **Formatting**: Checks code formatting with `deno fmt`
- **Linting**: Runs linter with `deno lint`
- **Type Checking**: Validates TypeScript types
- **Testing**: Runs all tests with coverage reporting
- **Publish Validation**: Ensures publish configuration is correct

### Publish Workflow
- **Selective Publishing**: Only includes `main.ts`, `mod.ts`, `src/`, and `LICENSE`
- **Excludes**: Test files, documentation, hidden files, and `CLAUDE.md`
- **Automatic**: Triggered on version tags or manual workflow dispatch
- **JSR Ready**: Publishes to JSR (JavaScript Registry)

## Version Management

This project uses automated version management:

### Version Files
- `deno.json` - Main project configuration with version
- `src/version.ts` - Version constant exported for library use

### Version Bumping
```bash
# Bump patch version (1.0.0 → 1.0.1)
deno task bump
deno task bump:patch

# Bump minor version (1.0.0 → 1.1.0)
deno task bump:minor

# Bump major version (1.0.0 → 2.0.0)
deno task bump:major
```

### Manual Version Management
```bash
# Create and push a version tag manually
git tag v1.0.0
git push origin v1.0.0

# Run full version bump script
./scripts/bump_version.sh --patch
```

The version bump script automatically:
- Performs status checks (git, CI, version consistency)
- Runs local CI tests
- Updates version in both `deno.json` and `src/version.ts`
- Commits changes and creates git tags
- Pushes to repository