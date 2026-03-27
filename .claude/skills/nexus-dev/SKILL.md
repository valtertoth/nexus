---
name: nexus-dev
description: Skill de desenvolvimento do projeto Nexus — plataforma SaaS de atendimento WhatsApp com IA copiloto. Use SEMPRE que estiver trabalhando em qualquer arquivo dentro do monorepo Nexus, incluindo componentes React, rotas do servidor Hono, serviços de IA/RAG, hooks, stores Zustand, migrações SQL, ou configurações. Ative também quando o usuário mencionar WhatsApp, atendimento, inbox, chat, IA copiloto, RAG, base de conhecimento, setores, ou qualquer funcionalidade da plataforma.
---

# Nexus Development Skill

## O que é o Nexus
Plataforma SaaS de atendimento multi-agente via WhatsApp com IA copiloto.
Múltiplos atendentes operam 1 número de WhatsApp pelo navegador.
IA sugere respostas (modo ditado), responde automaticamente (modo auto), ou fica desligada.
Cada setor (vendas, financeiro) tem sua base de conhecimento vetorial (RAG).

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js 20 + Hono + Supabase Admin Client
- **IA**: Anthropic Claude API (via Vercel AI SDK) + OpenAI Embeddings
- **DB**: Supabase PostgreSQL + pgvector (HNSW index)
- **Auth**: Supabase Auth (email/senha)
- **Realtime**: Supabase Realtime (postgres_changes)
- **Monorepo**: npm workspaces (packages/web, packages/server, packages/shared)

## Regras absolutas

1. **NUNCA recrie arquivos existentes.** Antes de criar qualquer arquivo, rode `find` ou `ls` para verificar se já existe. Se existir, EDITE — não substitua.

2. **Tipos compartilhados ficam em packages/shared/src/types/.** Nunca duplique tipos entre web e server. Importe de @nexus/shared.

3. **Use APENAS shadcn/ui para componentes de UI base.** Se precisar de um componente que não existe (ex: color-picker), instale via `npx shadcn@latest add` antes de criar algo manual.

4. **TypeScript strict.** Todas as props tipadas. Sem `any`. Sem `@ts-ignore`. Sem `as unknown as X`.

5. **Tailwind para todo CSS.** Zero CSS customizado, zero arquivos .css, zero styled-components. Única exceção: variáveis CSS do shadcn em globals.css.

6. **Supabase clients:**
   - Frontend (anon key): `packages/web/src/lib/supabase.ts`
   - Backend (service_role): criado em cada service com `SUPABASE_SERVICE_ROLE_KEY`
   - NUNCA use service_role no frontend.

7. **RLS sempre ativo.** Nunca desabilite para "facilitar" ou "testar". Se uma query não funciona com RLS, o problema é a policy — conserte a policy.

8. **Nomes de arquivo em inglês, UI em português brasileiro.**

9. **Estética premium.** Sem gradientes roxos genéricos. Sem Inter como fonte UI. Sem cards com sombras exageradas. Inspiração: Linear.app, Vercel Dashboard, Raycast.

10. **Sem console.log em produção.** Use apenas para debug temporário e remova antes de commitar.

## Estrutura de pastas

```
nexus/
├── packages/
│   ├── shared/src/types/     ← Tipos compartilhados (database.ts, whatsapp.ts, ai.ts)
│   ├── web/src/
│   │   ├── lib/              ← supabase.ts, utils.ts
│   │   ├── hooks/            ← useAuth, useConversations, useMessages, useRealtimeMessages
│   │   ├── stores/           ← Zustand: conversationStore, messageStore, uiStore
│   │   ├── components/
│   │   │   ├── layout/       ← MainLayout, Sidebar, Header
│   │   │   ├── inbox/        ← ConversationList, ConversationItem, ConversationFilters
│   │   │   ├── chat/         ← ChatPanel, MessageBubble, MessageComposer, AISuggestionBar
│   │   │   ├── ai/           ← AIModeToggle, AIResponsePreview, AIMetrics
│   │   │   ├── knowledge/    ← KnowledgeManager, DocumentUploader, DocumentList
│   │   │   ├── contacts/     ← ContactPanel, ContactDetails
│   │   │   ├── auth/         ← ProtectedRoute
│   │   │   └── settings/     ← OrganizationSettings, SectorManager, TeamManager
│   │   └── pages/            ← Login, Dashboard, Inbox, Knowledge, Analytics, Settings
│   └── server/src/
│       ├── routes/            ← webhook.ts, messages.ts, ai.ts, knowledge.ts
│       ├── services/          ← whatsapp, ai, rag, embedding, media, conversation
│       ├── middleware/        ← auth.ts, rateLimit.ts
│       └── __tests__/
└── supabase/migrations/
```

## Tabelas principais do banco

- **organizations** — multi-tenant, planos, credenciais WA (encriptadas)
- **users** — vinculados a auth.users, com role/sector/ai_mode
- **sectors** — setores com system_prompt customizado para IA
- **contacts** — contatos de WhatsApp
- **conversations** — conversas com status/prioridade/atribuição
- **messages** — mensagens com campos de IA (ai_suggested_response, ai_approved, ai_edited, ai_suggestion_sources)
- **knowledge_documents** — documentos da base de conhecimento
- **knowledge_chunks** — chunks com embedding VECTOR(1536) e índice HNSW
- **ai_usage_logs** — métricas de uso de IA

## Patterns de código

### Hook com Supabase Realtime
```typescript
useEffect(() => {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      addMessage(payload.new as Message)
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [conversationId])
```

### Store Zustand
```typescript
import { create } from 'zustand'
import type { Conversation } from '@nexus/shared'

interface ConversationStore {
  conversations: Conversation[]
  selectedId: string | null
  select: (id: string) => void
  add: (conv: Conversation) => void
  update: (id: string, data: Partial<Conversation>) => void
}

export const useConversationStore = create<ConversationStore>((set) => ({
  conversations: [],
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  add: (conv) => set((s) => ({ conversations: [conv, ...s.conversations] })),
  update: (id, data) => set((s) => ({
    conversations: s.conversations.map(c => c.id === id ? { ...c, ...data } : c)
  })),
}))
```

### Rota Hono com auth
```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

const app = new Hono()
app.use('/*', authMiddleware)

app.get('/conversations', async (c) => {
  const orgId = c.get('orgId')
  // query com RLS automático via org_id
})
```

### Busca RAG
```typescript
const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
  query_embedding: embedding,
  p_sector_id: sectorId,
  p_org_id: orgId,
  match_threshold: 0.7,
  match_count: 5
})
```

## Referências detalhadas
Para detalhes completos do schema SQL, consulte: `references/schema.md`
Para o fluxo completo de dados, consulte: `references/dataflow.md`
