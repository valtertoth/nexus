/**
 * Retry wrapper for async operations with exponential backoff + jitter.
 *
 * Default: up to 2 retries (3 total attempts), 1s base delay.
 * Backoff formula: min(baseDelay * 2^attempt + jitter, 30s)
 * Jitter: random 0-30% of the delay to prevent thundering herd.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt > maxRetries) {
        console.error(`[Retry] ${label} failed after ${maxRetries + 1} attempts:`, err)
        throw err
      }
      // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
      const exponentialDelay = Math.min(delayMs * Math.pow(2, attempt - 1), 30_000)
      // Add jitter: 0-30% of the delay
      const jitter = Math.floor(exponentialDelay * Math.random() * 0.3)
      const totalDelay = exponentialDelay + jitter
      console.warn(`[Retry] ${label} attempt ${attempt} failed, retrying in ${totalDelay}ms...`)
      await new Promise(r => setTimeout(r, totalDelay))
    }
  }
  throw new Error('unreachable')
}

/**
 * Wrap a promise with a timeout deadline.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer))
  })
}

// ---------------------------------------------------------------------------
// Circuit Breaker — protects against cascading failures from external APIs
// ---------------------------------------------------------------------------
//
// States:
//   CLOSED   → normal operation, requests go through
//   OPEN     → too many failures, requests are rejected immediately (fast fail)
//   HALF_OPEN → after cooldown, allows ONE probe request to test recovery
//
// Usage:
//   const claudeBreaker = new CircuitBreaker('Claude API', { threshold: 5 })
//   const result = await claudeBreaker.execute(() => callClaude(...))
//

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  threshold?: number
  /** How long (ms) to stay in OPEN state before probing. Default: 60_000 (60s) */
  cooldownMs?: number
  /** Label for logging. Defaults to name. */
  label?: string
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly name: string
  private readonly threshold: number
  private readonly cooldownMs: number

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name
    this.threshold = options.threshold ?? 5
    this.cooldownMs = options.cooldownMs ?? 60_000
  }

  /** Current state for health checks / metrics */
  getState(): { state: CircuitState; failures: number } {
    return { state: this.state, failures: this.failureCount }
  }

  /** Execute a function through the circuit breaker */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If OPEN, check if cooldown has elapsed → move to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN'
        console.log(`[CircuitBreaker] ${this.name}: OPEN -> HALF_OPEN (probing)`)
      } else {
        throw new CircuitOpenError(
          `[CircuitBreaker] ${this.name} is OPEN — failing fast (${this.failureCount} consecutive failures, cooldown ${Math.round((this.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000)}s remaining)`
        )
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker] ${this.name}: HALF_OPEN -> CLOSED (recovered)`)
    }
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN'
      console.error(
        `[CircuitBreaker] ${this.name}: -> OPEN after ${this.failureCount} failures (cooldown: ${this.cooldownMs / 1000}s)`
      )
    }
  }

  /** Force reset (e.g., on admin action or health recovery) */
  reset(): void {
    this.failureCount = 0
    this.state = 'CLOSED'
    console.log(`[CircuitBreaker] ${this.name}: manually reset to CLOSED`)
  }
}

/** Typed error so callers can distinguish circuit-open from real failures */
export class CircuitOpenError extends Error {
  readonly isCircuitOpen = true
  constructor(message: string) {
    super(message)
    this.name = 'CircuitOpenError'
  }
}
