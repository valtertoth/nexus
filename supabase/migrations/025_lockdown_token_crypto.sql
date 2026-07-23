-- 025 · Lockdown das funções de cripto de token + security_invoker nas views (P0 segurança)
-- Auditoria 23-07: decrypt_wa_token (e variantes) executáveis por authenticated/anon →
--   qualquer usuário logado descriptografava o token da Meta/Shopify. E 4 views SECURITY
--   DEFINER (padrão) burlavam RLS → vazamento cross-org. O server usa service_role, então
--   revogar de authenticated/anon NÃO o afeta.

-- 1) Segredos: só service_role executa cripto/decripto de token (lida overloads via regprocedure)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'decrypt_wa_token','decrypt_wa_token_with_key','decrypt_shopify_token',
        'encrypt_wa_token','encrypt_wa_token_with_key','encrypt_shopify_token'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Views passam a respeitar a RLS de quem consulta (não mais o dono/definer)
ALTER VIEW public.v_accountability_summary SET (security_invoker = true);
ALTER VIEW public.v_conversion_attribution SET (security_invoker = true);
ALTER VIEW public.v_funnel_attribution   SET (security_invoker = true);
ALTER VIEW public.v_top_winning_patterns SET (security_invoker = true);
