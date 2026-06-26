# NEXUS — Plataforma de Atendimento WhatsApp com IA

> 🟢 **LEIA PRIMEIRO:** `../NEXUS_PRODUCTION_HANDOFF.md` — ponte com o ecossistema Toth (Shopify/Meta/Google), estado atual VERIFICADO, plano de produção em ondas, travas estratégicas (NÃO migrar o número vivo 18) e a memória compartilhada (`C:/Projetos/.claude/memory/`). Sem isso você não tem o contexto cross-project. O build plan está em `../NEXUS_MASTER_EXECUTION_v2.md`.

## Sobre
Nexus é um SaaS de atendimento multi-agente via WhatsApp com IA copiloto.
Monorepo com npm workspaces: packages/web (React), packages/server (Node), packages/shared (tipos).

## Regras Absolutas
1. NUNCA recrie arquivos que já existem. Verifique antes com ls ou find.
2. Use APENAS shadcn/ui para componentes UI base.
3. Supabase client: packages/web/src/lib/supabase.ts (anon key, frontend)
   Supabase admin: packages/server usa SUPABASE_SERVICE_ROLE_KEY
4. TypeScript strict. Todas props tipadas. Sem 'any'.
5. Tailwind para CSS. Zero CSS customizado.
6. Tipos compartilhados ficam em packages/shared/src/types/
7. Nomes de arquivo em inglês, UI em português brasileiro.
8. Estética premium. Sem gradientes roxos genéricos. Inspire-se em Linear.app.
9. Autenticação via Supabase Auth (email/senha). auth.uid() em todas queries.
10. RLS ativo em todas tabelas. Nunca desabilite para "facilitar".

## Patterns
- Hooks: packages/web/src/hooks/
- Stores (Zustand): packages/web/src/stores/
- Server routes: packages/server/src/routes/
- Services: packages/server/src/services/
- Testes: packages/server/src/__tests__/

## Env vars
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
WA_PHONE_NUMBER_ID, WA_BUSINESS_ACCOUNT_ID, WA_ACCESS_TOKEN,
WA_WEBHOOK_VERIFY_TOKEN, ENCRYPTION_SECRET
(GROQ_API_KEY opcional — ativa transcricao de audio via Whisper)
