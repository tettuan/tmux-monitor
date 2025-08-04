# キーボード割り込み問題と解決方法

## 問題の概要

tmux-monitor の監視サイクル実行中に、キーボード入力（Ctrl+Cや任意のキー）による中断が効かない問題が発生しました。ユーザーが監視を停止したくても、プログラムが反応せず継続してしまう状態でした。

## 問題の症状

- 監視サイクル開始後、Ctrl+Cを押してもプログラムが停止しない
- 任意のキー入力も検知されない
- macOSではCmd+Wでウィンドウを閉じることはできるが、正常な中断ではない
- デバッグログを見ると、キーリスナーが起動直後に終了していた

## 根本原因

### 1. 初期化順序の問題

`KeyboardInterruptHandler.setup()` メソッドにおいて、状態管理の初期化順序に問題がありました：

```typescript
// 問題のあるコード
async setup(): Promise<Result<void, ServiceError>> {
  if (this.state.kind !== "uninitialized") {
    // ...
  }
  
  // キーリスナーを開始（この時点でstateはまだ"uninitialized"）
  const listenerPromise = this.startKeyListener();
  
  // その後で状態を更新
  this.state = { kind: "initialized", listener: listenerPromise };
}
```

`startKeyListener()` メソッド内では以下のチェックがあります：

```typescript
private async startKeyListener(): Promise<void> {
  this._logger.debug(`Starting key listener (state: ${this.state.kind})`);
  
  if (this.state.kind !== "initialized") {
    this._logger.debug("State not initialized, exiting listener");
    return;
  }
  // ...
}
```

つまり、`startKeyListener()` が呼ばれた時点で `state.kind` が `"uninitialized"` のため、即座にリターンしてしまい、実際のキー入力監視ループが開始されませんでした。

### 2. 監視ループでのキャンセレーションチェック不足

初期の実装では、監視ループ内で `globalCancellationToken` の状態を適切にチェックしていませんでした：

```typescript
// 問題のあるコード
while (cycleCount < maxCycles) {
  // 監視処理...
  await new Promise(resolve => setTimeout(resolve, nextCycleDelay));
}
```

この実装では、`setTimeout` による待機中にキャンセレーションが発生しても、それを検知できませんでした。

## 解決方法

### 1. 初期化順序の修正

状態を先に「initialized」に更新してから、キーリスナーを開始するように修正：

```typescript
async setup(): Promise<Result<void, ServiceError>> {
  // まず状態を initialized に更新
  this.state = { kind: "initialized", listener: null };
  
  // stdin の設定
  if (Deno.stdin.isTerminal()) {
    try {
      Deno.stdin.setRaw(true);
      // 状態が更新された後でリスナーを開始
      const listenerPromise = this.startKeyListener();
      // リスナーのPromiseで状態を更新
      this.state = { kind: "initialized", listener: listenerPromise };
    } catch (error) {
      // エラー処理...
    }
  }
}
```

### 2. キャンセレーション対応の監視ループ

`globalCancellationToken` を使用した中断可能な遅延処理を実装：

```typescript
while (cycleCount < maxCycles && !globalCancellationToken.isCancelled()) {
  // 監視処理...
  
  // キャンセレーション可能な遅延
  const interrupted = await globalCancellationToken.delay(result.nextCycleDelay);
  if (interrupted) {
    this._logger.info("🛑 Monitoring interrupted by user");
    break;
  }
}
```

### 3. 即座の終了処理

`forceExit()` メソッドで遅延なく即座に終了するように修正：

```typescript
forceExit(code: number = 0): void {
  this._logger.debug(`Force exit requested with code ${code}`);
  Deno.exit(code);  // setTimeoutを削除
}
```

## 潜在的な問題と対処法

### 1. ターミナル環境の違い

**問題**: 異なるターミナル環境で raw mode の動作が異なる可能性があります。

**対処法**:
- `Deno.stdin.isTerminal()` でターミナル環境をチェック
- raw mode が設定できない場合は、シグナルハンドラーのみに依存
- エラーハンドリングで graceful degradation を実装

### 2. 非同期処理の競合状態

**問題**: 複数の非同期処理（キーリスナー、シグナルハンドラー、監視ループ）が並行して動作するため、競合状態が発生する可能性があります。

**対処法**:
- 状態管理を atomic に行う
- `globalCancellationToken` を単一の真実の情報源として使用
- cleanup 処理で全ての非同期処理の終了を保証

### 3. stdin のブロッキング

**問題**: `Deno.stdin.read()` はブロッキング操作のため、他の処理を妨げる可能性があります。

**対処法**:
- 独立した非同期タスクとしてキーリスナーを実行
- Promise.race() を使用して複数の終了条件を監視
- タイムアウトを設定して無限待機を防ぐ

### 4. リソースリーク

**問題**: raw mode の設定や非同期リスナーが適切にクリーンアップされない可能性があります。

**対処法**:
```typescript
cleanup(): void {
  this._logger.debug("Cleaning up KeyboardInterruptHandler");
  
  // raw mode を必ずリセット
  if (Deno.stdin.isTerminal()) {
    try {
      Deno.stdin.setRaw(false);
    } catch (error) {
      this._logger.error("Failed to reset terminal", error);
    }
  }
  
  // 状態をリセット
  this.state = { kind: "uninitialized" };
}
```

### 5. デバッグの困難さ

**問題**: 非同期処理とターミナル制御が絡むため、問題の原因特定が困難です。

**対処法**:
- 詳細なデバッグログを実装（LOG_LEVEL=debug）
- 各状態遷移でログ出力
- テスト用のスクリプトを作成して問題を分離

## テスト方法

問題の再現と修正の確認のため、以下のテストスクリプトを使用：

1. **test_direct_stdin.ts**: 基本的なstdin読み取りテスト
2. **test_stdin_blocking.ts**: 非同期stdin処理のテスト
3. **test_key_listener.ts**: rawモードでのキー入力検出テスト
4. **test_monitor_interruption.ts**: 実際の監視ループでの中断テスト

## まとめ

この問題は、非同期処理の初期化順序という基本的なミスが原因でしたが、以下の重要な教訓を得ました：

1. **状態管理の重要性**: 非同期処理では、状態の更新タイミングが critical
2. **デバッグログの価値**: 適切なログがあれば問題の特定が容易
3. **テストの分離**: 複雑な問題は小さなテストケースに分解して検証
4. **Graceful degradation**: 様々な環境での動作を想定した実装

今後同様の問題を防ぐため、非同期処理の初期化パターンを確立し、コードレビューでチェックすることを推奨します。