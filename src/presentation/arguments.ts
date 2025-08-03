import type {
  Result,
  ValidationError,
  ValidationResult,
} from "../core/types.ts";
import { MonitoringOptions, ValidatedTime } from "../core/models.ts";
import type { TimeCalculator } from "../utils/time_calculator.ts";
import { CLI_OPTIONS } from "../core/constants.ts";
import { createError } from "../core/types.ts";

// =============================================================================
// Domain Value Objects for Command Line Arguments
// =============================================================================

/**
 * Raw command line arguments value object.
 * Encapsulates the raw string array from the command line with validation.
 */
export class RawArguments {
  private constructor(private readonly args: readonly string[]) {}

  static create(args: string[]): ValidationResult<RawArguments> {
    // Validate that args is a proper array
    if (!Array.isArray(args)) {
      return {
        ok: false,
        error: createError(
          {
            kind: "ValidationFailed",
            input: String(args),
            constraint: "must be array",
          },
        ),
      };
    }

    return { ok: true, data: new RawArguments([...args]) };
  }

  getArgs(): readonly string[] {
    return this.args;
  }

  contains(option: string): boolean {
    return this.args.includes(option);
  }

  findIndex(option: string): number {
    return this.args.findIndex((arg) => arg === option);
  }

  getValueAt(index: number): string | null {
    return index >= 0 && index < this.args.length ? this.args[index] : null;
  }

  findOptionWithValue(option: string): string | null {
    const optionIndex = this.findIndex(option);
    if (optionIndex === -1 || optionIndex + 1 >= this.args.length) {
      return null;
    }
    return this.args[optionIndex + 1];
  }

  findOptionWithEquals(prefix: string): string | null {
    const arg = this.args.find((arg) => arg.startsWith(prefix));
    return arg ? arg.substring(prefix.length) : null;
  }
}

/**
 * Instruction file path value object with validation.
 */
export class InstructionFilePath {
  private constructor(private readonly path: string) {}

  static create(path: string): ValidationResult<InstructionFilePath> {
    const trimmed = path.trim();
    if (trimmed === "") {
      return {
        ok: false,
        error: createError({ kind: "EmptyInput" }),
      };
    }

    return { ok: true, data: new InstructionFilePath(trimmed) };
  }

  getValue(): string {
    return this.path;
  }
}

/**
 * Command type discriminated union representing all possible command types.
 */
export type CommandType =
  | { kind: "Help" }
  | { kind: "Monitor"; options: MonitoringOptions }
  | { kind: "ValidationError"; error: ValidationError & { message: string } };

/**
 * Command flags value object encapsulating boolean flag states.
 */
export class CommandFlags {
  private constructor(
    private readonly killAllPanes: boolean,
    private readonly clearPanes: boolean,
    private readonly clearAllPanes: boolean,
    private readonly startClaude: boolean,
    private readonly onetime: boolean,
  ) {}

  static create(
    killAllPanes: boolean = false,
    clearPanes: boolean = false,
    clearAllPanes: boolean = false,
    startClaude: boolean = false,
    onetime: boolean = false,
  ): CommandFlags {
    return new CommandFlags(
      killAllPanes,
      clearPanes,
      clearAllPanes,
      startClaude,
      onetime,
    );
  }

  getKillAllPanes(): boolean {
    return this.killAllPanes;
  }

  getClearPanes(): boolean {
    return this.clearPanes;
  }

  getClearAllPanes(): boolean {
    return this.clearAllPanes;
  }

  getStartClaude(): boolean {
    return this.startClaude;
  }

  getOnetime(): boolean {
    return this.onetime;
  }

  // Business rule: one-time mode is automatically enabled for certain operations
  isOneTime(): boolean {
    return this.onetime || this.clearPanes || this.clearAllPanes ||
      this.startClaude;
  }

  isContinuous(): boolean {
    return !this.isOneTime();
  }
}

/**
 * Parsed command arguments value object containing all validated arguments.
 */
export class ParsedCommandArguments {
  private constructor(
    private readonly scheduledTime: Date | null,
    private readonly instructionFile: string | null,
    private readonly flags: CommandFlags,
  ) {}

