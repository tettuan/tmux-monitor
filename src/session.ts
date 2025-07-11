import { createError, type Result, type ValidationError } from "./types.ts";
import { PaneDetail } from "./models.ts";
import type { CommandExecutor, Logger } from "./services.ts";

/**
 * Tmux session management class for session discovery and pane enumeration.
 *
 * Handles tmux session discovery, finding the most active session, and
 * retrieving detailed pane information for monitoring operations.
 *
 * @example
 * ```typescript
 * const session = TmuxSession.create(commandExecutor, logger);
 * const activeSessionResult = await session.findMostActiveSession();
 * if (activeSessionResult.ok) {
 *   const panesResult = await session.listPaneDetails(activeSessionResult.data);
 * }
 * ```
 */
export class TmuxSession {
  private constructor(
    private commandExecutor: CommandExecutor,
    private logger: Logger,
  ) {}

  static create(commandExecutor: CommandExecutor, logger: Logger): TmuxSession {
    return new TmuxSession(commandExecutor, logger);
  }

  async findMostActiveSession(): Promise<
    Result<string, ValidationError & { message: string }>
  > {
    // Get all sessions with their pane counts
    const sessionsResult = await this.commandExecutor.execute([
      "tmux",
      "list-sessions",
      "-F",
      "#{session_name}:#{session_windows}:#{session_attached}",
    ]);

    if (!sessionsResult.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: "tmux list-sessions",
          stderr: sessionsResult.error.message,
        }),
      };
    }

    const sessions = sessionsResult.data.split("\n").filter((line: string) =>
      line.trim() !== ""
    );
    if (sessions.length === 0) {
      return { ok: false, error: createError({ kind: "EmptyInput" }) };
    }

    // Get pane count for each session
    const sessionPaneCounts = new Map<string, number>();

    for (const session of sessions) {
      const [name] = session.split(":");
      const panesResult = await this.commandExecutor.execute([
        "tmux",
        "list-panes",
        "-t",
        name,
        "-F",
        "#{pane_id}",
      ]);

      if (panesResult.ok) {
        const paneCount = panesResult.data.split("\n").filter((line: string) =>
          line.trim() !== ""
        ).length;
        sessionPaneCounts.set(name, paneCount);
        this.logger.info(`Session "${name}" has ${paneCount} panes`);
      } else {
        sessionPaneCounts.set(name, 0);
        this.logger.warn(
          `Failed to get pane count for session "${name}": ${panesResult.error.message}`,
        );
      }
    }

    // Find session with most panes, prefer newer session names if tied
    let bestSession = "";
    let maxPaneCount = -1;

    // Sort sessions by name (newer sessions typically have higher names)
    const sortedSessions = Array.from(sessionPaneCounts.entries()).sort(
      ([a], [b]) => {
        // Try to parse as numbers first for proper numeric sorting
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return bNum - aNum; // Descending numeric order (newer first)
        }
        return b.localeCompare(a); // Descending lexicographic order for non-numeric names
      },
    );

    for (const [sessionName, paneCount] of sortedSessions) {
      if (paneCount > maxPaneCount) {
        maxPaneCount = paneCount;
        bestSession = sessionName;
      } else if (paneCount === maxPaneCount && paneCount > 0) {
        // Same pane count - keep the first one (which is newer due to sorting)
        // bestSession is already set to the newer session
        continue;
      }
    }

    if (!bestSession) {
      return {
        ok: false,
        error: createError({
          kind: "InvalidState",
          current: "no session found",
          expected: "at least one session",
        }),
      };
    }

    this.logger.info(
      `Selected session "${bestSession}" with ${maxPaneCount} panes`,
    );
    return { ok: true, data: bestSession };
  }

  async getAllPanes(
    sessionName: string,
  ): Promise<Result<PaneDetail[], ValidationError & { message: string }>> {
    // First, try to get all panes across all sessions to ensure comprehensive detection
    let result = await this.commandExecutor.execute([
      "tmux",
      "list-panes",
      "-a", // All sessions
      "-F",
      "#{session_name}:#{window_index}:#{window_name}:#{pane_id}:#{pane_index}:#{pane_tty}:#{pane_pid}:#{pane_current_command}:#{pane_current_path}:#{pane_title}:#{pane_active}:#{window_zoomed_flag}:#{pane_width}:#{pane_height}:#{pane_start_command}",
    ]);

    if (result.ok) {
      this.logger.info(
        `Using all panes across all sessions for comprehensive monitoring`,
      );
    } else {
      // Fallback to session-specific if all-sessions fails
      this.logger.warn(
        `Failed to get all panes, falling back to session-specific: ${result.error.message}`,
      );
      result = await this.commandExecutor.execute([
        "tmux",
        "list-panes",
        "-t",
        sessionName,
        "-F",
        "#{session_name}:#{window_index}:#{window_name}:#{pane_id}:#{pane_index}:#{pane_tty}:#{pane_pid}:#{pane_current_command}:#{pane_current_path}:#{pane_title}:#{pane_active}:#{window_zoomed_flag}:#{pane_width}:#{pane_height}:#{pane_start_command}",
      ]);
    }

    if (!result.ok) {
      return {
        ok: false,
        error: createError({
          kind: "CommandFailed",
          command: "tmux list-panes",
          stderr: result.error.message,
        }),
      };
    }

    const lines = result.data.split("\n").filter((line: string) =>
      line.trim() !== ""
    );
    const panes: PaneDetail[] = [];

    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 15) {
        const paneResult = PaneDetail.create(
          parts[0], // sessionName
          parts[1], // windowIndex
          parts[2], // windowName
          parts[3], // paneId
          parts[4], // paneIndex
          parts[5], // tty
          parts[6], // pid
          parts[7], // currentCommand
          parts[8], // currentPath
          parts[9], // title
          parts[10], // active
          parts[11], // zoomed
          parts[12], // width
          parts[13], // height
          parts[14], // startCommand
        );

        if (paneResult.ok) {
          panes.push(paneResult.data);
        } else {
          this.logger.warn(`Failed to parse pane: ${line}`);
        }
      }
    }

    return { ok: true, data: panes };
  }
}
