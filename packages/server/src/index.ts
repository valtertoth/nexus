import './env.js'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { supabaseAdmin } from './lib/supabase.js'
import { metrics } from './lib/metrics.js'

import webhookRoutes, { processWebhook, clearAiDebounceTimers, getWebhookQueueStats } from './routes/webhook.js'
import { recoverPendingWebhooks, cleanupWebhookQueue } from './services/webhook-recovery.service.js'
import messageRoutes from './routes/messages.js'
import aiRoutes from './routes/ai.js'
import knowledgeRoutes from './routes/knowledge.js'
import intelligenceRoutes from './routes/intelligence.js'
import tagRoutes from './routes/tags.js'
import whatsappConnectionRoutes from './routes/whatsapp-connection.js'
import brainRoutes from './routes/brain.js'
import ecosystemRoutes from './routes/ecosystem.js'
import quoteRoutes from './routes/quotes.js'
// baileysService no longer used for health checks (Cloud API only)
// import { baileysService } from './services/baileys.service.js'

// --- Crash Protection ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason)
  // Keep the server running — do NOT process.exit
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err)
  // Attempt graceful shutdown
  setTimeout(() => process.exit(1), 5000)
})

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5173', 'http://localhost:4173']
    : []),
].filter(Boolean) as string[]

const app = new Hono()
const startTime = Date.now()
let serverVersion = '1.0.0'

// Try to read version from package.json
try {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const pkg = require('../package.json')
  serverVersion = pkg.version || serverVersion
} catch {
  // Non-critical — use default version
}

// --- Security Headers Middleware ---
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('X-XSS-Protection', '1; mode=block')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.delete('X-Powered-By')
  if (process.env.NODE_ENV === 'production') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

// Middleware
app.use('*', logger())
// Differentiated body limits: small default, large only for media upload
app.use('/webhook/*', bodyLimit({ maxSize: 1 * 1024 * 1024 })) // 1MB for Meta webhooks
app.use('/api/messages/send-media', bodyLimit({ maxSize: 50 * 1024 * 1024 })) // 50MB for media
app.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024 })) // 2MB default
app.use('*', cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  maxAge: 86400,
}))

// Ensure UTF-8 charset on all JSON/text responses
app.use('*', async (c, next) => {
  await next()
  const ct = c.res.headers.get('Content-Type')
  if (ct && !ct.includes('charset')) {
    if (ct.includes('application/json')) {
      c.res.headers.set('Content-Type', 'application/json; charset=utf-8')
    } else if (ct.includes('text/plain')) {
      c.res.headers.set('Content-Type', 'text/plain; charset=utf-8')
    } else if (ct.includes('text/event-stream')) {
      c.res.headers.set('Content-Type', 'text/event-stream; charset=utf-8')
    }
  }
})

// Health check with Supabase connectivity test
app.get('/health', async (c) => {
  const uptimeMs = Date.now() - startTime
  const timestamp = new Date().toISOString()

  try {
    const { error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .limit(1)

    if (error) {
      return c.json({
        status: 'degraded',
        timestamp,
        uptime: uptimeMs,
        version: serverVersion,
        db: { status: 'error', message: error.message },
      }, 200)
    }

    // Cloud API status: check if credentials are available
    const waPhoneId = process.env.WA_PHONE_NUMBER_ID
    const waToken = process.env.WA_ACCESS_TOKEN
    const waStatus = {
      status: waPhoneId && waToken ? 'configured' : 'not_configured',
      phoneNumberId: waPhoneId || null,
      hasToken: !!waToken,
    }

    return c.json({
      status: 'ok',
      timestamp,
      uptime: uptimeMs,
      version: serverVersion,
      db: { status: 'connected' },
      whatsapp: waStatus,
      metrics: metrics.getSnapshot(),
      webhookQueue: getWebhookQueueStats(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({
      status: 'unhealthy',
      timestamp,
      uptime: uptimeMs,
      version: serverVersion,
      db: { status: 'unreachable', message },
    }, 503)
  }
})

// Routes
app.route('/webhook', webhookRoutes)
app.route('/api/messages', messageRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/knowledge', knowledgeRoutes)
app.route('/api/intelligence', intelligenceRoutes)
app.route('/api/tags', tagRoutes)
app.route('/api/whatsapp', whatsappConnectionRoutes)
app.route('/api/brain', brainRoutes)
app.route('/api/ecosystem', ecosystemRoutes)
app.route('/api/quotes', quoteRoutes)

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  console.error('[Server] Unhandled error:', err)

  return c.json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
  }, 500)
})

const port = parseInt(process.env.PORT || '3001', 10)

console.log(`[Nexus] Server running on port ${port}`)

const server: ServerType = serve({
  fetch: app.fetch,
  port,
})

// --- Webhook Recovery (crash safety net) ---
// On startup, recover any pending/failed webhooks from previous crashes
setTimeout(async () => {
  try {
    await recoverPendingWebhooks(processWebhook as (payload: unknown) => Promise<void>)
    await cleanupWebhookQueue()
  } catch (err) {
    console.error('[Recovery] Startup recovery failed:', err)
  }
}, 5_000) // Wait 5s for server to fully initialize

// Periodic recovery + cleanup (every 2 minutes)
const recoveryInterval = setInterval(async () => {
  try {
    await recoverPendingWebhooks(processWebhook as (payload: unknown) => Promise<void>)
    await cleanupWebhookQueue()
  } catch (err) {
    console.error('[Recovery] Periodic recovery failed:', err)
  }
}, 120_000)

// Prevent the interval from keeping the process alive during shutdown
recoveryInterval.unref()

// --- Graceful Shutdown ---
let isShuttingDown = false
let activeRequests = 0

// Track active requests via Node's connection events
server.on('request', (_req, res) => {
  if (isShuttingDown) {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Server is shutting down')
    return
  }
  activeRequests++
  res.on('close', () => {
    activeRequests--
  })
})

function gracefulShutdown(signal: string): void {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`[Nexus] ${signal} received — starting graceful shutdown...`)
  clearAiDebounceTimers()
  console.log(`[Nexus] Active requests: ${activeRequests}`)

  // Stop accepting new connections
  server.close(() => {
    console.log('[Nexus] Server closed — no more incoming connections')
  })

  // Wait for in-flight requests (up to 30s — enough for pending AI/media operations)
  const shutdownDeadline = Date.now() + 30_000
  const interval = setInterval(() => {
    if (activeRequests <= 0 || Date.now() >= shutdownDeadline) {
      clearInterval(interval)
      if (activeRequests > 0) {
        console.warn(`[Nexus] Forcing shutdown with ${activeRequests} active request(s)`)
      } else {
        console.log('[Nexus] All requests completed — exiting cleanly')
      }
      process.exit(0)
    }
    console.log(`[Nexus] Waiting for ${activeRequests} active request(s) to complete...`)
  }, 500)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export default app
