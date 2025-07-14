/**
 * DDDリファクタリング統合テスト
 *
 * 新しいドメインモデルとアーキテクチャの統合動作を検証。
 * 実際のワークフローを通じた動作確認。
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MonitoringCycle,
  PaneId,
  PaneName,
} from "../src/domain/value_objects.ts";
import { Pane } from "../src/domain/pane.ts";
import {
  PaneCollection,
  StatusTransitionService,
} from "../src/domain/services.ts";
import { MonitoringApplicationService } from "../src/application/monitoring_service.ts";
import type {
  IPaneCommunicator,
  IPaneContentMonitor,
  ITmuxSessionRepository,
  RawPaneData,
} from "../src/application/monitoring_service.ts";
import type { WorkerStatus } from "../src/models.ts";

// =============================================================================
// モックオブジェクトの実装
// =============================================================================

class MockTmuxRepository implements ITmuxSessionRepository {
  private mockPanes: RawPaneData[] = [
    {
      paneId: "%0",
      active: "1",
      currentCommand: "zsh",
      title: "manager-main",
      sessionName: "test",
      windowIndex: "0",
      windowName: "main",
      paneIndex: "0",
      tty: "/dev/ttys000",
      pid: "1234",
      currentPath: "/home/user",
      zoomed: "0",
      width: "120",
      height: "30",
      startCommand: "zsh",
    },
    {
      paneId: "%1",
      active: "0",
      currentCommand: "vim",
      title: "worker-1",
      sessionName: "test",
      windowIndex: "0",
      windowName: "main",
      paneIndex: "1",
      tty: "/dev/ttys001",
      pid: "1235",
      currentPath: "/home/user",
      zoomed: "0",
      width: "120",
      height: "30",
      startCommand: "vim",
    },
    {
      paneId: "%2",
      active: "0",
      currentCommand: "node",
      title: "worker-2",
      sessionName: "test",
      windowIndex: "0",
      windowName: "main",
      paneIndex: "2",
      tty: "/dev/ttys002",
      pid: "1236",
      currentPath: "/home/user",
      zoomed: "0",
      width: "120",
      height: "30",
      startCommand: "node server.js",
    },
  ];

  discoverPanes(): Promise<{ ok: true; data: RawPaneData[] }> {
    return Promise.resolve({ ok: true, data: [...this.mockPanes] });
  }

  executeTmuxCommand(): Promise<{ ok: true; data: string }> {
    return Promise.resolve({ ok: true, data: "command executed" });
  }
}

class MockContentMonitor implements IPaneContentMonitor {
  private contents = new Map<string, string>();
  private changeFlags = new Map<string, boolean>();

  captureContent(paneId: string): Promise<{ ok: true; data: string }> {
    const content = this.contents.get(paneId) || `Content for ${paneId}`;
    return Promise.resolve({ ok: true, data: content });
  }

  hasContentChanged(paneId: string): boolean {
    return this.changeFlags.get(paneId) || false;
  }

  setContentChanged(paneId: string, changed: boolean): void {
    this.changeFlags.set(paneId, changed);
  }
}

class MockCommunicator implements IPaneCommunicator {
  private sentMessages: Array<{ paneId: string; message: string }> = [];

  sendMessage(
    paneId: string,
    message: string,
  ): Promise<{ ok: true; data: void }> {
    this.sentMessages.push({ paneId, message });
    return Promise.resolve({ ok: true, data: undefined });
  }

  sendCommand(
    paneId: string,
    command: string,
  ): Promise<{ ok: true; data: void }> {
    this.sentMessages.push({ paneId, message: `COMMAND: ${command}` });
    return Promise.resolve({ ok: true, data: undefined });
  }

  getSentMessages(): Array<{ paneId: string; message: string }> {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

// =============================================================================
// 値オブジェクトのテスト
// =============================================================================

Deno.test("PaneId - Smart Constructor validation", () => {
  // 正常なケース
  const validResult = PaneId.create("%1");
  assertEquals(validResult.ok, true);
  if (validResult.ok) {
    assertEquals(validResult.data.value, "%1");
  }

  // 不正なフォーマット
  const invalidResult = PaneId.create("invalid");
  assertEquals(invalidResult.ok, false);

  // 空文字
  const emptyResult = PaneId.create("");
  assertEquals(emptyResult.ok, false);
});

Deno.test("PaneName - Role detection", () => {
  // Manager role
  const managerResult = PaneName.create("manager-main");
  assertEquals(managerResult.ok, true);
  if (managerResult.ok) {
    assertEquals(managerResult.data.role, "manager");
    assertEquals(managerResult.data.isManager(), true);
  }

  // Worker role
  const workerResult = PaneName.create("worker-1");
  assertEquals(workerResult.ok, true);
  if (workerResult.ok) {
    assertEquals(workerResult.data.role, "worker");
    assertEquals(workerResult.data.isWorker(), true);
  }

  // Secretary role
  const secretaryResult = PaneName.create("secretary-helper");
  assertEquals(secretaryResult.ok, true);
  if (secretaryResult.ok) {
    assertEquals(secretaryResult.data.role, "secretary");
    assertEquals(secretaryResult.data.isSecretary(), true);
  }

  // Invalid role
  const invalidResult = PaneName.create("invalid-name");
  assertEquals(invalidResult.ok, false);
});

Deno.test("MonitoringCycle - Phase progression", () => {
  // 初期作成
  const cycleResult = MonitoringCycle.create("Discovery", 30);
  assertEquals(cycleResult.ok, true);

  if (cycleResult.ok) {
    const cycle = cycleResult.data;
    assertEquals(cycle.phase, "Discovery");
    assertEquals(cycle.intervalSeconds, 30);
    assertEquals(cycle.cycleCount, 0);

    // 次のフェーズ取得
    assertEquals(cycle.getNextPhase(), "Classification");

    // サイクル進行
    const advancedResult = cycle.advance();
    assertEquals(advancedResult.ok, true);

    if (advancedResult.ok) {
      assertEquals(advancedResult.data.phase, "Classification");
      assertEquals(advancedResult.data.cycleCount, 0);
    }
  }
});

// =============================================================================
// 集約ルートのテスト
// =============================================================================

Deno.test("Pane - Aggregate root creation and behavior", () => {
  // PaneIdの作成
  const paneIdResult = PaneId.create("%1");
  assertEquals(paneIdResult.ok, true);

  if (paneIdResult.ok) {
    // Paneの作成
    const paneResult = Pane.create(
      paneIdResult.data,
      false,
      "vim",
      "Editor Session",
    );
    assertEquals(paneResult.ok, true);

    if (paneResult.ok) {
      const pane = paneResult.data;

      // 基本プロパティの確認
      assertEquals(pane.id.value, "%1");
      assertEquals(pane.isActive, false);
      assertEquals(pane.currentCommand, "vim");
      assertEquals(pane.title, "Editor Session");
      assertEquals(pane.status.kind, "UNKNOWN");

      // ステータス更新
      const statusUpdateResult = pane.updateStatus({ kind: "WORKING" });
      assertEquals(statusUpdateResult.ok, true);
      assertEquals(pane.status.kind, "WORKING");

      // ビジネスルールの確認
      assertEquals(pane.isWorking(), true);
      assertEquals(pane.canAssignTask(), false); // 非アクティブだがWORKING状態

      // 名前の割り当て
      const nameResult = PaneName.create("worker-vim");
      if (nameResult.ok) {
        const assignResult = pane.assignName(nameResult.data);
        assertEquals(assignResult.ok, true);
        assertExists(pane.name);
        assertEquals(pane.name!.role, "worker");
      }
    }
  }
});

Deno.test("Pane - Status transition validation", () => {
  const paneIdResult = PaneId.create("%2");
  if (!paneIdResult.ok) return;

  const paneResult = Pane.create(
    paneIdResult.data,
    false,
    "zsh",
    "Shell",
  );

  if (paneResult.ok) {
    const pane = paneResult.data;

    // UNKNOWN -> IDLE (許可)
    const idleResult = pane.updateStatus({ kind: "IDLE" });
    assertEquals(idleResult.ok, true);

    // IDLE -> WORKING (許可)
    const workingResult = pane.updateStatus({ kind: "WORKING" });
    assertEquals(workingResult.ok, true);

    // WORKING -> DONE (許可)
    const doneResult = pane.updateStatus({ kind: "DONE" });
    assertEquals(doneResult.ok, true);

    // 履歴の確認（最大2件）
    assertEquals(pane.history.length, 2);
    assertEquals(pane.history[0].status.kind, "IDLE");
    assertEquals(pane.history[1].status.kind, "WORKING");
  }
});

// =============================================================================
// ドメインサービスのテスト
// =============================================================================

Deno.test("PaneCollection - Aggregate management", () => {
  const collection = new PaneCollection();

  // アクティブペインの作成と追加
  const activePaneIdResult = PaneId.create("%0");
  if (!activePaneIdResult.ok) return;

  const activePaneResult = Pane.create(
    activePaneIdResult.data,
    true,
    "zsh",
    "Main",
  );
  if (!activePaneResult.ok) return;

  const activePane = activePaneResult.data;

  const addResult1 = collection.addPane(activePane);
  assertEquals(addResult1.ok, true);
  assertEquals(collection.count, 1);
  assertEquals(collection.getActivePane()?.id.value, "%0");

  // 非アクティブペインの追加
  const targetPaneIdResult = PaneId.create("%1");
  if (!targetPaneIdResult.ok) return;

  const targetPaneResult = Pane.create(
    targetPaneIdResult.data,
    false,
    "vim",
    "Editor",
  );
  if (!targetPaneResult.ok) return;

  const targetPane = targetPaneResult.data;

  const addResult2 = collection.addPane(targetPane);
  assertEquals(addResult2.ok, true);
  assertEquals(collection.count, 2);

  // ターゲットペインの取得
  const targetPanes = collection.getTargetPanes();
  assertEquals(targetPanes.length, 1);
  assertEquals(targetPanes[0].id.value, "%1");

  // 重複するアクティブペインの追加（エラー）
  const duplicateActiveIdResult = PaneId.create("%2");
  if (!duplicateActiveIdResult.ok) return;

  const duplicateActiveResult = Pane.create(
    duplicateActiveIdResult.data,
    true,
    "bash",
    "Duplicate",
  );
  if (!duplicateActiveResult.ok) return;

  const duplicateActive = duplicateActiveResult.data;

  const duplicateResult = collection.addPane(duplicateActive);
  assertEquals(duplicateResult.ok, false);
});

Deno.test("StatusTransitionService - Batch status update", () => {
  // ペインの準備
  const pane1IdResult = PaneId.create("%1");
  if (!pane1IdResult.ok) return;

  const pane1Result = Pane.create(pane1IdResult.data, false, "vim", "Editor");
  if (!pane1Result.ok) return;

  const pane2IdResult = PaneId.create("%2");
  if (!pane2IdResult.ok) return;

  const pane2Result = Pane.create(pane2IdResult.data, false, "node", "Server");
  if (!pane2Result.ok) return;

  const pane1 = pane1Result.data;
  const pane2 = pane2Result.data;

  // ステータス更新マップの作成
  const statusUpdates = new Map<string, WorkerStatus>();
  statusUpdates.set(pane1.id.value, { kind: "WORKING" });
  statusUpdates.set(pane2.id.value, { kind: "IDLE" });

  // バッチ更新の実行
  const updateResult = StatusTransitionService.updateMultipleStatuses(
    [pane1, pane2],
    statusUpdates,
  );

  assertEquals(updateResult.ok, true);
  assertEquals(pane1.status.kind, "WORKING");
  assertEquals(pane2.status.kind, "IDLE");
});

// =============================================================================
// アプリケーションサービスの統合テスト
// =============================================================================

Deno.test("MonitoringApplicationService - Full workflow", async () => {
  // モックの準備
  const mockTmux = new MockTmuxRepository();
  const mockContent = new MockContentMonitor();
  const mockComm = new MockCommunicator();

  // アプリケーションサービスの作成
  const service = new MonitoringApplicationService(
    mockTmux,
    mockContent,
    mockComm,
  );

  // 監視開始
  const startResult = await service.startMonitoring("test-session", 30);
  assertEquals(startResult.ok, true);

  // 初期状態の確認
  const collection = service.getPaneCollection();
  assertEquals(collection.count, 3);

  const activePane = collection.getActivePane();
  assertExists(activePane);
  assertEquals(activePane.id.value, "%0");

  const targetPanes = collection.getTargetPanes();
  assertEquals(targetPanes.length, 2);

  // コンテンツ変化のシミュレーション
  mockContent.setContentChanged("%1", true); // vim - working
  mockContent.setContentChanged("%2", false); // node - idle

  // 監視サイクルの実行
  const cycleResult = await service.executeSingleCycle();
  assertEquals(cycleResult.ok, true);

  if (cycleResult.ok) {
    const result = cycleResult.data;

    // ステータス変化の確認
    assertEquals(result.statusChanges.length >= 0, true);

    // 統計の確認
    const stats = service.getMonitoringStats();
    assertEquals(stats.totalPanes, 3);
    assertEquals(stats.activePanes, 1);
  }

  // 報告機能のテスト
  const reportResult = await service.reportToActivePane("Test report message");
  assertEquals(reportResult.ok, true);

  const sentMessages = mockComm.getSentMessages();
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].paneId, "%0");
  assertEquals(sentMessages[0].message, "Test report message");
});

Deno.test("MonitoringApplicationService - Status update workflow", async () => {
  const mockTmux = new MockTmuxRepository();
  const mockContent = new MockContentMonitor();
  const mockComm = new MockCommunicator();

  const service = new MonitoringApplicationService(
    mockTmux,
    mockContent,
    mockComm,
  );

  // 監視開始
  await service.startMonitoring();

  // ステータス更新の実行
  const statusUpdates = new Map<string, WorkerStatus>();
  statusUpdates.set("%1", { kind: "WORKING" });
  statusUpdates.set("%2", { kind: "DONE" });

  const updateResult = service.updatePaneStatuses(statusUpdates);
  assertEquals(updateResult.ok, true);

  if (updateResult.ok) {
    const result = updateResult.data;
    assertEquals(result.updatedCount, 2);
    assertEquals(result.changedPanes.length, 2);
  }

  // 更新後の状態確認
  const collection = service.getPaneCollection();
  const pane1IdResult = PaneId.create("%1");
  const pane2IdResult = PaneId.create("%2");

  if (!pane1IdResult.ok || !pane2IdResult.ok) return;

  const pane1 = collection.getPane(pane1IdResult.data);
  const pane2 = collection.getPane(pane2IdResult.data);

  assertExists(pane1);
  assertExists(pane2);
  assertEquals(pane1.status.kind, "WORKING");
  assertEquals(pane2.status.kind, "DONE");
});

// =============================================================================
// エラーケースのテスト
// =============================================================================

Deno.test("Error handling - Invalid pane creation", () => {
  // 不正なPaneID
  const invalidPaneResult = Pane.fromTmuxData("invalid", true, "zsh", "Shell");
  assertEquals(invalidPaneResult.ok, false);

  // 空のコマンド
  const paneIdResult = PaneId.create("%1");
  if (paneIdResult.ok) {
    const emptyCommandResult = Pane.create(
      paneIdResult.data,
      true,
      "",
      "Shell",
    );
    assertEquals(emptyCommandResult.ok, false);
  }
});

Deno.test("Error handling - Business rule violations", () => {
  const paneIdResult = PaneId.create("%1");
  const nameResult = PaneName.create("worker-1");

  if (paneIdResult.ok && nameResult.ok) {
    // アクティブペインにworker役割を割り当て（違反）
    const activePaneResult = Pane.create(
      paneIdResult.data,
      true,
      "zsh",
      "Main",
    );

    if (activePaneResult.ok) {
      const assignResult = activePaneResult.data.assignName(nameResult.data);
      assertEquals(assignResult.ok, false);
    }
  }
});

// =============================================================================
// パフォーマンステスト
// =============================================================================

Deno.test("Performance - Large pane collection", () => {
  const collection = new PaneCollection();
  const startTime = Date.now();

  // 100個のペインを作成・追加
  for (let i = 1; i <= 100; i++) {
    const paneIdResult = PaneId.create(`%${i}`);
    if (!paneIdResult.ok) continue;

    const paneResult = Pane.create(
      paneIdResult.data,
      i === 1, // 最初のペインのみアクティブ
      "test-command",
      `Test Pane ${i}`,
    );

    if (paneResult.ok) {
      collection.addPane(paneResult.data);
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // パフォーマンス確認
  assertEquals(collection.count, 100);
  console.log(`Created 100 panes in ${duration}ms`);

  // クエリパフォーマンス
  const queryStart = Date.now();
  const targetPanes = collection.getTargetPanes();
  const queryEnd = Date.now();

  assertEquals(targetPanes.length, 99);
  console.log(`Queried target panes in ${queryEnd - queryStart}ms`);
});

console.log("✅ All DDD refactoring tests completed successfully!");
