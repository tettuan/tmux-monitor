# Task Completion Checklist

When completing any coding task in this project, follow these steps:

## 1. Code Quality Checks

### Format Code
```bash
deno task fmt
```
Ensures consistent code formatting across the project.

### Lint Code
```bash
deno task lint
```
Checks for code quality issues and potential bugs.

### Type Check
```bash
deno task check
```
Verifies TypeScript types are correct.

## 2. Run Tests

### Unit Tests
```bash
deno task test
```
Run all tests to ensure nothing is broken.

### Test Coverage (optional)
```bash
deno task coverage
```
Check test coverage if implementing new features.

## 3. Manual Testing

### Test the CLI
```bash
# Basic run
deno run --allow-run main.ts --onetime

# With your changes
deno run --allow-run main.ts [relevant flags]
```

## 4. Documentation

- Update JSDoc comments if changing public APIs
- Update CLAUDE.md if implementing significant features
- No need to update README.md unless explicitly requested

## 5. Version Considerations

If the change is significant:
- Consider if version bump is needed (ask user)
- Use `deno task bump:patch/minor/major`

## Important Notes

- **NEVER** commit changes unless explicitly asked
- **ALWAYS** run fmt, lint, and check before considering task complete
- If any of these commands fail, fix the issues before proceeding
- The project uses strict TypeScript - all type errors must be resolved