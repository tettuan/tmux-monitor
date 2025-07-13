# Pane Monitoring Architecture

## Overview

The pane monitoring system implements intelligent content change detection and automatic title updates for tmux panes. This feature runs on a 30-second interval cycle, capturing pane content and determining activity status based on content changes.

## Core Components

### PaneContentMonitor

Responsible for capturing and comparing pane content over time.

```typescript
export class PaneContentMonitor {
  async capturePane(paneId: string): Promise<Result<PaneCapture, ValidationError>>
  async monitorPane(paneId: string): Promise<Result<PaneMonitorResult, ValidationError>>
  async monitorPanes(paneIds: string[]): Promise<PaneMonitorResult[]>
}
```

#### Key Features

- **Content Capture**: Uses `tmux capture-pane -t <pane> -p` to get pane content
- **Change Detection**: Compares current content with previous capture
- **History Management**: Maintains up to 10 recent captures per pane
- **Content Normalization**: Handles whitespace and line ending differences

#### Status Determination Logic

- **First Capture**: Defaults to `IDLE` (no previous content to compare)
- **Subsequent Captures**: 
  - `WORKING` if content has changed since last capture
  - `IDLE` if content remains the same

### PaneTitleManager

Handles updating and restoring pane titles based on monitoring results.

```typescript
export class PaneTitleManager {
  async updatePaneTitle(paneId: string, status: PaneMonitorStatus, originalTitle?: string)
  async updatePaneTitles(monitorResults: PaneMonitorResult[], originalTitles?: Map<string, string>)
  async restorePaneTitle(paneId: string, originalTitle: string)
}
```

#### Title Format

- **Active Status**: `[WORKING] <original_title>`
- **Idle Status**: `[IDLE] <original_title>`
- **Example**: `[WORKING] tmux`, `[IDLE] vim session`

## Integration with MonitoringEngine

### Monitoring Cycle Integration

The pane monitoring is integrated into the main 30-second monitoring cycles:

```typescript
// In MonitoringEngine.monitor()
for (let i = 0; i < monitoringCycles; i++) {
  // Send ENTER to all panes
  await this.sendEnterToAllPanesCycle();
  
  // Monitor pane content changes and update titles
  await this.monitorPaneChanges();
  
  // Wait 30 seconds
  await this.keyboardHandler.sleepWithCancellation(TIMING.ENTER_SEND_CYCLE_DELAY);
}
```

### Title Management

- **Initialization**: Original titles are stored before first modification
- **Updates**: Titles are updated every 30 seconds based on activity
- **Restoration**: Original titles are restored when monitoring exits

## Technical Implementation

### Content Comparison

```typescript
private hasContentChanged(previous: PaneCapture, current: PaneCapture): boolean {
  const prevContent = this.normalizeContent(previous.content);
  const currContent = this.normalizeContent(current.content);
  return prevContent !== currContent;
}

private normalizeContent(content: string): string {
  return content
    .trim()
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\s+$/gm, '');  // Remove trailing whitespace
}
```

### Error Handling

- Graceful degradation when pane capture fails
- Automatic fallback to `IDLE` status for failed captures
- Comprehensive error logging with specific error types

### Memory Management

- Limited capture history (10 entries per pane)
- Automatic cleanup of old captures
- Clear separation of concerns between monitoring and title management

## Usage Examples

### Basic Monitoring

```typescript
const monitor = PaneContentMonitor.create(commandExecutor, logger);
const titleManager = PaneTitleManager.create(commandExecutor, logger);

// Monitor panes
const results = await monitor.monitorPanes(['%0', '%1', '%2']);

// Update titles
await titleManager.updatePaneTitles(results);
```

### With Original Title Preservation

```typescript
// Store original titles
const originalTitles = new Map<string, string>();
for (const paneId of paneIds) {
  const paneDetail = await getPaneDetail(paneId);
  originalTitles.set(paneId, paneDetail.title);
}

// Monitor and update
const results = await monitor.monitorPanes(paneIds);
await titleManager.updatePaneTitles(results, originalTitles);

// Later, restore original titles
for (const [paneId, originalTitle] of originalTitles) {
  await titleManager.restorePaneTitle(paneId, originalTitle);
}
```

## Performance Considerations

### Efficient Capture

- Single tmux command per pane capture
- Minimal content processing
- Asynchronous processing for multiple panes

### Resource Usage

- Bounded memory usage with history limits
- Efficient string comparison algorithms
- Lazy initialization of monitoring components

## Testing

The pane monitoring system includes comprehensive testing:

```bash
# Test the monitoring functionality
deno run --allow-run test_pane_monitoring.ts
```

This test script:
1. Captures content from available tmux panes
2. Demonstrates status determination logic
3. Shows title update functionality
4. Tests title restoration

## Integration Points

### With Status Management

The monitoring results integrate with the existing `PaneStatusManager`:

```typescript
for (const result of monitorResults) {
  const workerStatus = { kind: result.status } as WorkerStatus;
  this.statusManager.updateStatus(result.paneId, workerStatus);
}
```

### With Dependency Injection

Components are registered in the DI container:

```typescript
this.register("paneContentMonitor", () => 
  PaneContentMonitor.create(
    this.get("commandExecutor"), 
    this.get("logger")
  )
);

this.register("paneTitleManager", () => 
  PaneTitleManager.create(
    this.get("commandExecutor"),
    this.get("logger")
  )
);
```

## Future Enhancements

### Configurable Monitoring

- Adjustable monitoring intervals
- Configurable content comparison sensitivity
- Custom title formats

### Advanced Detection

- Process-based activity detection
- Command history analysis
- Resource usage monitoring

### User Interface

- Real-time status indicators
- Historical activity graphs
- Interactive title management
