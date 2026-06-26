import { createClient } from '@supabase/supabase-js'

const FRETE_URL = import.meta.env.VITE_FRETE_SUPABASE_URL
const FRETE_KEY = import.meta.env.VITE_FRETE_SUPABASE_KEY

/**
 * Supabase client for the Frete database (separate project).
 * Read-only access to transportadoras, tabela_frete, cidade_praca tables.
 * Returns null when env vars are not configured (non-fatal).
 */
export const supabaseFrete = FRETE_URL && FRETE_KEY
  ? createClient(FRETE_URL, FRETE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null
