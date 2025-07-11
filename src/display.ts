import type { PaneDetail } from "./models.ts";
import type { Logger } from "./services.ts";

/**
 * Pane display manager for formatting and outputting pane information.
 *
 * Handles the display and formatting of tmux pane information including
 * pane lists, main/target pane classifications, and status information.
 *
 * @example
 * ```typescript
 * const displayer = PaneDisplayer.create(logger);
 * displayer.displayPaneList(allPanes);
 * displayer.displayMainAndTargetPanes(mainPanes, targetPanes);
 * ```
 */
export class PaneDisplayer {
  private constructor(
    private logger: Logger,
  ) {}

  static create(logger: Logger): PaneDisplayer {
    return new PaneDisplayer(logger);
  }

  displayPaneList(panes: PaneDetail[]): void {
    this.logger.info(`\nFound ${panes.length} panes:`);
    panes.forEach((pane, index) => {
      const activeStatus = pane.active === "1" ? "ACTIVE" : "INACTIVE";
      this.logger.info(
        `  ${
          index + 1
        }. [${pane.paneId}] ${pane.title} - ${pane.currentCommand} (${activeStatus})`,
      );
    });
  }

  displayMainAndTargetPanes(
    mainPanes: PaneDetail[],
    targetPanes: PaneDetail[],
  ): void {
    this.logger.info(`\nMain panes (${mainPanes.length}):`);
    mainPanes.forEach((pane, index) => {
      this.logger.info(
        `  ${
          index + 1
        }. [${pane.paneId}] ${pane.title} - ${pane.currentCommand}`,
      );
    });

    this.logger.info(`\nTarget panes (${targetPanes.length}):`);
    targetPanes.forEach((pane, index) => {
      this.logger.info(
        `  ${
          index + 1
        }. [${pane.paneId}] ${pane.title} - ${pane.currentCommand}`,
      );
    });
  }
}
