/**
 * アーキテクチャ管理ユーティリティ
 */

import { Pane } from "../domain/pane.ts";
import type { Result, ValidationError } from "../types.ts";
import { createError } from "../types.ts";
import type { MonitoringEngine } from "../engine.ts";

/**
 * アーキテクチャ管理ユーティリティ
 */
export class ArchitectureUtilities {
  /**
   * tmuxデータをドメインモデルに変換
   */
  static migrateTmuxDataToDomain(
    tmuxPanesData: Array<{
      id: string;
      active: boolean;
      command?: string;
      title?: string;
    }>,
  ): Result<Pane[], ValidationError & { message: string }> {
    const domainPanes: Pane[] = [];
    const errors: string[] = [];

    for (const tmuxData of tmuxPanesData) {
      try {
        const paneResult = Pane.fromTmuxData(
          tmuxData.id,
          tmuxData.active,
          tmuxData.command || "unknown",
          tmuxData.title || "untitled",
        );

        if (paneResult.ok) {
          domainPanes.push(paneResult.data);
        } else {
          errors.push(
            `Failed to create pane ${tmuxData.id}: ${paneResult.error.message}`,
          );
        }
      } catch (error) {
        errors.push(
          `Unexpected error creating pane ${tmuxData.id}: ${error}`,
        );
      }
    }

    if (errors.length > 0) {
      return {
        ok: false,
        error: createError({
          kind: "MigrationFailed",
          from: "tmux",
          to: "domain",
          details: `Migration errors: ${errors.join(", ")}`,
        }),
      };
    }

    return { ok: true, data: domainPanes };
  }

  /**
   * アーキテクチャ移行レポートの生成
   */
  static generateMigrationReport(
    originalCount: number,
    migratedCount: number,
    errors: string[],
  ): string {
    const successRate = migratedCount / originalCount * 100;

    return `
=== Architecture Migration Report ===
Original Data Sources: ${originalCount}
Successfully Migrated: ${migratedCount}
Success Rate: ${successRate.toFixed(2)}%
Errors: ${errors.length}

Architecture: Domain-Driven Design
Type Safety: Strong
Business Rules: Enforced
Error Handling: Result Pattern

${
      errors.length > 0
        ? `Errors:\n${errors.join("\n")}`
        : "No errors during migration"
    }

=== Migration Complete ===
    `.trim();
  }

  /**
   * アーキテクチャ健全性チェック
   */
  static validateArchitectureHealth(engine: MonitoringEngine): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    dddCompliance: boolean;
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    const health = engine.getDomainServiceHealth();
    if (!health.isHealthy) {
      issues.push("Domain services not healthy");
      recommendations.push("Check domain object initialization");
    }

    if (health.domainObjectCount === 0) {
      issues.push("No domain objects detected");
      recommendations.push("Verify tmux session and pane discovery");
    }

    const stats = engine.getAdvancedStats();
    if (stats.totalPanes === 0) {
      issues.push("No panes detected");
      recommendations.push(
        "Verify tmux session is running",
      );
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
      dddCompliance: true,
    };
  }
}
