/**
 * イベントディスパッチャー実装
 *
 * ドメインイベントの送受信を管理し、
 * イベント駆動アーキテクチャの中核を担う。
 */

import type {
  DomainEvent,
  DomainEventHandler,
  EventDispatcher,
} from "./events.ts";
import type { Logger } from "../infrastructure/services.ts";

/**
 * シンプルなイベントディスパッチャー実装
 */
export class SimpleDomainEventDispatcher implements EventDispatcher {
  private readonly _handlers: Map<string, DomainEventHandler<DomainEvent>[]>;
  private readonly _logger: Logger;

  constructor(logger: Logger) {
    this._handlers = new Map();
    this._logger = logger;
  }

  /**
   * イベントの送信
   */
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this._handlers.get(event.eventType) || [];

    if (handlers.length === 0) {
      this._logger.debug(`No handlers for event type: ${event.eventType}`);
      return;
    }

    this._logger.debug(
      `Dispatching event ${event.eventType} to ${handlers.length} handlers`,
    );

    // 並列実行でパフォーマンスを向上
    const promises = handlers
      .filter((handler) => handler.canHandle(event.eventType))
      .map((handler) => this.safeHandleEvent(handler, event));

    await Promise.allSettled(promises);
  }

  /**
   * イベントハンドラーの登録
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: DomainEventHandler<T>,
  ): void {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, []);
    }

    const handlers = this._handlers.get(eventType)!;
    handlers.push(handler as DomainEventHandler<DomainEvent>);

    this._logger.debug(`Subscribed handler for event type: ${eventType}`);
  }

  /**
   * イベントハンドラーの登録解除
   */
  unsubscribe(
    eventType: string,
    handler: DomainEventHandler<DomainEvent>,
  ): void {
    const handlers = this._handlers.get(eventType);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this._logger.debug(`Unsubscribed handler for event type: ${eventType}`);
    }
  }

  /**
   * 登録されているハンドラー数を取得
   */
  getHandlerCount(eventType?: string): number {
    if (eventType) {
      return (this._handlers.get(eventType) || []).length;
    }

    let total = 0;
    for (const handlers of this._handlers.values()) {
      total += handlers.length;
    }
    return total;
  }

  /**
   * 登録されているイベントタイプ一覧を取得
   */
  getEventTypes(): string[] {
    return Array.from(this._handlers.keys());
  }

  /**
   * 全ハンドラーをクリア
   */
  clear(): void {
    this._handlers.clear();
    this._logger.debug("All event handlers cleared");
  }

  // =============================================================================
  // プライベートメソッド
  // =============================================================================

  /**
   * 安全なイベントハンドリング（エラーを分離）
   */
  private async safeHandleEvent(
    handler: DomainEventHandler<DomainEvent>,
    event: DomainEvent,
  ): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      this._logger.error(
        `Event handler failed for ${event.eventType}: ${error}`,
      );
      // エラーをログに記録するが、他のハンドラーの実行は継続
    }
  }
}

/**
 * Null Objectパターンによるイベントディスパッチャー
 * テストやイベント無効化時に使用
 */
export class NullEventDispatcher implements EventDispatcher {
  async dispatch(_event: DomainEvent): Promise<void> {
    // 何もしない
  }

  subscribe<T extends DomainEvent>(
    _eventType: string,
    _handler: DomainEventHandler<T>,
  ): void {
    // 何もしない
  }

  unsubscribe(
    _eventType: string,
    _handler: DomainEventHandler<DomainEvent>,
  ): void {
    // 何もしない
  }
}
