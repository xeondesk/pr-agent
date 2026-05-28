/**
 * Retry logic with exponential backoff
 * Automatically retries failed operations with increasing delays
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean; // Add randomness to prevent thundering herd
  retryableErrors: (error: unknown) => boolean;
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: (error) => {
    // Retry on network errors and 5xx server errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset')
      );
    }

    return false;
  },
};

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    // Add random jitter: ±25% of delay
    const jitter = delay * (Math.random() * 0.5 - 0.25);
    delay += jitter;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!finalConfig.retryableErrors(error)) {
        throw error;
      }

      // Don't delay after final attempt
      if (attempt === finalConfig.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, finalConfig);
      console.log(
        `[v0] Retry attempt ${attempt}/${finalConfig.maxAttempts}, waiting ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry with custom retry condition
 */
export async function retryIf<T>(
  fn: () => Promise<T>,
  shouldRetry: (attempt: number, error: unknown) => boolean,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(attempt, error)) {
        throw error;
      }

      if (attempt === finalConfig.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, finalConfig);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper for promises
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error(`Operation timed out after ${timeoutMs}ms`)
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(timeoutError), timeoutMs)
    ),
  ]);
}

/**
 * Retry with timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };

  return retry(
    () => withTimeout(fn(), timeoutMs),
    finalConfig
  );
}

/**
 * Batch retry for multiple items
 */
export async function retryBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  config: Partial<RetryConfig> = {}
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = [];

  for (const item of items) {
    try {
      const result = await retry(() => fn(item), config);
      results.push(result);
    } catch (error) {
      results.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return results;
}
