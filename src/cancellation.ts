/**
 * Global Cancellation Token - Shared across all modules
 * Provides a centralized way to manage cancellation state
 */
export class CancellationToken {
  private cancelled = false;
  private reason: string | null = null;
  private timestamp: number | null = null;

  /**
   * Request cancellation with a reason
   */
  cancel(reason: string): void {
    if (this.cancelled) {
      console.log(`[DEBUG] CancellationToken.cancel(): Already cancelled (reason: ${this.reason}), ignoring new reason: ${reason}`);
      return;
    }

    this.cancelled = true;
    this.reason = reason;
    this.timestamp = Date.now();
    
    console.log(`[DEBUG] CancellationToken.cancel(): Cancellation requested - reason: ${reason}, timestamp: ${this.timestamp}`);
  }

  /**
   * Check if cancellation has been requested
   */
  isCancelled(): boolean {
    if (this.cancelled) {
      console.log(`[DEBUG] CancellationToken.isCancelled(): TRUE - reason: ${this.reason}, timestamp: ${this.timestamp}`);
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
      console.log(`[DEBUG] CancellationToken.reset(): Cancellation state reset`);
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
    console.log(`[DEBUG] CancellationToken.delay(): Starting ${ms}ms delay`);
    const startTime = Date.now();
    const checkInterval = 200; // Check every 200ms

    while (Date.now() - startTime < ms) {
      if (this.isCancelled()) {
        console.log(`[DEBUG] CancellationToken.delay(): Cancelled after ${Date.now() - startTime}ms`);
        return true; // Cancelled
      }

      const remainingTime = ms - (Date.now() - startTime);
      const sleepTime = Math.min(checkInterval, remainingTime);
      
      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }

    console.log(`[DEBUG] CancellationToken.delay(): Completed ${ms}ms delay without cancellation`);
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
export const globalCancellationToken = new CancellationToken();
