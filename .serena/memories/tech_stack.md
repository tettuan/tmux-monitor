# Tech Stack

## Runtime & Language
- **Deno**: Version 2.4+ required
- **TypeScript**: Primary language with strict mode enabled
- **JSR (JavaScript Registry)**: Published as @aidevtool/tmux-monitor

## Architecture
- **Domain-Driven Design (DDD)**: Clear separation of domains (domain/, application/, infrastructure/, presentation/)
- **Dependency Injection**: DIContainer pattern for managing dependencies
- **Event-Driven Architecture**: Domain events with event dispatcher pattern
- **Value Objects & Entities**: Rich domain model with immutable value objects

## External Dependencies
- **tmux**: Core dependency for terminal multiplexer operations
- **Deno standard library**: https://deno.land/std@0.224.0 for testing assertions

## Key Libraries/Patterns
- Result/Either pattern for error handling (no exceptions)
- Totality principles (exhaustive error handling)
- CancellationToken pattern for handling interrupts
- Repository pattern for tmux operations
- Adapter pattern for infrastructure concerns