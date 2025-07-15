/**
 * Utility functions for tmux-monitor
 */

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
