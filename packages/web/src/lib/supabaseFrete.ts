import { createClient } from '@supabase/supabase-js'

const FRETE_URL = import.meta.env.VITE_FRETE_SUPABASE_URL || 'https://pucrgwvcgagbapzvphao.supabase.co'
const FRETE_KEY = import.meta.env.VITE_FRETE_SUPABASE_KEY || 'sb_publishable_ecC9ebJ3xNM3TUL-JbAbSg_CqN089nT'

/**
 * Supabase client for the Frete database (separate project).
 * Read-only access to transportadoras, tabela_frete, cidade_praca tables.
 */
export const supabaseFrete = createClient(FRETE_URL, FRETE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
