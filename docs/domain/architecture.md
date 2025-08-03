# tmux-monitor アーキテクチャ設計図

## 1. システム概要

### 1.1 アーキテクチャ概観

```mermaid
graph TB
    subgraph "Presentation Layer"
        CLI[CLI Interface]
        App[Application Controller]
    end
    
    subgraph "Application Layer"
        ME[MonitoringEngine]
        CO[CaptureOrchestrator]
    end
    
    subgraph "Domain Layer"
        subgraph "Monitoring Domain"
            P[Pane]
            PC[PaneCollection]
            STS[StatusTransitionService]
            PNS[PaneNamingService]
        end
        
        subgraph "Orchestration Domain"
            MC[MonitoringCycle]
            MCS[MonitoringCycleService]
            MCC[MonitoringCycleCoordinator]
        end
    end
    
    subgraph "Infrastructure Layer"
        TS[TmuxSession]
        CE[CommandExecutor]
        PCC[PaneCommunicator]
        UCA[UnifiedCaptureAdapter]
    end
    
    subgraph "Core Domain"
        DI[DIContainer]
        CFG[Configuration]
        CT[CancellationToken]
        LOG[Logger]
        TM[TimeManager]
    end
    
    CLI --> App
    App --> ME
    ME --> PC
    ME --> MCS
    PC --> P
    MCS --> MC
    ME --> CO
    CO --> UCA
    UCA --> TS
    TS --> CE
    DI -.-> ME
    DI -.-> PC
    DI -.-> TS
```

## 2. シーケンス図

### 2.1 監視サイクル実行シーケンス

```mermaid
sequenceDiagram
    participant CLI as CLI Interface
    participant App as Application
    participant ME as MonitoringEngine
    participant MCS as MonitoringCycleService
    participant PC as PaneCollection
    participant UCA as UnifiedCaptureAdapter
    participant TS as TmuxSession
    participant P as Pane
    
    Note over CLI, P: 30秒監視サイクルの実行フロー
    
    CLI->>App: startMonitoring()
    App->>ME: monitor()
    
    loop 30秒サイクル (4時間継続)
        ME->>MCS: startCycle()
        MCS->>PC: refreshPanes()
        PC->>UCA: captureAllPanes()
        
        loop 各ペインに対して
            UCA->>TS: executeCapture(paneId)
            TS-->>UCA: paneContent
            UCA->>P: updateContent(content)
            P->>P: detectStatusChange()
            
            alt ステータス変更あり
                P->>PC: notifyStatusChange()
                PC->>ME: reportStatusChange()
            end
        end
        
        MCS->>ME: cycleCompleted()
        
        alt DONE/IDLEペインあり
            ME->>TS: sendClearCommand(paneId)
            Note over TS: /clear 送信 → 0.2秒待機 → Enter送信
        end
        
        Note over ME: 30秒待機
    end
    
    ME->>App: monitoringCompleted()
```

### 2.2 ペイン状態更新シーケンス

```mermaid
sequenceDiagram
    participant UCA as UnifiedCaptureAdapter
    participant P as Pane
    participant STS as StatusTransitionService
    participant PNS as PaneNamingService
    participant TS as TmuxSession
    
    Note over UCA, TS: ペイン内容取得から状態更新まで
    
    UCA->>TS: capturePane(paneId)
    TS-->>UCA: content
    UCA->>P: updateContent(content)
    
    P->>STS: determineStatus(content, previousContent)
    
    alt 内容に変化あり
        STS-->>P: WORKING
    else 内容に変化なし
        STS-->>P: IDLE
    else `/clear ⎿ (no content)` パターン
        STS-->>P: DONE
    else エラーパターン検出
        STS-->>P: BLOCKED
    end
    
    P->>P: updateStatus(newStatus)
    
    alt ステータス変更あり
        P->>PNS: updatePaneTitle(paneId, status)
        PNS->>TS: setTitle(paneId, "[STATUS] originalTitle")
    end
    
    P->>P: addToHistory(statusChange)
```

### 2.3 予約実行・指示書送信シーケンス

