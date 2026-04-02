import { createMiddleware } from 'hono/factory'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()
let storeCounter = 0

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }
}, 5 * 60 * 1000)

interface RateLimitOptions {
  /** Max requests in the window */
  max: number
  /** Window size in seconds */
  windowSeconds: number
  /** Custom key extractor — defaults to IP address via x-forwarded-for */
  keyFn?: (c: { req: { header: (name: string) => string | undefined }; get: (key: string) => unknown }) => string
}

/** Extract client IP from standard headers */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown'
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowSeconds, keyFn } = options
  const storeKey = `${max}:${windowSeconds}:${++storeCounter}`

  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map())
  }

  return createMiddleware(async (c, next) => {
    const store = stores.get(storeKey)!
    const key = keyFn ? keyFn(c) : getClientIp(c)

    const now = Date.now()
    const entry = store.get(key)

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
      await next()
      return
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      c.header('X-RateLimit-Limit', String(max))
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
      return c.json(
        { error: 'Muitas requisições. Tente novamente em alguns segundos.' },
        429
      )
    }

    entry.count++
    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(max - entry.count))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    await next()
  })
}

// ── Key extractors ─────────────────────────────────────────────────────────

/** Use authenticated userId when available, fall back to IP */
const userOrIpKey = (c: { req: { header: (name: string) => string | undefined }; get: (key: string) => unknown }): string =>
  (c.get('userId') as string | undefined) || getClientIp(c)

// ── Pre-configured limiters (IP-based) ─────────────────────────────────────

export const apiRateLimit = rateLimit({ max: 30, windowSeconds: 60 })
export const aiRateLimit = rateLimit({ max: 20, windowSeconds: 60 })
export const webhookRateLimit = rateLimit({ max: 1000, windowSeconds: 60 })

// ── Pre-configured limiters (per-user, for authenticated routes) ───────────

/** 60 req/min per user — use on message-send and similar high-value routes */
export const userApiRateLimit = rateLimit({
  max: 60,
  windowSeconds: 60,
  keyFn: userOrIpKey,
})

/** 30 req/min per user — use on AI routes */
export const userAiRateLimit = rateLimit({
  max: 30,
  windowSeconds: 60,
  keyFn: userOrIpKey,
})
