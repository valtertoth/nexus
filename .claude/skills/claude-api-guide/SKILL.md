---
name: claude-api-guide
description: Referência para uso correto da API Anthropic Claude no projeto Nexus. Use quando implementar integração com Claude API, serviços de IA, RAG pipeline, streaming de respostas, ou qualquer código que chame modelos da Anthropic. Ative ao mencionar Claude, Anthropic, AI SDK, generateText, streamText, ou modelos como Sonnet/Haiku.
---

# Claude API Reference para Nexus

## Modelos disponíveis (março 2026)
- **claude-sonnet-4-20250514** — principal, melhor custo-benefício para respostas de atendimento
- **claude-haiku-4-5-20251001** — rápido e barato, usar para triagem e respostas simples
- **claude-opus-4-6** — mais capaz, usar apenas se necessário (caro)

## Via Vercel AI SDK (recomendado)

```typescript
import { generateText, streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// Texto completo (para salvar sugestão)
const { text, usage } = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'Você é assistente de atendimento...',
  messages: conversationHistory,
  maxTokens: 1024,
  temperature: 0.3,
})

// Streaming (para resposta em tempo real)
const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages: history,
})

// No frontend com useChat:
import { useChat } from 'ai/react'
const { messages, input, handleSubmit } = useChat({
  api: '/api/ai/stream',
})
```

## Limites e custos (estimativa)
- Sonnet: ~$3/M input tokens, ~$15/M output tokens
- Haiku: ~$0.25/M input, ~$1.25/M output
- Rate limit: 4000 req/min (tier 1)
- Context window: 200K tokens

## Boas práticas no Nexus
1. Sempre definir maxTokens para controlar custos
2. Usar temperature 0.3 para atendimento (determinístico)
3. System prompt do setor + contexto RAG + histórico = prompt completo
4. Registrar usage em ai_usage_logs para controle de gastos
5. Verificar ai_monthly_token_limit antes de gerar
6. Haiku para triagem (classificar setor), Sonnet para resposta final
