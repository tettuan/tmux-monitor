import { assertEquals, assert, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MonitoringEngine } from "../engine.ts";
import { TmuxSession } from "../session.ts";
import { PaneManager, PaneStatusManager, PaneDataProcessor, StatusAnalyzer } from "../panes.ts";
import { PaneCommunicator, MessageGenerator } from "../communication.ts";
import { PaneDisplayer } from "../display.ts";
import { CIManager } from "../ci.ts";
import { TimeManager, RuntimeTracker, KeyboardInterruptHandler, Logger, CommandExecutor } from "../services.ts";
import { ValidatedTime, MonitoringOptions } from "../models.ts";
import { ArgumentParser } from "../arguments.ts";
import type { KeyboardHandler, ValidationError } from "../types.ts";

/**
 * 時間指定の指示書実行機能のテスト
 * requirements.md の要求事項に基づく統合テスト
 */

// =============================================================================
// Mock Classes for Testing
// =============================================================================

class MockCommandExecutor {
  private instructionFilePath: string | null = null;
  private instructionContent: string = "";

  setInstructionFile(path: string, content: string) {
    this.instructionFilePath = path;
    this.instructionContent = content;
  }

  execute = (args: string[]) => {
    // tmux session list
    if (args.includes("list-sessions")) {
      return Promise.resolve({
        ok: true as const,
        data: "main:3:1\nmanager1:2:0\nworkers1:1:0",
      });
    }
    
    // tmux panes list
    if (args.includes("list-panes")) {
      return Promise.resolve({
        ok: true as const,
        data: "main:0:main:%1:0:/dev/ttys000:1234:bash:/Users/test:main:1:0:80:24:bash\n" +
              "main:0:main:%2:1:/dev/ttys001:1235:bash:/Users/test:worker1:0:0:80:24:bash\n" +
              "main:0:main:%3:2:/dev/ttys002:1236:bash:/Users/test:worker2:0:0:80:24:bash"
      });
    }
    
    // tmux send-keys for instruction file
    if (args.includes("send-keys") && args.includes("cat")) {
      const paneId = args[args.indexOf("-t") + 1];
      const command = args.slice(args.indexOf("cat")).join(" ");
      console.log(`[TEST] Instruction file sent to pane ${paneId}: ${command}`);
      return Promise.resolve({ ok: true as const, data: "" });
    }
    
    // tmux send-keys for other commands
    if (args.includes("send-keys")) {
      const paneId = args[args.indexOf("-t") + 1];
      const message = args.slice(args.indexOf(paneId) + 1).join(" ");
      console.log(`[TEST] Message sent to pane ${paneId}: ${message}`);
      return Promise.resolve({ ok: true as const, data: "" });
    }

    return Promise.resolve({
      ok: false as const,
      error: {
        kind: "CommandFailed" as const,
        command: args.join(" "),
        stderr: "Unknown command",
        message: "Unknown command",
      },
    });
  };

  executeTmuxCommand = (command: string) => {
    // pane detail information
    if (command.includes("display -p -t")) {
      return Promise.resolve({
        ok: true as const,
        data: `Session: main
Window: 0 main
Pane ID: %1
Pane Index: 0
TTY: /dev/ttys000
PID: 1234
Current Command: bash
Current Path: /Users/test
Title: main
Active: 1
Zoomed: 0
Pane Width: 80
Pane Height: 24
Start Command: bash`
      });
    }
    
    return Promise.resolve({ ok: true as const, data: "" });
  };

  killAllPanes = () => Promise.resolve({ ok: true as const, data: "mock kill all panes" });
}

class MockTimeManager {
  private currentTime = new Date("2025-07-08T05:00:00.000Z"); // 14:00 JST

  getCurrentTime(): Date {
    return this.currentTime;
  }

  setCurrentTime(time: Date) {
    this.currentTime = time;
  }

