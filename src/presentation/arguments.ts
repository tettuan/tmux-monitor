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
  ) {}

  parse(): Result<MonitoringOptions, ValidationError & { message: string }> {
    const args = Deno.args;
    let scheduledTime: Date | null = null;
    let instructionFile: string | null = null;
    let killAllPanes = false;
    let clearPanes = false;
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
      } else if (arg === CLI_OPTIONS.START_CLAUDE) {
        startClaude = true;
      }
    }

    // Check for one-time mode override (--onetime or --clear)
    const oneTime = args.includes("--onetime") || args.includes("-o") ||
      clearPanes;

    // Default to continuous monitoring mode unless --onetime or --clear is specified
    const continuous = !oneTime;

    const options = MonitoringOptions.create(
      continuous,
      scheduledTime,
      instructionFile,
      killAllPanes,
      clearPanes,
      startClaude,
    );

    return { ok: true, data: options };
  }
}
