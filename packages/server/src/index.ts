import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import 'dotenv/config'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Routes will be added in subsequent prompts:
// app.route('/webhook', webhookRoutes)
// app.route('/api/messages', messageRoutes)
// app.route('/api/ai', aiRoutes)
// app.route('/api/knowledge', knowledgeRoutes)

const port = parseInt(process.env.PORT || '3001', 10)

console.log(`🚀 Nexus Server running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})

export default app
