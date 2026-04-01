import './env.js'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'

import webhookRoutes from './routes/webhook.js'
import messageRoutes from './routes/messages.js'
import aiRoutes from './routes/ai.js'
import knowledgeRoutes from './routes/knowledge.js'
import intelligenceRoutes from './routes/intelligence.js'
import tagRoutes from './routes/tags.js'
import whatsappConnectionRoutes from './routes/whatsapp-connection.js'
import brainRoutes from './routes/brain.js'
import ecosystemRoutes from './routes/ecosystem.js'
import quoteRoutes from './routes/quotes.js'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })) // 50MB request body limit
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

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

const port = parseInt(process.env.PORT || '3001', 10)

console.log(`[Nexus] Server running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})

export default app