  static create(
    scheduledTime: Date | null,
    instructionFile: string | null,
    flags: CommandFlags,
  ): ParsedCommandArguments {
    return new ParsedCommandArguments(scheduledTime, instructionFile, flags);
  }

  getScheduledTime(): Date | null {
    return this.scheduledTime;
  }

  getInstructionFile(): string | null {
    return this.instructionFile;
  }

  getFlags(): CommandFlags {
    return this.flags;
  }

  toMonitoringOptions(): MonitoringOptions {
    return MonitoringOptions.create(
      this.flags.isContinuous(),
      this.scheduledTime,
      this.instructionFile,
      this.flags.getKillAllPanes(),
      this.flags.getClearPanes(),
      this.flags.getClearAllPanes(),
      this.flags.getStartClaude(),
    );
  }
}

// =============================================================================
// Pure Argument Parsing Functions (No Side Effects)
// =============================================================================

/**
 * Valid command line options configuration.
 */
const VALID_OPTIONS = {
  exactMatches: [
    "--help",
    "-h",
    "--onetime",
    "-o",
    "--time",
    "-t",
    "--instruction",
    "-i",
    "--clear",
    "--clear-all",
    "--kill-all-panes",
    "--start-claude",
  ] as const,
  prefixes: [
    "--time=",
    "--instruction=",
  ] as const,
} as const;

/**
 * Pure function to validate if an option is known.
 */
function isValidOption(arg: string): boolean {
  // Check exact matches
  if ((VALID_OPTIONS.exactMatches as readonly string[]).includes(arg)) {
    return true;
  }

  // Check prefixes
  return VALID_OPTIONS.prefixes.some((prefix) => arg.startsWith(prefix));
}

/**
 * Pure function to check for help request.
 */
function isHelpRequested(args: RawArguments): boolean {
  return args.contains("--help") || args.contains("-h");
}

/**
 * Pure function to extract time value from arguments.
 * If multiple time arguments are provided, the last one wins.
 */
function extractTimeValue(args: RawArguments): ValidationResult<string | null> {
  let lastTimeValue: string | null = null;
  let lastIndex = -1;

  // Check --time=HH:MM format
  const timeWithEquals = args.findOptionWithEquals("--time=");
  if (timeWithEquals !== null) {
    const index = args.getArgs().findIndex((arg) => arg.startsWith("--time="));
    if (index > lastIndex) {
      lastTimeValue = timeWithEquals;
      lastIndex = index;
    }
  }

  // Check --time HH:MM format
  const timeIndex = args.findIndex("--time");
  if (timeIndex !== -1 && timeIndex > lastIndex) {
    const timeValue = args.findOptionWithValue("--time");
    if (timeValue !== null) {
      lastTimeValue = timeValue;
      lastIndex = timeIndex;
    }
  }

  // Check -t HH:MM format
  const shortTimeIndex = args.findIndex("-t");
  if (shortTimeIndex !== -1 && shortTimeIndex > lastIndex) {
    const shortTimeValue = args.findOptionWithValue("-t");
    if (shortTimeValue !== null) {
      lastTimeValue = shortTimeValue;
      lastIndex = shortTimeIndex;
    }
  }

  return { ok: true, data: lastTimeValue };
}

/**
 * Pure function to extract instruction file value from arguments.
 */
function extractInstructionFile(
  args: RawArguments,
): ValidationResult<string | null> {
  // Check --instruction=FILE format
  const instructionWithEquals = args.findOptionWithEquals("--instruction=");
  if (instructionWithEquals !== null) {
    if (instructionWithEquals.trim() === "") {
      return { ok: true, data: null };
    }
    const fileResult = InstructionFilePath.create(instructionWithEquals);
    if (!fileResult.ok) {
      return fileResult;
    }
    return { ok: true, data: fileResult.data.getValue() };
  }

  // Check --instruction FILE format
  const instructionValue = args.findOptionWithValue("--instruction");
  if (instructionValue !== null) {
    const fileResult = InstructionFilePath.create(instructionValue);
    if (!fileResult.ok) {
      return fileResult;
    }
    return { ok: true, data: fileResult.data.getValue() };
  }

  // Check -i FILE format
  const shortInstructionValue = args.findOptionWithValue("-i");
  if (shortInstructionValue !== null) {
    const fileResult = InstructionFilePath.create(shortInstructionValue);
    if (!fileResult.ok) {
      return fileResult;
    }
    return { ok: true, data: fileResult.data.getValue() };
  }

  return { ok: true, data: null };
}

