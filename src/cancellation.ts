/**
 * Global Cancellation Token - Provides centralized cancellation management.
 *
 * The CancellationToken class offers a robust cancellation mechanism that can be
 * shared across all modules. It supports delay operations with cancellation,
 * reason tracking, and timestamp recording.
 *
 * ## Features
 * - Centralized cancellation state management
 * - Reason and timestamp tracking
 * - Delay operations with cancellation support
 * - Debug logging for cancellation events
 * - Race condition handling for async operations
 *
 * @example
 * ```typescript
 * const token = new CancellationToken();
 *
 * // Request cancellation
 * token.cancel("User requested stop");
 *
 * // Check cancellation status
 * if (token.isCancelled()) {
 *   console.log("Operation was cancelled:", token.getReason());
 * }
 *
 * // Use with delays
 * const interrupted = await token.delay(5000);
 * if (interrupted) {
 *   console.log("Delay was interrupted");
 * }
 * ```
 */
export class CancellationToken {
  private cancelled = false;
  private reason: string | null = null;
  private timestamp: number | null = null;

  /**
   * Requests cancellation with a specific reason.
   *
   * Once cancelled, the token cannot be cancelled again with a different reason.
   * The first cancellation reason and timestamp are preserved.
   *
   * @param reason - The reason for cancellation
   * @example
   * ```typescript
   * token.cancel("User pressed Ctrl+C");
   * ```
   */
  cancel(reason: string): void {
    if (this.cancelled) {
      // console.log(
      //   `[DEBUG] CancellationToken.cancel(): Already cancelled (reason: ${this.reason}), ignoring new reason: ${reason}`,
      // );
      return;
    }

    this.cancelled = true;
    this.reason = reason;
    this.timestamp = Date.now();

    // console.log(
    //   `[DEBUG] CancellationToken.cancel(): Cancellation requested - reason: ${reason}, timestamp: ${this.timestamp}`,
    // );
  }

  /**
   * Checks if cancellation has been requested.
   *
   * @returns True if cancellation has been requested, false otherwise
   * @example
   * ```typescript
   * if (token.isCancelled()) {
   *   console.log("Operation should stop");
   * }
   * ```
   */
  isCancelled(): boolean {
    if (this.cancelled) {
      // console.log(
      //   `[DEBUG] CancellationToken.isCancelled(): TRUE - reason: ${this.reason}, timestamp: ${this.timestamp}`,
      // );
    }
    return this.cancelled;
  }

  /**
   * Get the cancellation reason
   */
  getReason(): string | null {
    return this.reason;
  }

  /**
   * Get the cancellation timestamp
   */
  getTimestamp(): number | null {
    return this.timestamp;
  }

  /**
   * Reset the cancellation state (for testing or reuse)
   */
  reset(): void {
    const wasCanelled = this.cancelled;
    this.cancelled = false;
    this.reason = null;
    this.timestamp = null;

    if (wasCanelled) {
      // console.log(
      //   `[DEBUG] CancellationToken.reset(): Cancellation state reset`,
      // );
    }
  }

  /**
   * Check cancellation and throw if cancelled
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error(`Operation cancelled: ${this.reason}`);
    }
  }

  /**
   * Create a timeout that respects cancellation
   */
  async delay(ms: number): Promise<boolean> {
    // console.log(`[DEBUG] CancellationToken.delay(): Starting ${ms}ms delay`);
    const startTime = Date.now();
    const checkInterval = 200; // Check every 200ms

    while (Date.now() - startTime < ms) {
      if (this.isCancelled()) {
        // console.log(
        //   `[DEBUG] CancellationToken.delay(): Cancelled after ${
        //     Date.now() - startTime
        //   }ms`,
        // );
        return true; // Cancelled
      }

      const remainingTime = ms - (Date.now() - startTime);
      const sleepTime = Math.min(checkInterval, remainingTime);

      if (sleepTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
      }
    }

    // console.log(
    //   `[DEBUG] CancellationToken.delay(): Completed ${ms}ms delay without cancellation, final state = ${this.cancelled}`,
    // );
    return false; // Not cancelled
  }

  /**
   * Create a race between a promise and cancellation
   */
  race<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: number | null = null;
      let resolved = false;

      const checkCancellation = () => {
        if (resolved) return;

        if (this.isCancelled()) {
          resolved = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          reject(new Error(`Operation cancelled: ${this.reason}`));
          return;
        }

        timeoutId = setTimeout(checkCancellation, 100);
      };

      checkCancellation();

      promise.then((result) => {
        if (!resolved) {
          resolved = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          resolve(result);
        }
      }).catch((error) => {
        if (!resolved) {
          resolved = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          reject(error);
        }
      });
    });
  }
}

/**
 * Global cancellation token instance
 */
export const globalCancellationToken: CancellationToken =
  new CancellationToken();
