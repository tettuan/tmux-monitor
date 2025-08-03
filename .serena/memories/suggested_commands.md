# Suggested Commands

## Development Commands

### Running the Application
```bash
# Run with basic permissions (monitoring only)
deno run --allow-run main.ts

# Run with instruction file support
deno run --allow-run --allow-read main.ts --instruction=./startup.txt

# Development mode with watch
deno task dev

# Standard run
deno task start
```

### Testing
```bash
# Run all tests
deno task test

# Run tests with coverage
deno task coverage

# Run specific test file
deno test --allow-run --allow-env --allow-read src/core/tests/types_test.ts
```

### Code Quality
```bash
# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check
```

### Build & Deploy
```bash
# Publish to JSR
deno task publish

# CI build
deno task ci

# Version bumping
deno task bump:patch  # 1.3.15 -> 1.3.16
deno task bump:minor  # 1.3.15 -> 1.4.0
deno task bump:major  # 1.3.15 -> 2.0.0
```

## System Commands (Darwin/macOS)

### Git
- `git status` - Check current branch and changes
- `git diff` - View unstaged changes
- `git log --oneline -10` - View recent commits

### File Operations
- `ls -la` - List files with details
- `find . -name "*.ts" -type f` - Find TypeScript files
- `grep -r "pattern" src/` - Search in source files

### tmux Commands (used by the tool)
- `tmux list-sessions -F '#{session_name}'` - List sessions
- `tmux list-panes -t session -F '...'` - List panes with details
- `tmux send-keys -t pane 'command' C-m` - Send commands to pane
- `tmux capture-pane -t pane -p` - Capture pane content