/**
 * Pure function to extract command flags from arguments.
 */
function extractFlags(args: RawArguments): CommandFlags {
  return CommandFlags.create(
    args.contains(CLI_OPTIONS.KILL_ALL_PANES),
    args.contains(CLI_OPTIONS.CLEAR),
    args.contains(CLI_OPTIONS.CLEAR_ALL),
    args.contains(CLI_OPTIONS.START_CLAUDE),
    args.contains("--onetime") || args.contains("-o"),
  );
}

/**
 * Pure function to validate unknown options.
 */
function validateKnownOptions(args: RawArguments): ValidationResult<void> {
  const unknownOptions = args.getArgs().filter((arg) =>
    arg.startsWith("-") && !isValidOption(arg)
  );

  if (unknownOptions.length > 0) {
    return {
      ok: false,
      error: createError(
        { kind: "UnknownOption", option: unknownOptions[0] },
        `Unknown option '${unknownOptions[0]}'`,
      ),
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Pure function to parse time string into Date object.
 */
function parseTimeString(
  timeStr: string | null,
  timeCalculator?: TimeCalculator,
): ValidationResult<Date | null> {
  if (timeStr === null) {
    return { ok: true, data: null };
  }

  const validatedTimeResult = ValidatedTime.create(timeStr, timeCalculator);
  if (!validatedTimeResult.ok) {
    return validatedTimeResult;
  }

  return { ok: true, data: validatedTimeResult.data.getDate() };
}

// =============================================================================
// Smart Constructor for Argument Parsing
// =============================================================================

/**
 * Smart constructor for parsing command line arguments.
 * This is a pure function that takes raw arguments and returns a CommandType.
 */
export function parseCommandLineArguments(
  rawArgs: string[],
  timeCalculator?: TimeCalculator,
): ValidationResult<CommandType> {
  // Step 1: Create validated raw arguments
  const argsResult = RawArguments.create(rawArgs);
  if (!argsResult.ok) {
    return {
      ok: false,
      error: createError(
        { kind: "ValidationFailed", constraint: "invalid arguments array" },
        "Invalid command line arguments",
      ),
    };
  }

  const args = argsResult.data;

  // Step 2: Check for help request first
  if (isHelpRequested(args)) {
    return { ok: true, data: { kind: "Help" } };
  }

  // Step 3: Validate known options
  const optionsValidation = validateKnownOptions(args);
  if (!optionsValidation.ok) {
    return {
      ok: true,
      data: { kind: "ValidationError", error: optionsValidation.error },
    };
  }

  // Step 4: Extract time value
  const timeStrResult = extractTimeValue(args);
  if (!timeStrResult.ok) {
    return {
      ok: true,
      data: { kind: "ValidationError", error: timeStrResult.error },
    };
  }

  // Step 5: Parse time string to Date
  const timeResult = parseTimeString(timeStrResult.data, timeCalculator);
  if (!timeResult.ok) {
    return {
      ok: true,
      data: { kind: "ValidationError", error: timeResult.error },
    };
  }

  // Step 6: Extract instruction file
  const instructionResult = extractInstructionFile(args);
  if (!instructionResult.ok) {
    return {
      ok: true,
      data: { kind: "ValidationError", error: instructionResult.error },
    };
  }

  // Step 7: Extract flags
  const flags = extractFlags(args);

  // Step 8: Create parsed arguments
  const parsedArgs = ParsedCommandArguments.create(
    timeResult.data,
    instructionResult.data,
    flags,
  );

  // Step 9: Convert to monitoring options
  const options = parsedArgs.toMonitoringOptions();

  return { ok: true, data: { kind: "Monitor", options } };
}

// =============================================================================
// Side Effect Functions (Separated from Pure Logic)
// =============================================================================

/**
 * Side effect function to display help message.
 * This is separated from parsing logic to maintain purity.
 */
export function displayHelpMessage(): void {
  const helpMessage = `
tmux-monitor - tmux session monitoring tool

USAGE:
    deno task start [OPTIONS]

OPTIONS:
    -h, --help              Show this help message
    -o, --onetime           Run monitoring once (default: continuous monitoring)
    -t, --time <HH:MM>      Start at specified time (e.g., --time=14:30)
    -i, --instruction <FILE> Specify instruction file
    --clear                 Clear DONE/IDLE panes (one-time execution mode)
    --clear-all             Clear all panes regardless of state (one-time execution mode)
    --kill-all-panes        Kill all worker panes
    --start-claude          Start Claude

EXAMPLES:
    # Continuous monitoring mode (default)
    deno task start

    # Run once
    deno task start --onetime

    # Start at 14:30
    deno task start --time=14:30

    # Use instruction file
    deno task start --instruction=commands.txt

    # Clear panes (one-time execution)
    deno task start --clear

    # Clear all panes (one-time execution)
    deno task start --clear-all

    # Time specification + instruction + one-time execution
    deno task start --time=09:00 --instruction=morning.txt --onetime

DESCRIPTION:
    tmux-monitor monitors panes within tmux sessions and tracks the status
    of each pane (IDLE/WORKING/DONE/UNKNOWN). In continuous monitoring mode,
    it checks pane status every 30 seconds and sends commands as needed.
    
    Monitoring targets:
    - Pane %0: Main pane (manager role)
    - Pane %1+: Worker panes

    Time specification is processed in Asia/Tokyo timezone. If a past time
    is specified, it will be interpreted as the same time on the next day.

More information:
    https://github.com/tettuan/tmux-monitor
`;

  console.log(helpMessage);
}

/**
 * Side effect function to display error message.
 */
export function displayErrorMessage(
  error: ValidationError & { message: string },
): void {
  console.error(`❌ Error: ${error.message}`);
}

/**
 * Side effect function to exit the process.
 */
export function exitProcess(code: number): void {
  Deno.exit(code);
}

// =============================================================================
// Compatibility Layer (DDD Application Service)
// =============================================================================

/**
 * Application service that bridges the gap between the old imperative API
 * and the new functional API. This maintains backward compatibility while
 * providing the benefits of the refactored design.
 */
export class ArgumentParserService {
  constructor(
    private readonly timeCalculator?: TimeCalculator,
    private readonly isTestMode: boolean = false,
  ) {}

  /**
   * Parse command line arguments and handle side effects appropriately.
   * This method maintains the same interface as the original ArgumentParser
   * but uses the pure functional implementation internally.
   */
  parse(): Result<MonitoringOptions, ValidationError & { message: string }> {
    // Get raw arguments from Deno (side effect)
    const rawArgs = Deno.args;

    // Parse using pure function
    const parseResult = parseCommandLineArguments(rawArgs, this.timeCalculator);
    if (!parseResult.ok) {
      return parseResult;
    }

    const command = parseResult.data;

    // Handle different command types with appropriate side effects
    switch (command.kind) {
      case "Help":
        // Side effect: display help
        displayHelpMessage();
        if (!this.isTestMode) {
          exitProcess(0);
        }
        return {
          ok: false,
          error: createError(
            { kind: "HelpRequested" },
            "Help requested",
          ),
        };

      case "ValidationError":
        // Side effect: display error
        displayErrorMessage(command.error);
        displayHelpMessage();
        if (!this.isTestMode) {
          exitProcess(1);
        }
        return { ok: false, error: command.error };

      case "Monitor":
        // Success case: return options
        return { ok: true, data: command.options };
    }
  }
}

// =============================================================================
// Pure Function Exports for Testing and Reuse
// =============================================================================

export {
  extractFlags,
  extractInstructionFile,
  extractTimeValue,
  isHelpRequested,
  isValidOption,
  parseTimeString,
  validateKnownOptions,
};
// =============================================================================
// Backward Compatibility Export
// =============================================================================

/**
 * Backward compatibility wrapper for ArgumentParser.
 * Maintains the original interface while using the refactored implementation.
 */
export class ArgumentParser extends ArgumentParserService {
  // Inherits parse() method with same signature
}
