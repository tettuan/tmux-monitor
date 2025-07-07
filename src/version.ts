// This file is auto-generated. Do not edit manually.
// The version is synchronized with deno.json.

/**
 * The current version of tmux-monitor, synchronized with deno.json.
 * @module
 */
export const VERSION = "0.0.1";

/**
 * Get version information
 * @returns The current version string
 */
export function getVersion(): string {
  return VERSION;
}

/**
 * Get detailed version information
 * @returns Object containing version, name, and description
 */
export function getVersionInfo(): {
  version: string;
  name: string;
  description: string;
} {
  return {
    version: VERSION,
    name: "@aidevtool/tmux-monitor",
    description: "A comprehensive tmux monitoring tool with totality principles",
  };
}
