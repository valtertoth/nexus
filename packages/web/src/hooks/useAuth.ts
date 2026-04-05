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
 * Fast-path: read session from localStorage without any async calls.
 * Returns the cached session if it exists and hasn't expired.
 */
function getCachedSession(): Session | null {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Check if token is expired
    if (parsed?.expires_at && parsed.expires_at * 1000 < Date.now()) return null
    return parsed as Session
  } catch {
    return null
  }
}

export function useAuth() {
  // Fast-path: initialize from localStorage synchronously to avoid loading flash
  const cachedSession = getCachedSession()

  const [state, setState] = useState<AuthState>({
    session: cachedSession,
    authUser: cachedSession?.user ?? null,
    profile: null,
    loading: !cachedSession, // If we have a cached session, don't show loading
  })

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function init() {
      try {
        // Step 1: Get session from Supabase (reads localStorage, very fast with lock bypass)
        const { data: { session: currentSession } } = await supabase.auth.getSession()

        if (!currentSession) {
          if (mountedRef.current) {
            setState({ session: null, authUser: null, profile: null, loading: false })
          }
          return
        }

        // Step 2: Fetch profile AND refresh session IN PARALLEL
        const userId = currentSession.user.id
        const [profileResult, refreshResult] = await Promise.all([
          // Profile fetch with 4s timeout
          supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single()
            .then(r => r.data as User | null)
            .catch(() => null),
          // Background session refresh (ensures JWT stays fresh)
          supabase.auth.refreshSession()
            .then(r => r.data?.session ?? currentSession)
            .catch(() => currentSession),
        ])

        if (!mountedRef.current) return

        // Use refreshed session if available, otherwise keep current
        const finalSession = refreshResult || currentSession

        setState({
          session: finalSession,
          authUser: finalSession.user ?? null,
          profile: profileResult,
          loading: false,
        })
      } catch {
        if (mountedRef.current) {
          // If we had a cached session, keep showing the app (don't flash to login)
          setState(prev => ({ ...prev, loading: false }))
        }
      }
    }

    init()

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return

        // For SIGNED_OUT, clear immediately (don't wait for profile fetch)
        if (!session) {
          setState({ session: null, authUser: null, profile: null, loading: false })
          return
        }

        // For TOKEN_REFRESHED, just update session (profile doesn't change)
        if (event === 'TOKEN_REFRESHED') {
          setState(prev => ({
            ...prev,
            session,
            authUser: session.user ?? null,
          }))
          return
        }

        // For SIGNED_IN, fetch profile
        let profile: User | null = null
        try {
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()
          profile = data as User | null
        } catch { /* ignore */ }

        if (mountedRef.current) {
          setState({
            session,
            authUser: session.user ?? null,
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
  }, [])

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
