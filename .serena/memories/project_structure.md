# Project Structure

## Root Files
- `main.ts` - CLI entry point
- `mod.ts` - Library exports
- `deno.json` - Project configuration, dependencies, tasks
- `CLAUDE.md` - Project-specific instructions for AI assistants
- `README.md` - User documentation
- `LICENSE` - MIT license

## Source Organization (`src/`)

### Core (`src/core/`)
- Base types, errors, models, configuration
- `types.ts`, `models.ts`, `config.ts`, `constants.ts`
- `container.ts` - Dependency injection container
- `cancellation.ts` - Cancellation token implementation

### Domain (`src/domain/`)
- Domain entities and business logic
- `pane.ts` - Pane entity
- `value_objects.ts` - Immutable value objects
- `services.ts` - Domain services
- `events.ts` - Domain events
- `monitoring_cycle_coordinator.ts` - Cycle coordination logic

### Application (`src/application/`)
- Application services and orchestration
- `engine.ts` - Main monitoring engine
- `monitoring_service.ts` - Application service layer
- `capture_orchestrator.ts` - Capture coordination

### Infrastructure (`src/infrastructure/`)
- External integrations and adapters
- `services.ts` - Logger, CommandExecutor, TimeManager
- `session.ts` - tmux session management
- `communication.ts` - Pane communication
- `adapters.ts` - Infrastructure adapter factory

### Presentation (`src/presentation/`)
- CLI interface
- `application.ts` - Main application class
- `arguments.ts` - CLI argument parsing
- `display.ts` - Pane display formatting

### Utils (`src/utils/`)
- Utility functions
- `time_calculator.ts` - Time calculation utilities
- `pane_utils.ts` - Pane ID manipulation

## Test Files
- Unit tests alongside implementation (`*_test.ts`)
- Integration tests in `tests/` directory
- Test utilities in `src/core/test-utils.ts`

## Other Directories
- `scripts/` - Shell scripts for version bumping
- `.github/` - GitHub Actions workflows
- `docs/` - Additional documentation
- `.serena/` - Serena tool configuration