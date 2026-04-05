import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@nexus/shared'

interface AuthState {
  session: Session | null
  authUser: SupabaseUser | null
  profile: User | null
  loading: boolean
}

/**
 * Fetch profile with a timeout to prevent hanging.
 */
async function fetchProfileWithTimeout(userId: string, timeoutMs = 8000): Promise<User | null> {
  try {
    const result = await Promise.race([
      supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), timeoutMs)
      ),
    ])

    return (result.data as User | null) ?? null
  } catch (err) {
    console.warn('[Auth] Profile fetch timed out or failed:', err)
    return null
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    authUser: null,
    profile: null,
    loading: true,
  })

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Get initial session — always validate + refresh to prevent stale JWT
    async function init() {
      try {
        const { data: { session: cachedSession } } = await supabase.auth.getSession()

        if (!cachedSession) {
          // No session at all — not authenticated
          if (mountedRef.current) {
            setState({ session: null, authUser: null, profile: null, loading: false })
          }
          return
        }

        // Always try to refresh the session to ensure the JWT is valid.
        // getSession() only reads localStorage — it does NOT validate the token.
        // If the refresh token is also expired, this will fail and we redirect to login.
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

        if (refreshError || !refreshData.session) {
          console.warn('[Auth] Session refresh failed — forcing re-login:', refreshError?.message)
          // Clear all stored auth data
          try { await supabase.auth.signOut() } catch { /* ignore */ }
          Object.keys(localStorage).filter(k =>
            k.includes('supabase') || k.includes('sb-')
          ).forEach(k => localStorage.removeItem(k))

          if (mountedRef.current) {
            setState({ session: null, authUser: null, profile: null, loading: false })
          }
          return
        }

        // Session is now fresh — fetch profile
        const session = refreshData.session
        let profile: User | null = null
        if (session.user) {
          profile = await fetchProfileWithTimeout(session.user.id)
        }

        if (mountedRef.current) {
          setState({
            session,
            authUser: session.user ?? null,
            profile,
            loading: false,
          })
        }
      } catch {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false }))
        }
      }
    }

    init()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        let profile: User | null = null
        if (session?.user) {
          profile = await fetchProfileWithTimeout(session.user.id)
        }

        if (mountedRef.current) {
          setState({
            session,
            authUser: session?.user ?? null,
            profile,
            loading: false,
          })
        }
      }
    )

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, []) // No dependencies — runs once

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (
    email: string,
    password: string,
    name: string,
    orgName: string,
    orgSlug: string,
  ) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })
    if (authError) throw authError
    if (!authData.user) throw new Error('Falha ao criar usuário')

    const { error: rpcError } = await supabase.rpc('signup_organization', {
      p_user_id: authData.user.id,
      p_user_email: email,
      p_user_name: name,
      p_org_name: orgName,
      p_org_slug: orgSlug,
    })
    if (rpcError) throw rpcError
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  return {
    session: state.session,
    user: state.authUser,
    profile: state.profile,
    loading: state.loading,
    isAuthenticated: !!state.session,
    signIn,
    signUp,
    signOut,
  }
}
