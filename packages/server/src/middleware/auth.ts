import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl) console.error('[Auth] VITE_SUPABASE_URL is not set!')
if (!supabaseServiceKey) console.error('[Auth] SUPABASE_SERVICE_ROLE_KEY is not set!')

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

type AuthVariables = {
  userId: string
  orgId: string
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Token não fornecido' }, 401)
    }

    const token = authHeader.slice(7)

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      console.error('[Auth] Token validation failed:', {
        error: error?.message,
        errorStatus: error?.status,
        supabaseUrl: supabaseUrl?.substring(0, 30) + '...',
        tokenPreview: token.substring(0, 20) + '...',
      })
      return c.json({ error: 'Token inválido ou expirado' }, 401)
    }

    // Fetch org_id from users table
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return c.json({ error: 'Perfil não encontrado' }, 401)
    }

    c.set('userId', user.id)
    c.set('orgId', profile.org_id)

    await next()
  }
)
