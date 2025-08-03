# Code Style and Conventions

## Language Settings
- **TypeScript** with strict mode enabled
- **Deno** formatter and linter are used

## File Organization
- **File naming**: snake_case for files (e.g., `monitoring_service.ts`, `time_calculator.ts`)
- **Test files**: Located alongside implementation files with `_test.ts` suffix
- **Directory structure**: Domain-driven with clear separation:
  - `src/core/`: Core types, models, constants
  - `src/domain/`: Domain entities, value objects, domain services
  - `src/application/`: Application services, orchestrators
  - `src/infrastructure/`: External integrations, adapters
  - `src/presentation/`: CLI interface, argument parsing
  - `src/utils/`: Utility functions

## Code Conventions
- **Classes**: PascalCase (e.g., `MonitoringEngine`, `PaneAdapter`)
- **Interfaces**: PascalCase with 'I' prefix for some (e.g., `ITmuxRepository`, `ILogger`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `PANE_CONFIG`, `TIMING`)
- **Functions/Methods**: camelCase
- **Private members**: Prefixed with underscore (e.g., `_logger`, `_appService`)

## Error Handling
- **No exceptions**: Uses Result<T, E> pattern
- **ValidationError** type for all errors
- **Totality principles**: All possible states handled explicitly

## Documentation
- JSDoc comments for public APIs
- File headers with @fileoverview
- No inline comments unless explicitly requested

## Testing
- Tests use Deno's built-in test runner
- Test files follow pattern: `Deno.test("Component - test case description") callback`
- Mock implementations for testing (e.g., `MockLogger`, `MockCommandExecutor`)

## Japanese Comments
- Some test files contain Japanese comments/descriptions (維持すべき)