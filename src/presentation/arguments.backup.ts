import type { Result, ValidationError } from "../core/types.ts";
import { MonitoringOptions, ValidatedTime } from "../core/models.ts";
import type { Logger, TimeManager } from "../infrastructure/services.ts";
import type { TimeCalculator } from "../utils/time_calculator.ts";
import { CLI_OPTIONS } from "../core/constants.ts";

// =============================================================================
// Command Line Argument Processing
// =============================================================================

/**
 * Command line argument parser for tmux monitoring application.
 *
 * Parses and validates command line arguments, converting them into
 * strongly-typed MonitoringOptions with comprehensive validation and error handling.
 *
 * @example
 * ```typescript
 * const parser = new ArgumentParser(timeManager, logger);
 * const result = parser.parse();
 * if (result.ok) {
 *   console.log("Parsed options:", result.data);
 * } else {
 *   console.error("Parse error:", result.error.message);
 * }
 * ```
 */
export class ArgumentParser {
  constructor(
    private timeManager: TimeManager,
    private logger: Logger,
    private timeCalculator?: TimeCalculator,
    private isTestMode: boolean = false,
  ) {}

  parse(): Result<MonitoringOptions, ValidationError & { message: string }> {
    const args = Deno.args;

    // Check for help flag first - if found, display help and exit
    if (args.includes("--help") || args.includes("-h")) {
      this.displayHelp();
      if (!this.isTestMode) {
        Deno.exit(0);
      }
      return {
        ok: false,
        error: {
          kind: "HelpRequested",
          message: "Help requested",
        },
      };
    }

    let scheduledTime: Date | null = null;
    let instructionFile: string | null = null;
    let killAllPanes = false;
    let clearPanes = false;
    let clearAllPanes = false;
    let startClaude = false;

    // Look for time parameter (--time=HH:MM, --time HH:MM, or -t HH:MM)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith("--time=")) {
        const timeStr = arg.substring(7);
        const parseResult = ValidatedTime.create(timeStr, this.timeCalculator);
        if (!parseResult.ok) {
          return { ok: false, error: parseResult.error };
        }
        scheduledTime = parseResult.data.getDate();
      } else if (arg === "-t" && i + 1 < args.length) {
        const timeStr = args[i + 1];
        const parseResult = ValidatedTime.create(timeStr, this.timeCalculator);
        if (!parseResult.ok) {
          return { ok: false, error: parseResult.error };
        }
        scheduledTime = parseResult.data.getDate();
      } else if (arg === "--time" && i + 1 < args.length) {
        const timeStr = args[i + 1];
        const parseResult = ValidatedTime.create(timeStr, this.timeCalculator);
        if (!parseResult.ok) {
          return { ok: false, error: parseResult.error };
        }
        scheduledTime = parseResult.data.getDate();
      } else if (arg.startsWith("--instruction=")) {
        const filePath = arg.substring(14);
        instructionFile = filePath.trim() === "" ? null : filePath;
      } else if (arg === "-i" && i + 1 < args.length) {
        instructionFile = args[i + 1];
      } else if (arg === CLI_OPTIONS.KILL_ALL_PANES) {
        killAllPanes = true;
      } else if (arg === CLI_OPTIONS.CLEAR) {
        clearPanes = true;
      } else if (arg === CLI_OPTIONS.CLEAR_ALL) {
        clearAllPanes = true;
      } else if (arg === CLI_OPTIONS.START_CLAUDE) {
        startClaude = true;
      } else if (arg.startsWith("-") && !this.isValidOption(arg)) {
        // Handle unknown options
        console.error(`❌ Error: Unknown option '${arg}'`);
        this.displayHelp();
        if (!this.isTestMode) {
          Deno.exit(1);
        }
        return {
          ok: false,
          error: {
            kind: "UnknownOption",
            option: arg,
            message: `Unknown option '${arg}'`,
          },
        };
      }
    }

    // Check for one-time mode override (--onetime, --clear, --clear-all, or --start-claude)
    const oneTime = args.includes("--onetime") || args.includes("-o") ||
      clearPanes || clearAllPanes || startClaude;

    // Default to continuous monitoring mode unless --onetime, --clear, or --start-claude is specified
    const continuous = !oneTime;

    const options = MonitoringOptions.create(
      continuous,
      scheduledTime,
      instructionFile,
      killAllPanes,
      clearPanes,
      clearAllPanes,
      startClaude,
    );

    return { ok: true, data: options };
  }

  /**
   * Check if the given argument is a valid option
   */
  private isValidOption(arg: string): boolean {
    const validOptions = [
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
    ];

    // Check exact matches
    if (validOptions.includes(arg)) {
      return true;
    }

    // Check options with = syntax
    const validPrefixes = ["--time=", "--instruction="];
    return validPrefixes.some((prefix) => arg.startsWith(prefix));
  }

  /**
   * Display help message and usage information
   */
  private displayHelp(): void {
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
}
