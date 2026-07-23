import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { getSupervisorOverview } from '../services/supervisor.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const supervisor = new Hono<AuthVars>()

supervisor.use('*', authMiddleware)
supervisor.use('*', apiRateLimit)
// Painel do dono: exige gestão (admin herda para owner via hierarquia).
supervisor.use('*', requireRole('admin'))

// GET /api/supervisor/overview — estado VIVO do atendimento da org (somente leitura)
supervisor.get('/overview', async (c) => {
  const orgId = c.get('orgId')
  try {
    const overview = await getSupervisorOverview(orgId)
    return c.json(overview)
  } catch (err) {
    console.error('[Supervisor] overview failed:', err)
    return c.json({ error: 'Erro ao carregar o painel de supervisão' }, 500)
  }
})

export default supervisor
