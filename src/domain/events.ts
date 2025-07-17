/**
 * ドメインイベント定義
 *
 * DDDアーキテクチャにおけるドメインイベントを定義。
 * Paneの状態変化とビジネスルールを型安全に表現する。
 */

import type { WorkerStatus } from "../core/models.ts";

// =============================================================================
// 基底イベント型
// =============================================================================

/**
 * ドメインイベントの基底インターフェース
 */
export interface DomainEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly eventType: string;
}

// =============================================================================
// Pane関連ドメインイベント
// =============================================================================

/**
 * ペイン状態変更イベント
 */
export interface PaneStatusChangedEvent extends DomainEvent {
  readonly eventType: "PaneStatusChanged";
  readonly paneId: string;
  readonly oldStatus: WorkerStatus;
  readonly newStatus: WorkerStatus;
  readonly changedBy: "monitoring-cycle" | "manual" | "system";
}

/**
 * ペインタイトル変更イベント
 */
export interface PaneTitleChangedEvent extends DomainEvent {
  readonly eventType: "PaneTitleChanged";
  readonly paneId: string;
  readonly oldTitle: string;
  readonly newTitle: string;
}

/**
 * ペインキャプチャ状態更新イベント
 */
export interface PaneCaptureStateUpdatedEvent extends DomainEvent {
  readonly eventType: "PaneCaptureStateUpdated";
  readonly paneId: string;
  readonly activityStatus: "WORKING" | "IDLE" | "NOT_EVALUATED";
  readonly inputStatus:
    | "EMPTY"
    | "HAS_INPUT"
    | "NO_INPUT_FIELD"
    | "PARSE_ERROR";
  readonly isAvailableForNewTask: boolean;
}

/**
 * ペインクリア要求イベント
 */
export interface PaneClearRequestedEvent extends DomainEvent {
  readonly eventType: "PaneClearRequested";
  readonly paneId: string;
  readonly reason: "IDLE_STATE" | "DONE_STATE" | "MANUAL_REQUEST";
  readonly strategy: "CLEAR_COMMAND" | "ESCAPE_SEQUENCE";
}

/**
 * ペインEnter送信要求イベント
 */
export interface PaneEnterSendRequestedEvent extends DomainEvent {
  readonly eventType: "PaneEnterSendRequested";
  readonly paneId: string;
  readonly reason: "REGULAR_CYCLE" | "INPUT_COMPLETION" | "COMMAND_EXECUTION";
}

// =============================================================================
// 監視サイクルイベント
// =============================================================================

/**
 * 監視サイクル開始イベント
 */
export interface MonitoringCycleStartedEvent extends DomainEvent {
  readonly eventType: "MonitoringCycleStarted";
  readonly cycleNumber: number;
  readonly scheduledActions: readonly string[];
}

/**
 * 監視サイクル完了イベント
 */
export interface MonitoringCycleCompletedEvent extends DomainEvent {
  readonly eventType: "MonitoringCycleCompleted";
  readonly cycleNumber: number;
  readonly totalProcessed: number;
  readonly statusChanges: number;
  readonly entersSent: number;
  readonly clearsExecuted: number;
  readonly duration: number;
}

// =============================================================================
// イベント統合型
// =============================================================================

/**
 * 全ドメインイベントの統合型
 */
export type AllDomainEvents =
  | PaneStatusChangedEvent
  | PaneTitleChangedEvent
  | PaneCaptureStateUpdatedEvent
  | PaneClearRequestedEvent
  | PaneEnterSendRequestedEvent
  | MonitoringCycleStartedEvent
  | MonitoringCycleCompletedEvent;

// =============================================================================
// イベント作成ファクトリー
// =============================================================================

/**
 * ドメインイベント作成ファクトリー
 */
export class DomainEventFactory {
  private static generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createPaneStatusChangedEvent(
    paneId: string,
    oldStatus: WorkerStatus,
    newStatus: WorkerStatus,
    changedBy: "monitoring-cycle" | "manual" | "system",
  ): PaneStatusChangedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: paneId,
      occurredAt: new Date(),
      eventType: "PaneStatusChanged",
      paneId,
      oldStatus,
      newStatus,
      changedBy,
    };
  }

  static createPaneTitleChangedEvent(
    paneId: string,
    oldTitle: string,
    newTitle: string,
  ): PaneTitleChangedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: paneId,
      occurredAt: new Date(),
      eventType: "PaneTitleChanged",
      paneId,
      oldTitle,
      newTitle,
    };
  }

  static createPaneCaptureStateUpdatedEvent(
    paneId: string,
    activityStatus: "WORKING" | "IDLE" | "NOT_EVALUATED",
    inputStatus: "EMPTY" | "HAS_INPUT" | "NO_INPUT_FIELD" | "PARSE_ERROR",
    isAvailableForNewTask: boolean,
  ): PaneCaptureStateUpdatedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: paneId,
      occurredAt: new Date(),
      eventType: "PaneCaptureStateUpdated",
      paneId,
      activityStatus,
      inputStatus,
      isAvailableForNewTask,
    };
  }

  static createPaneClearRequestedEvent(
    paneId: string,
    reason: "IDLE_STATE" | "DONE_STATE" | "MANUAL_REQUEST",
    strategy: "CLEAR_COMMAND" | "ESCAPE_SEQUENCE",
  ): PaneClearRequestedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: paneId,
      occurredAt: new Date(),
      eventType: "PaneClearRequested",
      paneId,
      reason,
      strategy,
    };
  }

  static createPaneEnterSendRequestedEvent(
    paneId: string,
    reason: "REGULAR_CYCLE" | "INPUT_COMPLETION" | "COMMAND_EXECUTION",
  ): PaneEnterSendRequestedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: paneId,
      occurredAt: new Date(),
      eventType: "PaneEnterSendRequested",
      paneId,
      reason,
    };
  }

  static createMonitoringCycleStartedEvent(
    cycleNumber: number,
    scheduledActions: readonly string[],
  ): MonitoringCycleStartedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: `cycle_${cycleNumber}`,
      occurredAt: new Date(),
      eventType: "MonitoringCycleStarted",
      cycleNumber,
      scheduledActions,
    };
  }

  static createMonitoringCycleCompletedEvent(
    cycleNumber: number,
    totalProcessed: number,
    statusChanges: number,
    entersSent: number,
    clearsExecuted: number,
    duration: number,
  ): MonitoringCycleCompletedEvent {
    return {
      eventId: this.generateEventId(),
      aggregateId: `cycle_${cycleNumber}`,
      occurredAt: new Date(),
      eventType: "MonitoringCycleCompleted",
      cycleNumber,
      totalProcessed,
      statusChanges,
      entersSent,
      clearsExecuted,
      duration,
    };
  }
}

// =============================================================================
// イベントハンドラーインターフェース
// =============================================================================

/**
 * ドメインイベントハンドラー
 */
export interface DomainEventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
  canHandle(eventType: string): boolean;
}

/**
 * イベントディスパッチャー
 */
export interface EventDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: DomainEventHandler<T>,
  ): void;
  unsubscribe(
    eventType: string,
    handler: DomainEventHandler<DomainEvent>,
  ): void;
}
