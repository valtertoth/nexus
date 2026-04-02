/**
 * Retry wrapper for async operations with linear backoff.
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
      console.warn(`[Retry] ${label} attempt ${attempt} failed, retrying in ${delayMs * attempt}ms...`)
      await new Promise(r => setTimeout(r, delayMs * attempt))
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
