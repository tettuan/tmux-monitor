/**
 * アプリケーション設定定数
 * オッカムの剃刀原則に従い、分散していた設定値を中央集約
 */

/**
 * CLI引数オプション定数
 *
 * 複数ファイルで重複していたCLI引数文字列を統一管理
 */
export const CLI_OPTIONS = {
  KILL_ALL_PANES: "--kill-all-panes",
  CLEAR: "--clear",
  CLEAR_ALL: "--clear-all",
  ONETIME: "--onetime",
  TIME: "--time",
  START_CLAUDE: "--start-claude",
  INSTRUCTION_FILE: "--instruction-file",
  HELP: "--help",
  VERSION: "--version",
} as const;

/**
 * 監視サイクル設定定数
 *
 * tmux監視の基本設定値を統一管理
 */
export const MONITORING_CONFIG = {
  CYCLE_INTERVAL_MS: 30000, // 30秒サイクル
  MAX_RUNTIME_HOURS: 4, // 最大実行時間4時間
  COMMUNICATION_DELAY_MS: 1000, // 通信間隔1秒
  HISTORY_MAX_SIZE: 2, // 履歴保持数
  CLEAR_COMMAND: "/clear", // Claudeクリアコマンド
  CLEAR_SUCCESS_PATTERN: "> /clear\n⎿  (no content)", // 正しいクリア状態
} as const;

/**
 * tmuxコマンド定数
 *
 * tmux関連のコマンド文字列を統一管理
 */
export const TMUX_COMMANDS = {
  LIST_SESSIONS: "list-sessions",
  LIST_PANES: "list-panes",
  SEND_KEYS: "send-keys",
  CAPTURE_PANE: "capture-pane",
  DISPLAY_MESSAGE: "display-message",
  SELECT_PANE: "select-pane",
  KILL_SESSION: "kill-session",
  KILL_PANE: "kill-pane",
} as const;

/**
 * デフォルト設定値
 *
 * アプリケーション全体のデフォルト値を統一管理
 */
export const DEFAULT_VALUES = {
  SESSION_NAME: "claude-code",
  TIMEZONE: "Asia/Tokyo",
  INSTRUCTION_FILE_PATH: "./instructions.md",
  LOG_LEVEL: "info",
  PANE_ROLE_MAPPING: {
    MAIN: "main",
    MANAGER1: "manager1",
    MANAGER2: "manager2",
    SECRETARY: "secretary",
    WORKER_PREFIX: "worker",
  },
} as const;

/**
 * エラーメッセージ定数
 *
 * 共通エラーメッセージを統一管理
 */
export const ERROR_MESSAGES = {
  SESSION_NOT_FOUND: "tmux session not found",
  PANE_NOT_FOUND: "tmux pane not found",
  COMMAND_FAILED: "Command execution failed",
  TIMEOUT_EXCEEDED: "Operation timeout exceeded",
  INVALID_TIME_FORMAT: "Invalid time format",
  FILE_NOT_FOUND: "File not found",
  PERMISSION_DENIED: "Permission denied",
} as const;

/**
 * 設定値の型安全アクセサ
 *
 * 設定値への型安全なアクセスを提供
 */
export type CLIOption = typeof CLI_OPTIONS[keyof typeof CLI_OPTIONS];
export type TmuxCommand = typeof TMUX_COMMANDS[keyof typeof TMUX_COMMANDS];
export type DefaultValue = typeof DEFAULT_VALUES[keyof typeof DEFAULT_VALUES];
export type ErrorMessage = typeof ERROR_MESSAGES[keyof typeof ERROR_MESSAGES];