```mermaid
sequenceDiagram
    participant CLI as CLI Interface
    participant App as Application
    participant ME as MonitoringEngine
    participant TM as TimeManager
    participant TS as TmuxSession
    participant FS as FileSystem
    
    Note over CLI, FS: 予約実行と指示書送信フロー
    
    CLI->>App: startWithSchedule(time, instructionFile)
    App->>TM: calculateDelay(targetTime)
    TM-->>App: delayMs
    
    App->>App: setTimeout(delayMs)
    Note over App: 指定時刻まで待機
    
    App->>ME: startContinuousMonitoring()
    
    alt 指示書ファイル指定あり
        ME->>FS: readInstructionFile(path)
        FS-->>ME: instructions
        ME->>TS: sendToMainPane(instructions)
        Note over TS: 指示書内容をmain paneに送信
        TS->>TS: sendEnter()
    end
    
    ME->>ME: beginMonitoringLoop()
```

## 3. クラス図

### 3.1 Monitoring Domain クラス構造

```mermaid
classDiagram
    class Pane {
        <<AggregateRoot>>
        -id: PaneId
        -name: PaneName
        -status: WorkerStatus
        -title: string
        -history: StatusHistory[]
        -metadata: PaneMetadata
        +updateStatus(status: WorkerStatus): Result~void~
        +updateContent(content: string): Result~void~
        +getStatusTransitions(): StatusHistory[]
        +validateInvariants(): Result~void~
    }
    
    class PaneId {
        <<ValueObject>>
        -value: string
        +create(value: string): Result~PaneId~
        +toString(): string
        +validate(): boolean
    }
    
    class PaneName {
        <<ValueObject>>
        -role: PaneRole
        -index: number
        +create(role: PaneRole, index?: number): Result~PaneName~
        +toString(): string
        +isMainPane(): boolean
        +isWorkerPane(): boolean
    }
    
    class WorkerStatus {
        <<ValueObject>>
        <<enumeration>>
        IDLE
        WORKING
        BLOCKED
        DONE
        TERMINATED
        UNKNOWN
    }
    
    class PaneCollection {
        -panes: Map~PaneId, Pane~
        -mainPane: PaneId
        +addPane(pane: Pane): Result~void~
        +updatePaneStatus(id: PaneId, status: WorkerStatus): Result~void~
        +getMainPane(): Result~Pane~
        +getWorkerPanes(): Pane[]
        +refreshFromSession(): Result~void~
    }
    
    class StatusTransitionService {
        +determineStatus(content: string, previous: string): WorkerStatus
        +validateTransition(from: WorkerStatus, to: WorkerStatus): Result~void~
        +isValidTransition(from: WorkerStatus, to: WorkerStatus): boolean
    }
    
    class PaneNamingService {
        -roleAssignments: PaneRole[]
        +assignRole(paneId: PaneId, index: number): Result~PaneName~
        +generateWorkerName(index: number): PaneName
        +validateNamingRules(): Result~void~
    }
    
    Pane --> PaneId : contains
    Pane --> PaneName : contains
    Pane --> WorkerStatus : contains
    PaneCollection --> Pane : manages
    StatusTransitionService --> WorkerStatus : determines
    PaneNamingService --> PaneName : creates
```

### 3.2 Orchestration Domain クラス構造

