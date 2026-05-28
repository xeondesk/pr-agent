/**
 * Circuit Breaker pattern implementation
 * Prevents cascading failures by stopping requests to failing services
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Service failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening
  successThreshold: number; // Successes in HALF_OPEN to close
  timeout: number; // Time in ms before trying again
  name: string;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private nextAttempt: number = 0;
  private config: CircuitBreakerConfig;
  private metrics: CircuitBreakerMetrics = {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
  };

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;

    // Check if circuit should transition to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `Circuit breaker ${this.config.name} is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`
        );
      }

      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.metrics.successCount++;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        console.log(`[v0] Circuit breaker ${this.config.name} closed`);
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.metrics.failureCount++;
    this.lastFailureTime = Date.now();
    this.metrics.lastFailureTime = this.lastFailureTime;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery attempt
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      this.successCount = 0;
      console.warn(`[v0] Circuit breaker ${this.config.name} opened (half-open failure)`);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.timeout;
        console.warn(
          `[v0] Circuit breaker ${this.config.name} opened (${this.failureCount} failures)`
        );
      }
    }
  }

  /**
   * Get circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttempt = 0;
  }
}

// Circuit breaker instances for common services
const breakers = new Map<string, CircuitBreaker>();

export function getOrCreateBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!breakers.has(name)) {
    const defaultConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      name,
      ...config,
    };

    breakers.set(name, new CircuitBreaker(defaultConfig));
  }

  return breakers.get(name)!;
}

/**
 * Execute with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const breaker = getOrCreateBreaker(name, config);
  return breaker.execute(fn);
}

export { CircuitBreaker };
