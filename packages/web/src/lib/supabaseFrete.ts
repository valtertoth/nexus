import { createClient } from '@supabase/supabase-js'

const FRETE_URL = import.meta.env.VITE_FRETE_SUPABASE_URL || 'https://pucrgwvcgagbapzvphao.supabase.co'
const FRETE_KEY = import.meta.env.VITE_FRETE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1Y3Jnd3ZjZ2FnYmFwenZwaGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTU0NDEsImV4cCI6MjA4Nzk5MTQ0MX0.CS5_pEJK6NrQgtlXTdTEkMmetNrZZzyuQ_fKVINKtic'

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
