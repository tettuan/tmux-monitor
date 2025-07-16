/**
 * CaptureState関連のテストファイル
 *
 * DDD設計とcapture状態評価の動作を検証
 * 【統合版】: CaptureDetectionServiceを使用した統合テスト
 */

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CaptureState,
  InputFieldState,
  PaneId,
  StatusComparison,
} from "../../src/domain/value_objects.ts";
import { Pane } from "../../src/domain/pane.ts";
import {
  CaptureDetectionService,
  InMemoryCaptureHistory,
} from "../../src/domain/capture_detection_service.ts";
import { MockCaptureAdapter } from "../../src/infrastructure/unified_capture_adapter.ts";

Deno.test("StatusComparison - 初回評価は NOT_EVALUATED", () => {
  const result = StatusComparison.create(
    null, // 初回
    "some capture content",
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getActivityStatus();
    assertEquals(status.kind, "NOT_EVALUATED");
  }
});

Deno.test("StatusComparison - 変化ありの場合は WORKING", () => {
  const result = StatusComparison.create(
    "previous content",
    "different content",
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getActivityStatus();
    assertEquals(status.kind, "WORKING");
  }
});

Deno.test("StatusComparison - 変化なしの場合は IDLE", () => {
  const content = "same content";
  const result = StatusComparison.create(content, content);

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getActivityStatus();
    assertEquals(status.kind, "IDLE");
  }
});

Deno.test("InputFieldState - 空白入力欄の検出", () => {
  const captureLines = [
    "╭──────────────────────────────────────╮",
    "│ >                                    │",
    "╰──────────────────────────────────────╯",
  ];

  const result = InputFieldState.create(captureLines);

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getStatus();
    assertEquals(status.kind, "EMPTY");
  }
});

Deno.test("InputFieldState - 入力ありの検出", () => {
  const captureLines = [
    "╭──────────────────────────────────────╮",
    "│ > echo hello                         │",
    "╰──────────────────────────────────────╯",
  ];

  const result = InputFieldState.create(captureLines);

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getStatus();
    assertEquals(status.kind, "HAS_INPUT");
  }
});

Deno.test("InputFieldState - 入力欄なしの場合", () => {
  const captureLines = [
    "regular terminal output",
    "some command output",
    "no input field here",
  ];

  const result = InputFieldState.create(captureLines);

  assertEquals(result.ok, true);
  if (result.ok) {
    const status = result.data.getStatus();
    assertEquals(status.kind, "NO_INPUT_FIELD");
  }
});

Deno.test("InputFieldState - 3行未満のエラー", () => {
  const captureLines = ["line1", "line2"]; // 2行のみ

  const result = InputFieldState.create(captureLines);

  assertEquals(result.ok, false);
});

Deno.test("CaptureState - 統合状態の作成", () => {
  const statusComparisonResult = StatusComparison.create(
    null,
    "initial content",
  );

  const inputFieldResult = InputFieldState.create([
    "╭──────────────────────────────────────╮",
    "│ >                                    │",
    "╰──────────────────────────────────────╯",
  ]);

  assertEquals(statusComparisonResult.ok, true);
  assertEquals(inputFieldResult.ok, true);

  if (statusComparisonResult.ok && inputFieldResult.ok) {
    const captureStateResult = CaptureState.create(
      statusComparisonResult.data,
      inputFieldResult.data,
    );

    assertEquals(captureStateResult.ok, true);

    if (captureStateResult.ok) {
      const captureState = captureStateResult.data;
      assertEquals(captureState.activityStatus.kind, "NOT_EVALUATED");
      assertEquals(captureState.inputStatus.kind, "EMPTY");
      assertEquals(captureState.isAvailableForNewTask(), false); // NOT_EVALUATEDのため
    }
  }
});

Deno.test("CaptureState - タスク利用可能判定（IDLE + EMPTY）", () => {
  const statusComparisonResult = StatusComparison.create(
    "same content",
    "same content", // 変化なし → IDLE
  );

  const inputFieldResult = InputFieldState.create([
    "╭──────────────────────────────────────╮",
    "│ >                                    │", // 空白
    "╰──────────────────────────────────────╯",
  ]);

  assertEquals(statusComparisonResult.ok, true);
  assertEquals(inputFieldResult.ok, true);

  if (statusComparisonResult.ok && inputFieldResult.ok) {
    const captureStateResult = CaptureState.create(
      statusComparisonResult.data,
      inputFieldResult.data,
    );

    assertEquals(captureStateResult.ok, true);

    if (captureStateResult.ok) {
      const captureState = captureStateResult.data;
      assertEquals(captureState.activityStatus.kind, "IDLE");
      assertEquals(captureState.inputStatus.kind, "EMPTY");
      assertEquals(captureState.isAvailableForNewTask(), true); // 利用可能
    }
  }
});

