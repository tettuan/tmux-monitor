# Design Patterns and Guidelines

## Domain-Driven Design (DDD)
The project follows DDD principles with clear boundaries:
- **Entities**: Mutable domain objects with identity (e.g., `Pane`)
- **Value Objects**: Immutable objects (e.g., `PaneId`, `ValidatedTime`, `WorkerStatus`)
- **Domain Services**: Business logic that doesn't belong to entities
- **Application Services**: Orchestrate domain objects and infrastructure
- **Infrastructure**: External concerns isolated behind interfaces

## Key Patterns

### Result Pattern
- No exceptions thrown - all errors handled via `Result<T, E>`
- Pattern: `Result<SuccessType, ValidationError>`
- Check with `result.success` boolean
- Access via `result.value` or `result.error`

### Dependency Injection
- Central `DIContainer` manages all dependencies
- Singleton pattern for shared services
- Lazy initialization of components

### Repository Pattern
- `ITmuxRepository` interface for tmux operations
- Implementations in infrastructure layer
- Domain stays pure without external dependencies

### Event-Driven Architecture
- Domain events for state changes
- `EventDispatcher` publishes events
- Handlers registered for specific event types
- Events: status changes, title updates, cycle completion

### Totality Principles
- All possible states explicitly handled
- No partial functions
- Exhaustive pattern matching
- Every error has a defined type

## Anti-Patterns to Avoid
- Direct tmux command execution in domain
- Throwing exceptions (use Result type)
- Mutable value objects
- Business logic in infrastructure layer
- Tight coupling between layers