```mermaid
classDiagram
    class MonitoringEngine {
        <<AggregateRoot>>
        -appService: MonitoringService
        -cycleCoordinator: MonitoringCycleCoordinator
        -eventDispatcher: EventDispatcher
        +monitor(): Result~void~
        +oneTimeMonitor(): Result~void~
        +startContinuousMonitoring(): Result~void~
        +refreshPaneList(): Result~void~
        +sendInstructionFileToMainPane(path: string): Result~void~
    }
    
    class MonitoringCycle {
        <<ValueObject>>
        -id: string
        -phase: CyclePhase
        -startTime: Date
        -targetPanes: PaneId[]
        -config: MonitoringConfig
        +create(config: MonitoringConfig): Result~MonitoringCycle~
        +advance(): Result~MonitoringCycle~
        +isCompleted(): boolean
        +getDuration(): number
    }
    
    class MonitoringCycleService {
        -currentCycle: MonitoringCycle | null
        -cycleHistory: MonitoringCycle[]
        +startNewCycle(config: MonitoringConfig): Result~MonitoringCycle~
        +completeCycle(): Result~void~
        +getCurrentCycle(): MonitoringCycle | null
        +validateCycleConstraints(): Result~void~
    }
    
    class MonitoringCycleCoordinator {
        -paneCollection: PaneCollection
        -captureOrchestrator: CaptureOrchestrator
        +coordinateCycle(cycle: MonitoringCycle): Result~void~
        +handleCycleCompletion(cycle: MonitoringCycle): Result~void~
        +manageFailureRecovery(error: Error): Result~void~
    }
    
    class CaptureOrchestrator {
        -unifiedAdapter: UnifiedCaptureAdapter
        +orchestrateCapture(panes: PaneId[]): Result~CaptureResult[]~
        +handleCaptureFailure(paneId: PaneId, error: Error): Result~void~
        +validateCaptureResults(results: CaptureResult[]): Result~void~
    }
    
    MonitoringEngine --> MonitoringCycleService : uses
    MonitoringEngine --> MonitoringCycleCoordinator : uses
    MonitoringCycleService --> MonitoringCycle : manages
    MonitoringCycleCoordinator --> CaptureOrchestrator : coordinates
```

### 3.3 Infrastructure Domain クラス構造

```mermaid
classDiagram
    class TmuxSession {
        <<AggregateRoot>>
        -sessionId: string
        -windowId: string
        -executor: CommandExecutor
        +discoverOptimalSession(): Result~TmuxSession~
        +listPanes(): Result~PaneId[]~
        +capturePane(id: PaneId): Result~string~
        +sendCommand(id: PaneId, command: string): Result~void~
        +setTitle(id: PaneId, title: string): Result~void~
    }
    
    class CommandExecutor {
        +execute(command: string): Result~string~
        +executeWithTimeout(command: string, timeout: number): Result~string~
        +validateCommand(command: string): Result~void~
        +escapeArguments(args: string[]): string[]
    }
    
    class PaneCommunicator {
        -session: TmuxSession
        +sendToPane(id: PaneId, content: string): Result~void~
        +sendEnter(id: PaneId): Result~void~
        +sendClearCommand(id: PaneId): Result~void~
        +verifyClearSuccess(id: PaneId): Result~boolean~
    }
    
    class UnifiedCaptureAdapter {
        -session: TmuxSession
        -captureCache: Map~PaneId, CaptureResult~
        +captureAllPanes(panes: PaneId[]): Result~CaptureResult[]~
        +capturePane(id: PaneId): Result~CaptureResult~
        +invalidateCache(id: PaneId): void
        +getCachedResult(id: PaneId): CaptureResult | null
    }
    
    class Logger {
        +info(message: string, context?: object): void
        +error(message: string, error?: Error): void
        +debug(message: string, context?: object): void
        +warn(message: string, context?: object): void
    }
    
    class TimeManager {
        +getCurrentTime(): Date
        +calculateDelay(targetTime: string): number
        +createTimeout(delay: number): Promise~void~
        +validateTimeFormat(time: string): Result~void~
    }
    
    TmuxSession --> CommandExecutor : uses
    PaneCommunicator --> TmuxSession : uses
    UnifiedCaptureAdapter --> TmuxSession : uses
```

## 4. 状態図

### 4.1 WorkerStatus 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> UNKNOWN : 初期状態
    
    UNKNOWN --> IDLE : 内容安定
    UNKNOWN --> WORKING : 作業開始
    UNKNOWN --> BLOCKED : エラー検出
    
    IDLE --> WORKING : 内容変化検出
    IDLE --> DONE : /clear完了
    IDLE --> BLOCKED : エラー発生
    
    WORKING --> IDLE : 内容変化停止
    WORKING --> DONE : 作業完了
    WORKING --> BLOCKED : エラー発生
    WORKING --> TERMINATED : 異常終了
    
    BLOCKED --> IDLE : 復旧確認
    BLOCKED --> WORKING : 作業再開
    BLOCKED --> TERMINATED : 復旧不可
    
    DONE --> IDLE : /clear後
    DONE --> WORKING : 新規作業開始
    
    TERMINATED --> UNKNOWN : 再初期化
    TERMINATED --> [*] : ペイン除外
    
    note right of IDLE : タスク割当可能
    note right of WORKING : 監視継続必要
    note right of BLOCKED : 介入判断必要
    note right of DONE : クリア処理対象
    note right of TERMINATED : 調査必要
