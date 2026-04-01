import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@nexus/shared'

interface AuthState {
  session: Session | null
  authUser: SupabaseUser | null
  profile: User | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    authUser: null,
    profile: null,
    loading: true,
  })

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    return data as User | null
  }, [])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let profile: User | null = null
      if (session?.user) {
        profile = await fetchProfile(session.user.id)
      }
      setState({
        session,
        authUser: session?.user ?? null,
        profile,
        loading: false,
      })
    }).catch(() => {
      setState(prev => ({ ...prev, loading: false }))
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        let profile: User | null = null
        if (session?.user) {
          profile = await fetchProfile(session.user.id)
        }
        setState({
          session,
          authUser: session?.user ?? null,
          profile,
          loading: false,
        })
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

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
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })
    if (authError) throw authError
    if (!authData.user) throw new Error('Falha ao criar usuário')

    // 2. Call RPC to create org + profile (bypasses RLS)
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