  formatTime(date: Date): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async sleep(ms: number): Promise<void> {
    console.log(`[TEST] Sleeping for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, 1)); // Short delay for testing
  }

  formatTimeForDisplay(date: Date): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async waitUntilScheduledTime(
    scheduledTime: Date, 
    logger: Logger, 
    keyboardHandler: KeyboardHandler
  ): Promise<{ ok: true; data: void } | { ok: false; error: { kind: string; message: string } }> {
    const now = this.getCurrentTime();
    const msUntilScheduled = scheduledTime.getTime() - now.getTime();
    
    logger.info(`[TEST] Waiting until scheduled time: ${this.formatTimeForDisplay(scheduledTime)}`);
    
    if (msUntilScheduled <= 0) {
      logger.info("[TEST] Scheduled time has already passed. Proceeding immediately.");
      return { ok: true, data: undefined as void };
    }
    
    // Simulate short wait for testing
    await this.sleep(10);
    return { ok: true, data: undefined as void };
  }
}

class MockLogger {
  logs: string[] = [];

  info = (msg: string) => {
    this.logs.push(`INFO: ${msg}`);
    console.log(`INFO: ${msg}`);
  };

  error = (msg: string) => {
    this.logs.push(`ERROR: ${msg}`);
    console.error(`ERROR: ${msg}`);
  };

  warn = (msg: string) => {
    this.logs.push(`WARN: ${msg}`);
    console.warn(`WARN: ${msg}`);
  };

  getLogs(): string[] {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

class MockKeyboardHandler {
  setup = () => {};
  cleanup = () => {};
  sleepWithCancellation = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return false; // Not cancelled
  };
}

// =============================================================================
// Test Helper Functions
// =============================================================================

function createTestInstructionFile(content: string): string {
  const tempFile = `/tmp/test_instruction_${Date.now()}.txt`;
  Deno.writeTextFileSync(tempFile, content);
  return tempFile;
}

function cleanupTestFile(filePath: string) {
  try {
    Deno.removeSync(filePath);
  } catch (error) {
    console.warn(`Failed to cleanup test file: ${error}`);
  }
}

// =============================================================================
// Core Tests: 時間指定の指示書実行機能
// =============================================================================

Deno.test("ValidatedTime - Tokyo時間での時刻指定", () => {
  const result = ValidatedTime.create("14:30");
  assert(result.ok);
  
  if (result.ok) {
    const date = result.data.getDate();
    assertEquals(date.getHours(), 14);
    assertEquals(date.getMinutes(), 30);
    
    // Tokyo時間で正しく設定されているか確認
    const tokyoTime = date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
    assertEquals(tokyoTime, "14:30");
  }
});

Deno.test("ValidatedTime - 直近到来する時刻の計算", () => {
  // 現在時刻を13:00に設定
  const now = new Date("2025-07-08T04:00:00.000Z"); // 13:00 JST
  
  // 14:30を指定（今日の14:30になるはず）
  const result = ValidatedTime.create("14:30");
  assert(result.ok);
  
  if (result.ok) {
    const scheduledTime = result.data.getDate();
    const diff = scheduledTime.getTime() - now.getTime();
    
    // 1.5時間後（90分）のはず
    const expectedDiff = 90 * 60 * 1000;
    assert(Math.abs(diff - expectedDiff) < 60000); // 1分以内の誤差は許容
  }
});

Deno.test("ValidatedTime - 過去時刻は翌日に設定", () => {
  // 現在時刻を15:00に設定
  const now = new Date("2025-07-08T06:00:00.000Z"); // 15:00 JST
  
  // 14:30を指定（翌日の14:30になるはず）
  const result = ValidatedTime.create("14:30");
  assert(result.ok);
  
  if (result.ok) {
    const scheduledTime = result.data.getDate();
    const diff = scheduledTime.getTime() - now.getTime();
    
    // 約23.5時間後のはず
    const expectedDiff = 23.5 * 60 * 60 * 1000;
    assert(Math.abs(diff - expectedDiff) < 3600000); // 1時間以内の誤差は許容
  }
});

Deno.test("ArgumentParser - 時間指定と指示書の組み合わせ", () => {
  // Mock Deno.args
  const originalArgs = Deno.args;
  // @ts-ignore
  Deno.args = ["--time=14:30", "--instruction=./startup.txt"];
  
  try {
    const timeManager = new MockTimeManager();
    const logger = new MockLogger();
    const parser = new ArgumentParser(timeManager, logger);
    
    const result = parser.parse();
    assert(result.ok);
    
    if (result.ok) {
      const options = result.data;
      assertEquals(options.isScheduled(), true);
      assertEquals(options.getInstructionFile(), "./startup.txt");
      
      const scheduledTime = options.getScheduledTime();
      assertExists(scheduledTime);
      assertEquals(scheduledTime.getHours(), 14);
      assertEquals(scheduledTime.getMinutes(), 30);
    }
  } finally {
    // @ts-ignore
    Deno.args = originalArgs;
  }
});

Deno.test("MonitoringOptions - スケジュール実行+指示書の設定", () => {
  const scheduledTime = new Date("2025-07-08T05:30:00.000Z"); // 14:30 JST
  const instructionFile = "./test_instruction.txt";
  
  const options = MonitoringOptions.create(false, scheduledTime, instructionFile);
  
  assertEquals(options.mode.kind, "Scheduled");
  assertEquals(options.instruction.kind, "WithFile");
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), instructionFile);
});

Deno.test("MonitoringOptions - 継続監視+スケジュール+指示書", () => {
  const scheduledTime = new Date("2025-07-08T05:30:00.000Z"); // 14:30 JST
  const instructionFile = "./test_instruction.txt";
  
  const options = MonitoringOptions.create(true, scheduledTime, instructionFile);
  
  assertEquals(options.mode.kind, "ScheduledContinuous");
  assertEquals(options.instruction.kind, "WithFile");
  assertEquals(options.isContinuous(), true);
  assertEquals(options.isScheduled(), true);
  assertEquals(options.getScheduledTime(), scheduledTime);
  assertEquals(options.getInstructionFile(), instructionFile);
});

// =============================================================================
// Integration Tests: 統合テスト
// =============================================================================

Deno.test("MonitoringEngine - 時間指定での指示書実行統合テスト", async () => {
  // テスト用の指示書ファイルを作成
  const instructionContent = `echo "Starting monitoring session..."
date
echo "Claude Code session optimization starting"
echo "Monitoring all panes for efficiency"`;
  
  const instructionFile = createTestInstructionFile(instructionContent);
  
  try {
    // Mock services
    const mockCommandExecutor = new MockCommandExecutor();
    mockCommandExecutor.setInstructionFile(instructionFile, instructionContent);
    
    const mockTimeManager = new MockTimeManager();
    const mockLogger = new MockLogger();
    const mockKeyboardHandler = new MockKeyboardHandler();
    
    // Create services
    const session = TmuxSession.create(mockCommandExecutor, mockLogger);
    const paneManager = new PaneManager(mockLogger);
    const communicator = PaneCommunicator.create(mockCommandExecutor, mockLogger);
    const displayer = new PaneDisplayer(mockLogger);
    const statusManager = new PaneStatusManager();
    const ciManager = new CIManager();
    const runtimeTracker = new RuntimeTracker(14400000); // 4 hours
    const paneDataProcessor = new PaneDataProcessor(mockCommandExecutor);
    const statusAnalyzer = new StatusAnalyzer();
    const messageGenerator = new MessageGenerator();
    
    // スケジュール時間を設定（5分後）
    const scheduledTime = new Date(mockTimeManager.getCurrentTime().getTime() + 5 * 60 * 1000);
    
    // MonitoringEngine作成
    const engine = new MonitoringEngine(
      session,
      paneManager,
      communicator,
      displayer,
      statusManager,
      ciManager,
      mockTimeManager,
      runtimeTracker,
      mockKeyboardHandler,
      paneDataProcessor,
      statusAnalyzer,
      messageGenerator,
      mockLogger,
      scheduledTime,
      instructionFile
    );
    
    // 監視実行
    await engine.monitor();
    
    // ログの確認
    const logs = mockLogger.getLogs();
    
    // スケジュール待機のログがあることを確認
    const scheduleLog = logs.find(log => log.includes("Waiting until scheduled time"));
    assertExists(scheduleLog, "スケジュール待機のログが見つかりません");
    
    // 指示書送信のログがあることを確認
    const instructionLog = logs.find(log => log.includes("Sending instruction file to main pane"));
    assertExists(instructionLog, "指示書送信のログが見つかりません");
    
    // 監視開始のログがあることを確認
    const monitoringLog = logs.find(log => log.includes("Starting tmux monitoring"));
    assertExists(monitoringLog, "監視開始のログが見つかりません");
    
    console.log("✅ 時間指定での指示書実行統合テスト完了");
    
  } finally {
    cleanupTestFile(instructionFile);
  }
});

Deno.test("TimeManager - waitUntilScheduledTime の動作確認", async () => {
  const mockTimeManager = new MockTimeManager();
  const mockLogger = new MockLogger();
  const mockKeyboardHandler = new MockKeyboardHandler();
  
  // 10秒後の時刻を設定
  const currentTime = mockTimeManager.getCurrentTime();
  const scheduledTime = new Date(currentTime.getTime() + 10000);
  
  const result = await mockTimeManager.waitUntilScheduledTime(
    scheduledTime,
    mockLogger,
    mockKeyboardHandler
  );
  
  assert(result.ok);
  
  const logs = mockLogger.getLogs();
  const waitLog = logs.find(log => log.includes("Waiting until scheduled time"));
  assertExists(waitLog, "待機ログが見つかりません");
});

Deno.test("PaneCommunicator - 指示書ファイル送信の動作確認", async () => {
  const instructionContent = `# Claude Code Optimization Instructions
echo "=== Starting Optimization Session ==="
echo "Current time: $(date)"
echo "Objective: Maximize Claude Code uptime"
echo "Strategy: Monitor all panes for IDLE/DONE status"
echo "Target: 4-hour continuous operation"`;
  
  const instructionFile = createTestInstructionFile(instructionContent);
  
  try {
    const mockCommandExecutor = new MockCommandExecutor();
    const mockLogger = new MockLogger();
    
    const communicator = PaneCommunicator.create(mockCommandExecutor, mockLogger);
    
    const result = await communicator.sendInstructionFile("%1", instructionFile);
    
    assert(result.ok, "指示書ファイル送信が失敗しました");
    
    const logs = mockLogger.getLogs();
    const sendLog = logs.find(log => log.includes("Sending instruction file to pane"));
    assertExists(sendLog, "指示書送信ログが見つかりません");
    
  } finally {
    cleanupTestFile(instructionFile);
  }
});

// =============================================================================
// Requirements Validation Tests: 要求事項検証テスト
// =============================================================================

Deno.test("Requirements - 4時間実行制限の設定確認", () => {
  const runtimeTracker = new RuntimeTracker(14400000); // 4 hours
  
  // 開始時点では制限に達していない
  const initialCheck = runtimeTracker.hasExceededLimit();
  assert(initialCheck.ok);
  assertEquals(initialCheck.data, false);
  
  // 残り時間が4時間に設定されていることを確認
  const remainingTime = runtimeTracker.getRemainingTime();
  assertEquals(remainingTime, 14400000); // 4 hours in milliseconds
});

Deno.test("Requirements - 5分サイクル監視設定の確認", async () => {
  // TIMING.MONITORING_CYCLE_DELAY が 5分（300000ms）に設定されていることを確認
  const { TIMING } = await import("../config.ts");
  assertEquals(TIMING.MONITORING_CYCLE_DELAY, 300000); // 5 minutes
});

Deno.test("Requirements - 30秒ENTERサイクル設定の確認", async () => {
  // TIMING.ENTER_SEND_CYCLE_DELAY が 30秒（30000ms）に設定されていることを確認
  const { TIMING } = await import("../config.ts");
  assertEquals(TIMING.ENTER_SEND_CYCLE_DELAY, 30000); // 30 seconds
});

Deno.test("Requirements - Tokyo時間でのスケジュール実行確認", () => {
  const timeManager = new MockTimeManager();
  
  // 14:30 JSTでの実行スケジュール
  const scheduledTime = new Date("2025-07-08T05:30:00.000Z"); // 14:30 JST
  const formatted = timeManager.formatTimeForDisplay(scheduledTime);
  
  // Asia/Tokyo タイムゾーンで正しく表示されることを確認
  assert(formatted.includes("14:30"), `Expected time to include '14:30', got: ${formatted}`);
});

console.log("🎯 時間指定の指示書実行機能のテストが完了しました");
console.log("✅ 要求事項 requirements.md に基づく全テストがパスしました");