```

### 4.2 監視サイクル状態遷移図

```mermaid
stateDiagram-v2
    [*] --> Initializing : 監視開始
    
    Initializing --> Discovering : 初期化完了
    Discovering --> Classifying : セッション発見
    Classifying --> Monitoring : ペイン分類完了
    
    state Monitoring {
        [*] --> Capturing
        Capturing --> Analyzing : キャプチャ完了
        Analyzing --> Updating : 分析完了
        Updating --> Reporting : 更新完了
        Reporting --> Waiting : 報告完了
        Waiting --> Capturing : 30秒経過
    }
    
    Monitoring --> Terminating : 終了条件
    Monitoring --> Error : エラー発生
    
    Error --> Recovering : 復旧処理
    Recovering --> Monitoring : 復旧成功
    Recovering --> Terminating : 復旧失敗
    
    Terminating --> [*] : 監視終了
    
    note right of Discovering : セッション自動発見
    note right of Classifying : ペイン役割割当
    note right of Capturing : 内容キャプチャ
    note right of Analyzing : ステータス判定
    note right of Updating : タイトル更新
    note right of Reporting : 変更報告
```

### 4.3 ペインライフサイクル状態図

```mermaid
stateDiagram-v2
    [*] --> Created : ペイン発見
    
    Created --> Classified : 役割割当
    Classified --> Monitoring : 監視開始
    
    state Monitoring {
        [*] --> Active
        Active --> Captured : 内容取得
        Captured --> Analyzed : ステータス判定
        Analyzed --> Updated : 情報更新
        Updated --> Active : 次回まで待機
        
        Updated --> Clearing : DONE判定時
        Clearing --> Cleared : クリア完了
        Cleared --> Active : 監視再開
    }
    
    Monitoring --> Excluded : 監視除外
    Monitoring --> Failed : 異常検出
    
    Failed --> Recovering : 復旧試行
    Recovering --> Monitoring : 復旧成功
    Recovering --> Excluded : 復旧失敗
    
    Excluded --> [*] : ペイン除去
    
    note right of Classified : main/manager/worker/secretary
    note right of Clearing : /clear コマンド送信
    note right of Failed : 通信エラー・応答なし
```

## 5. コンポーネント図

### 5.1 ドメイン境界コンポーネント図

```mermaid
graph TB
    subgraph "Monitoring Domain"
        subgraph "Entities"
            P[Pane]
        end
        subgraph "Value Objects"
            PID[PaneId]
            PN[PaneName] 
            WS[WorkerStatus]
        end
        subgraph "Services"
            PC[PaneCollection]
            STS[StatusTransitionService]
            PNS[PaneNamingService]
        end
    end
    
    subgraph "Orchestration Domain"
        subgraph "Entities"
            MC[MonitoringCycle]
        end
        subgraph "Services"
            ME[MonitoringEngine]
            MCS[MonitoringCycleService]
            MCC[MonitoringCycleCoordinator]
            CO[CaptureOrchestrator]
        end
    end
    
    subgraph "Infrastructure Domain"
        subgraph "Entities"
            TS[TmuxSession]
        end
        subgraph "Services"
            CE[CommandExecutor]
            PCC[PaneCommunicator]
            UCA[UnifiedCaptureAdapter]
            LOG[Logger]
            TM[TimeManager]
        end
    end
    
    subgraph "Core Domain"
        DI[DIContainer]
        CFG[Configuration]
        CT[CancellationToken]
        RT[Result<T>]
        VE[ValidationError]
    end
    
    %% Domain Dependencies
    ME --> PC
    ME --> MCS
    MCS --> MC
    ME --> CO
    CO --> UCA
    
    PC --> P
    P --> PID
    P --> PN
    P --> WS
    PC --> STS
    PC --> PNS
    
    UCA --> TS
    TS --> CE
    TS --> PCC
    
    %% Core Dependencies
    DI -.-> ME
    DI -.-> PC
    DI -.-> TS
    CFG -.-> ME
    CT -.-> ME
    LOG -.-> ME
    TM -.-> ME
