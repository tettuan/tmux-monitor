// This file is auto-generated. Do not edit manually.
// The version is synchronized with deno.json.

/**
 * The current version of tmux-monitor, synchronized with deno.json.
 * @module
 */
export const VERSION = "1.0.4";

/**
 * Returns the current version string.
 * @returns The version string
 */
export function getVersion(): string {
  return VERSION;
}

/**
 * Returns version information object.
 * @returns Object containing version details
 */
export function getVersionInfo(): {
  version: string;
  name: string;
  description: string;
} {
  return {
    version: VERSION,
    name: "@aidevtool/tmux-monitor",
    description:
      "A comprehensive tmux monitoring tool designed for command-line usage",
  };
}
