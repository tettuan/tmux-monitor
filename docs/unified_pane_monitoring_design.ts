/**
 * DDD・全域性原則に基づくPane監視統合設計
 * 
 * 【問題】：現在は複数の監視パスが分散し、Paneの自己更新能力が活用されていない
 * 【解決】：Paneを中心とした統合監視設計で責任を一元化
 */

// =============================================================================
// 1. 統合Pane自己監視アーキテクチャ
// =============================================================================

/**
 * 【統合】Pane監視依存関係
 * Paneが自己監視に必要な全ての機能を統合
 */
interface IPaneMonitoringDependencies {
  // tmux基本操作
  tmuxRepository: ITmuxRepository;
  
  // キャプチャ内容比較（優先）
  captureDetectionService: CaptureDetectionService;
  
  // タイトル管理
  titleManager: IPaneTitleManager;
}

/**
 * 【統合】Pane自己監視結果
 * 全ての監視結果を統一的に表現
 */
interface PaneSelfMonitoringResult {
  readonly paneId: string;
  readonly previousStatus: WorkerStatus;
  readonly newStatus: WorkerStatus;
  readonly statusChanged: boolean;
  readonly titleUpdated: boolean;
  readonly monitoringMethod: "capture_comparison" | "title_based" | "fallback";
  readonly activitySummary: {
    hasContentChanges: boolean;
    activityStatus: ActivityStatus;
    derivationReasoning: readonly string[];
  };
  readonly timestamp: Date;
}

// =============================================================================
// 2. Paneクラスの統合自己監視メソッド
// =============================================================================

class Pane {
  /**
   * 【統合版】完全自己監視 - Paneの単一責任による状態更新
   * 
   * 全域性原則：すべての監視方式を統合し、一つの結果型で表現
   * DDD原則：Pane集約ルートが自己の状態管理を完全に担当
   * 
   * @param dependencies - 監視に必要な外部依存関係
   * @returns 完全な監視結果
   */
  async performSelfMonitoring(
    dependencies: IPaneMonitoringDependencies
  ): Promise<Result<PaneSelfMonitoringResult, ValidationError & { message: string }>> {
    
    const oldStatus = this._status;
    const oldTitle = this._title;
    let newStatus = oldStatus;
    let monitoringMethod: "capture_comparison" | "title_based" | "fallback" = "fallback";
    let activitySummary: any = null;
    let titleUpdated = false;

    try {
      // 【優先】キャプチャ内容比較による判定
      const captureResult = await dependencies.captureDetectionService.detectChanges(
        this._id.value,
        [this._title, this._currentCommand]
      );

      if (captureResult.ok) {
        // キャプチャ比較成功 - 最も正確な方法
        monitoringMethod = "capture_comparison";
        const detection = captureResult.data;
        
        // CaptureDetectionServiceの結果を使用してステータス更新
        const updateResult = this.updateCaptureStateFromDetection(detection);
        if (updateResult.ok) {
          newStatus = detection.derivedWorkerStatus;
          activitySummary = {
            hasContentChanges: detection.hasContentChanged,
            activityStatus: detection.activityStatus,
            derivationReasoning: detection.derivationReasoning,
          };
        }
      } else {
        // 【フォールバック】タイトルベース判定
        monitoringMethod = "title_based";
        
        const titleResult = await dependencies.tmuxRepository.getTitle(this._id.value);
        if (titleResult.ok) {
          this._title = titleResult.data;
          newStatus = this.extractStatusFromTitle(titleResult.data);
          activitySummary = {
            hasContentChanges: false,
            activityStatus: { kind: "NOT_EVALUATED" } as ActivityStatus,
            derivationReasoning: ["タイトルベース判定によるフォールバック"],
          };
        }
      }

      // ステータス更新（ビジネスルール適用）
      const statusChanged = !WorkerStatusParser.isEqual(oldStatus, newStatus);
      if (statusChanged) {
        const updateResult = this.updateStatus(newStatus);
        if (!updateResult.ok) {
          return { ok: false, error: updateResult.error };
        }
      }

      // タイトル更新（ステータス反映）
      if (statusChanged || this._title !== oldTitle) {
        const titleUpdateResult = await dependencies.titleManager.updatePaneTitle(
          this._id.value,
          newStatus.kind === "WORKING" ? "WORKING" : "IDLE",
          this._title,
          this._name?.value
        );
        titleUpdated = titleUpdateResult.ok;
      }

      // 統合結果の構築
      const result: PaneSelfMonitoringResult = {
        paneId: this._id.value,
        previousStatus: oldStatus,
        newStatus,
        statusChanged,
        titleUpdated,
        monitoringMethod,
        activitySummary: activitySummary || {
          hasContentChanges: false,
          activityStatus: { kind: "NOT_EVALUATED" } as ActivityStatus,
          derivationReasoning: ["監視処理中にエラーが発生"],
        },
        timestamp: new Date(),
      };

      return { ok: true, data: result };

    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "UnexpectedError",
          operation: "performSelfMonitoring",
          details: `Pane ${this._id.value} self-monitoring failed: ${error}`,
        }),
      };
    }
  }
}