```

## 6. デプロイメント図

### 6.1 実行環境構成図

```mermaid
graph TB
    subgraph "Development Environment"
        subgraph "Local Machine"
            subgraph "Deno Runtime"
                APP[tmux-monitor CLI]
            end
            subgraph "tmux Session"
                MAIN[Main Pane]
                MGR1[Manager1 Pane]
                MGR2[Manager2 Pane]
                SEC[Secretary Pane]
                WK1[Worker1 Pane]
                WK2[Worker2 Pane]
                WKN[Worker N Panes...]
            end
            subgraph "File System"
                INST[Instruction Files]
                LOG_FILE[Log Files]
                CONFIG[Config Files]
            end
        end
    end
    
    subgraph "CI/CD Environment"
        subgraph "GitHub Actions"
            TEST[Test Runner]
            BUILD[Build Process]
            DEPLOY[JSR Deploy]
        end
    end
    
    subgraph "Distribution"
        JSR[JSR Registry]
        NPM[npm Registry]
    end
    
    APP --> MAIN : 指示送信
    APP --> MGR1 : 状態報告
    APP --> MGR2 : 状態報告  
    APP --> SEC : 補助作業
    APP --> WK1 : /clear送信
    APP --> WK2 : /clear送信
    APP --> WKN : /clear送信
    
    APP --> INST : 読み込み
    APP --> LOG_FILE : 出力
    APP --> CONFIG : 読み込み
    
    TEST --> APP : テスト実行
    BUILD --> JSR : パッケージ公開
    DEPLOY --> NPM : 配布
```

## 7. 通信プロトコル詳細

### 7.1 イベント駆動通信フロー

```mermaid
sequenceDiagram
    participant MD as Monitoring Domain
    participant OD as Orchestration Domain  
    participant ID as Infrastructure Domain
    participant CD as Core Domain
    
    Note over MD, CD: ドメイン間イベント通信
    
    OD->>MD: StartMonitoringCycle
    Note right of MD: {targetPanes, config}
    
    MD->>OD: MonitoringCycleCompleted
    Note left of OD: {cycleId, changes, timestamp}
    
    ID->>MD: PaneContentChanged
    Note right of MD: {paneId, content, timestamp}
    
    OD->>ID: ExecuteCapture
    Note left of ID: {paneId, captureType}
    
    CD->>MD: DependencyInjection
    CD->>OD: DependencyInjection
    CD->>ID: DependencyInjection
    Note over CD: {logger, timeManager, cancellationToken}
```

### 7.2 エラーハンドリングフロー

```mermaid
graph TB
    START[処理開始] --> VALIDATE[入力検証]
    VALIDATE --> |検証成功| EXECUTE[処理実行]
    VALIDATE --> |検証失敗| ERR_VALIDATION[ValidationError]
    
    EXECUTE --> |成功| SUCCESS[Result.success]
    EXECUTE --> |失敗| ERR_EXECUTION[ExecutionError]
    
    ERR_VALIDATION --> LOG_ERROR[エラーログ]
    ERR_EXECUTION --> LOG_ERROR
    
    LOG_ERROR --> RECOVERY[復旧処理]
    RECOVERY --> |復旧成功| EXECUTE
    RECOVERY --> |復旧失敗| ERR_FATAL[FatalError]
    
    SUCCESS --> END[処理完了]
    ERR_FATAL --> END
    
    style ERR_VALIDATION fill:#ffcccc
    style ERR_EXECUTION fill:#ffcccc  
    style ERR_FATAL fill:#ff9999
    style SUCCESS fill:#ccffcc
```

この設計図により、tmux-monitorのアーキテクチャ全体が可視化され、要求事項とドメイン境界設計が統合された包括的な設計仕様として活用できます。