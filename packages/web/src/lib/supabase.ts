import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    // Bypass navigator lock to avoid cross-tab lock contention in dev
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<void>) => fn(),
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
    token = raw ? JSON.parse(raw)?.access_token : null
  } catch {
    token = null
  }
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  }
}