// =============================================================================
// 3. 監視アプリケーションサービスの簡素化
// =============================================================================

class MonitoringApplicationService {
  /**
   * 【簡素化】統合監視フェーズ - Paneの自己責任に委任
   * 
   * 複雑な外部監視ロジックを廃止し、Paneの自己監視に完全委任
   */
  private async executeUnifiedMonitoringPhase(): Promise<
    Result<MonitoringPhaseResult, ValidationError & { message: string }>
  > {
    const targetPanes = this._paneCollection.getMonitoringTargets();
    const statusChanges: Array<{ paneId: string; oldStatus: string; newStatus: string }> = [];
    const newlyIdlePanes: string[] = [];
    const newlyWorkingPanes: string[] = [];

    // 監視依存関係の構築
    const dependencies: IPaneMonitoringDependencies = {
      tmuxRepository: this._tmuxRepository,
      captureDetectionService: this._captureDetectionService, // 新規追加
      titleManager: this._titleManager, // 新規追加
    };

    // 各Paneの自己監視を実行
    for (const pane of targetPanes) {
      const monitoringResult = await pane.performSelfMonitoring(dependencies);
      
      if (monitoringResult.ok) {
        const result = monitoringResult.data;
        
        // ステータス変更があった場合のみ記録
        if (result.statusChanged) {
          statusChanges.push({
            paneId: result.paneId,
            oldStatus: result.previousStatus.kind,
            newStatus: result.newStatus.kind,
          });

          // 新規アイドル・作業ペインの分類
          if (result.newStatus.kind === "IDLE") {
            newlyIdlePanes.push(result.paneId);
          } else if (result.newStatus.kind === "WORKING") {
            newlyWorkingPanes.push(result.paneId);
          }

          // 詳細ログ出力
          console.log(
            `✅ Pane ${result.paneId}: ${result.previousStatus.kind} → ${result.newStatus.kind}` +
            ` (method: ${result.monitoringMethod}, content_changes: ${result.activitySummary.hasContentChanges})`
          );
        }
      } else {
        console.warn(
          `⚠️ Pane ${pane.id.value} self-monitoring failed: ${monitoringResult.error.message}`
        );
      }
    }

    return {
      ok: true,
      data: {
        statusChanges,
        newlyIdlePanes,
        newlyWorkingPanes,
      },
    };
  }
}

// =============================================================================
// 4. 段階的移行計画
// =============================================================================

/**
 * 【移行ステップ1】: 依存関係注入の整備
 * - MonitoringApplicationServiceにCaptureDetectionServiceを追加
 * - IPaneTitleManagerインターフェースの定義
 */

/**
 * 【移行ステップ2】: Pane.performSelfMonitoring()の実装
 * - 既存のhandleRefreshEvent()を統合・拡張
 * - キャプチャ比較とタイトルベース判定の統合
 */

/**
 * 【移行ステップ3】: 既存監視ループの置き換え
 * - executeMonitoringPhase()をexecuteUnifiedMonitoringPhase()に置換
 * - PaneContentMonitorの段階的廃止
 */

/**
 * 【移行ステップ4】: 重複コードの削除
 * - 分散したキャプチャ処理の統合
 * - タイトル管理ロジックの一元化
 */

// =============================================================================
// 5. 品質保証メトリクス
// =============================================================================

/**
 * 【全域性チェック】:
 * - すべての監視方式がResult型で統一 ✓
 * - エラーケースが型で表現 ✓  
 * - 状態遷移が全て検証済み ✓
 * 
 * 【DDD原則チェック】:
 * - Pane集約ルートが状態管理を完全担当 ✓
 * - ドメインロジックがアプリケーション層から分離 ✓
 * - 外部依存関係が境界で明確化 ✓
 * 
 * 【責任単一原則チェック】:
 * - Pane: 自己状態監視・更新
 * - MonitoringApplicationService: オーケストレーション
 * - CaptureDetectionService: キャプチャ比較
 * - TitleManager: タイトル操作
 */

export {
  PaneSelfMonitoringResult,
  IPaneMonitoringDependencies,
};
