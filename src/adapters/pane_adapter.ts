/**
 * Paneアダプター
 *
 * ドメインモデルに基づいた実装を提供。
 */

import { Pane } from "../domain/pane.ts";
import type { Result, ValidationError } from "../core/types.ts";

/**
 * Paneアダプター
 *
 * ドメインモデルに基づいた実装を提供。
 */
export class PaneAdapter {
  private readonly _pane: Pane;

  private constructor(pane: Pane) {
    this._pane = pane;
  }

  /**
   * tmuxデータからPaneを作成
   */
  static fromTmuxData(
    id: string,
    active: boolean,
    command?: string,
    title?: string,
  ): Result<PaneAdapter, ValidationError & { message: string }> {
    const paneResult = Pane.fromTmuxData(
      id,
      active,
      command || "unknown",
      title || "untitled",
    );

    if (!paneResult.ok) {
      return paneResult;
    }

    return {
      ok: true,
      data: new PaneAdapter(paneResult.data),
    };
  }

  /**
   * ペインから作成
   */
  static fromPane(pane: Pane): PaneAdapter {
    return new PaneAdapter(pane);
  }

  // =============================================================================
  // API互換性メソッド
  // =============================================================================

  get id(): string {
    return this._pane.id.value;
  }

  isActive(): boolean {
    return this._pane.isActive;
  }

  getCommand(): string | null {
    return this._pane.currentCommand;
  }

  getTitle(): string | null {
    return this._pane.title;
  }

  /**
   * ドメインモデルへのアクセス
   */
  get domainModel(): Pane {
    return this._pane;
  }

  /**
   * 拡張ステータス情報
   */
  getExtendedStatus(): {
    id: string;
    name: string | null;
    isActive: boolean;
    currentCommand: string;
    title: string;
    lastActivity: Date;
    role: "manager" | "worker" | "secretary" | "unknown";
    isAvailableForTask: boolean;
  } {
    return {
      id: this._pane.id.value,
      name: this._pane.name?.value || null,
      isActive: this._pane.isActive,
      currentCommand: this._pane.currentCommand,
      title: this._pane.title,
      lastActivity: new Date(),
      role: "unknown",
      isAvailableForTask: !this._pane.isActive,
    };
  }
}
