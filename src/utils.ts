/**
 * Utility functions for tmux-monitor
 */

import { PANE_NAMES } from "./config.ts";

/**
 * Extracts the numeric part from a tmux pane ID (e.g., "%1" -> 1, "%10" -> 10)
 */
export function extractPaneNumber(paneId: string): number {
  const match = paneId.match(/^%(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Compares two pane IDs numerically for sorting
 * Handles pane IDs like %1, %2, %10 etc.
 *
 * @param a First pane ID
 * @param b Second pane ID
 * @returns Comparison result for Array.sort()
 */
export function comparePaneIds(a: string, b: string): number {
  return extractPaneNumber(a) - extractPaneNumber(b);
}

/**
 * Sorts an array of pane IDs numerically
 *
 * @param paneIds Array of pane IDs to sort
 * @returns New array sorted by numeric pane ID
 */
export function sortPaneIds(paneIds: string[]): string[] {
  return [...paneIds].sort(comparePaneIds);
}

/**
 * Gets a pane name based on its position index
 *
 * @param index Position index (0-based)
 * @returns Pane name from configuration, or fallback name if index exceeds available names
 */
export function getPaneName(index: number): string {
  if (index < 0) {
    return `pane${index}`;
  }

  if (index < PANE_NAMES.length) {
    return PANE_NAMES[index];
  }

  // Fallback for indices beyond configured names
  return `worker${index - PANE_NAMES.length + 21}`;
}

/**
 * Gets pane name by pane ID from a sorted list of all pane IDs
 *
 * @param paneId Target pane ID (e.g., "%3")
 * @param allSortedPaneIds All pane IDs sorted numerically
 * @returns Pane name based on position in sorted list
 */
export function getPaneNameById(
  paneId: string,
  allSortedPaneIds: string[],
): string {
  const index = allSortedPaneIds.indexOf(paneId);
  return getPaneName(index);
}