Deno.test("Pane - capture状態の統合（統合版）", async () => {
  const paneIdResult = PaneId.create("%1");
  assertEquals(paneIdResult.ok, true);

  if (paneIdResult.ok) {
    const paneResult = Pane.create(
      paneIdResult.data,
      false,
      "shell",
      "Terminal",
    );

    assertEquals(paneResult.ok, true);

    if (paneResult.ok) {
      const pane = paneResult.data;

      // 初期状態
      assertEquals(pane.captureState, null);
      assertEquals(pane.isAvailableForNewTask(), false);

      // 統合capture検出サービスを使用
      const captureAdapter = new MockCaptureAdapter();
      const captureHistory = new InMemoryCaptureHistory();
      const captureService = new CaptureDetectionService(
        captureAdapter,
        captureHistory,
      );

      // 最初のcapture
      const testContent = [
        "╭──────────────────────────────────────╮",
        "│ >                                    │",
        "╰──────────────────────────────────────╯",
      ].join("\n");

      captureAdapter.setMockData("%1", testContent);

      const firstDetection = await captureService.detectChanges("%1");
      assertEquals(firstDetection.ok, true);

      if (firstDetection.ok) {
        const updateResult = pane.updateCaptureStateFromDetection(
          firstDetection.data,
        );
        assertEquals(updateResult.ok, true);

        // 更新後の状態確認
        assertNotEquals(pane.captureState, null);

        const summary = pane.getCaptureStateSummary();
        assertEquals(summary?.activity, "NOT_EVALUATED"); // 初回
        assertEquals(summary?.input, "EMPTY");
        assertEquals(summary?.available, false); // NOT_EVALUATEDのため

        // 2回目のcapture（同じ内容 → IDLE）
        const secondDetection = await captureService.detectChanges("%1");
        assertEquals(secondDetection.ok, true);

        if (secondDetection.ok) {
          const updateResult2 = pane.updateCaptureStateFromDetection(
            secondDetection.data,
          );
          assertEquals(updateResult2.ok, true);

          const summary2 = pane.getCaptureStateSummary();
          assertEquals(summary2?.activity, "IDLE"); // 変化なし
          assertEquals(summary2?.input, "EMPTY");
          assertEquals(summary2?.available, true); // 利用可能！
        }
      }
    }
  }
});

Deno.test("StatusMapping - ActivityStatusからWorkerStatusへの統合", async () => {
  const { StatusMapping, StatusContextBuilder } = await import(
    "../../src/domain/value_objects.ts"
  );

  // IDLE + 完了マーカー → DONE
  const idleActivity = { kind: "IDLE" } as const;
  const completionContext = StatusContextBuilder.create()
    .withCaptureContent(["Task completed successfully", "✓ Done"])
    .build();

  const idleMapping = StatusMapping.create(idleActivity, completionContext);
  assertEquals(idleMapping.ok, true);

  if (idleMapping.ok) {
    const workerStatus = idleMapping.data.deriveWorkerStatus();
    assertEquals(workerStatus.kind, "DONE");
    if (workerStatus.kind === "DONE") {
      assertEquals(workerStatus.result, "completed");
    }
  }

  // WORKING + ブロック状態 → BLOCKED
  const workingActivity = { kind: "WORKING" } as const;
  const blockedContext = StatusContextBuilder.create()
    .withCaptureContent(["Waiting for user input", "Process paused"])
    .build();

  const workingMapping = StatusMapping.create(workingActivity, blockedContext);
  assertEquals(workingMapping.ok, true);

  if (workingMapping.ok) {
    const workerStatus = workingMapping.data.deriveWorkerStatus();
    assertEquals(workerStatus.kind, "BLOCKED");
    if (workerStatus.kind === "BLOCKED") {
      assertEquals(workerStatus.reason, "waiting");
    }
  }

  // NOT_EVALUATED → UNKNOWN
  const notEvaluatedActivity = { kind: "NOT_EVALUATED" } as const;
  const emptyContext = StatusContextBuilder.create().build();

  const notEvaluatedMapping = StatusMapping.create(
    notEvaluatedActivity,
    emptyContext,
  );
  assertEquals(notEvaluatedMapping.ok, true);

  if (notEvaluatedMapping.ok) {
    const workerStatus = notEvaluatedMapping.data.deriveWorkerStatus();
    assertEquals(workerStatus.kind, "UNKNOWN");
  }
});
