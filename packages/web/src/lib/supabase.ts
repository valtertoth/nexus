import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    // Bypass navigator lock to avoid cross-tab lock contention in dev
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
  },
})

/**
 * Get auth headers for API calls without blocking.
 * supabase.auth.getSession() can hang in v2.100+ when realtime has issues.
 * This reads the token directly from localStorage as a fast, non-blocking path.
 */
export function getAuthHeaders(): Record<string, string> {
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  const raw = localStorage.getItem(storageKey)
  let token: string | null = null

  try {
    if (raw) {
      const parsed = JSON.parse(raw)
      token = parsed?.access_token ?? null

      // Check if token is expired or expiring within 60 seconds
      const expiresAt = parsed?.expires_at
      if (expiresAt && expiresAt * 1000 < Date.now() + 60_000) {
        token = null
        supabase.auth.refreshSession().then(({ data }) => {
          if (data?.session) {
            console.log('[Auth] Token refreshed successfully')
          }
        }).catch(() => {
          console.warn('[Auth] Token refresh failed')
        })
      }
    }
  } catch {
    token = null
  }

  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  }
}
