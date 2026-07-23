import { createMiddleware } from 'hono/factory'
import { supabaseAdmin } from '../lib/supabase.js'

// ── Types ──────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'agent'

// Hierarquia de papéis: owner > admin(gerente) > agent
const ROLE_RANK: Record<UserRole, number> = {
  agent: 0,
  admin: 1,
  owner: 2,
}

type AuthVariables = {
  userId: string
  orgId: string
  userRole: UserRole
}

// ── In-memory profile cache (avoids repeated DB lookups within short window) ──

interface CachedProfile {
  orgId: string
  role: UserRole
  expiresAt: number
}

const profileCache = new Map<string, CachedProfile>()
const CACHE_TTL_MS = 60_000 // 1 minute

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of profileCache) {
    if (entry.expiresAt <= now) profileCache.delete(key)
  }
}, 5 * 60 * 1000)

// ── Error response helper ──────────────────────────────────────────────────

function authError(status: 401 | 403, code: string, message: string) {
  return { error: { code, message }, status }
}

// ── Role gate ─────────────────────────────────────────────────────────────

export function requireRole(...allowed: UserRole[]) {
  // Gate hierárquico: exige rank >= ao menor rank permitido.
  // requireRole('admin') libera admin E owner (owner herda poderes de admin).
  const minRank = Math.min(...allowed.map((r) => ROLE_RANK[r]))
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const role = c.get('userRole') as UserRole
    if (ROLE_RANK[role] === undefined || ROLE_RANK[role] < minRank) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Permissão insuficiente' } }, 403)
    }
    await next()
  })
}

// ── Middleware ──────────────────────────────────────────────────────────────

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      const { error, status } = authError(401, 'MISSING_TOKEN', 'Token não fornecido')
      return c.json(error, status)
    }

    const token = authHeader.slice(7)

    // Validate token and get user from Supabase Auth
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)

    if (authErr || !user) {
      // Distinguish between expired and invalid tokens
      const isExpired = authErr?.message?.toLowerCase().includes('expired')
      const code = isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      const message = isExpired ? 'Token expirado' : 'Token inválido ou expirado'
      const { error, status } = authError(401, code, message)
      return c.json(error, status)
    }

    // Check if the user's email is confirmed (basic session revocation guard)
    if (user.aud !== 'authenticated') {
      const { error, status } = authError(401, 'SESSION_REVOKED', 'Sessão revogada')
      return c.json(error, status)
    }

    // Fetch profile (org_id + role), using cache when available
    const cached = profileCache.get(user.id)
    let orgId: string
    let userRole: UserRole

    if (cached && cached.expiresAt > Date.now()) {
      orgId = cached.orgId
      userRole = cached.role
    } else {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('org_id, role')
        .eq('id', user.id)
        .single()

      if (!profile) {
        const { error, status } = authError(401, 'PROFILE_NOT_FOUND', 'Perfil não encontrado')
        return c.json(error, status)
      }

      orgId = profile.org_id
      userRole = (profile.role as UserRole) || 'agent'

      // Cache the result
      profileCache.set(user.id, {
        orgId,
        role: userRole,
        expiresAt: Date.now() + CACHE_TTL_MS,
      })
    }

    c.set('userId', user.id)
    c.set('orgId', orgId)
    c.set('userRole', userRole)

    await next()
  }
)
