import { streamText, generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { withTimeout, CircuitBreaker } from '../lib/resilience.js'

/** Race a promise/thenable against a timeout, returning the fallback value on timeout instead of throwing. */
function withTimeoutFallback<T>(promiseOrThenable: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseOrThenable),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// Circuit breaker: if Claude fails 5 times in a row, stop calling for 60s
export const claudeCircuitBreaker = new CircuitBreaker('Claude AI', {
  threshold: 5,
  cooldownMs: 60_000,
})

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

console.log('[AI] Anthropic SDK initialized, key present:', !!process.env.ANTHROPIC_API_KEY)
import { supabaseAdmin } from '../lib/supabase.js'
import { searchRelevantChunks } from './rag.service.js'
import type { AiRagSource } from '@nexus/shared'

interface AiSuggestionResult {
  suggestion: string
  sources: AiRagSource[]
  model: string
  tokens: { prompt: number; completion: number; total: number }
  latencyMs: number
}

/**
 * Generate an AI suggestion for a conversation.
 *
 * Flow:
 * 1. Fetch last 10 messages (context)
 * 2. Fetch sector system prompt
 * 3. Search relevant knowledge chunks (RAG)
 * 4. Build prompt and call Claude
 * 5. Save suggestion to message + log usage
 */
export async function generateSuggestion(
  conversationId: string,
  latestMessage: string,
  sectorId: string | null,
  orgId: string
): Promise<AiSuggestionResult> {
  const startTime = Date.now()

  // 1. Check org token limit
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('ai_monthly_token_limit, ai_tokens_used_this_month')
    .eq('id', orgId)
    .single()

  if (org && org.ai_monthly_token_limit != null && org.ai_tokens_used_this_month >= org.ai_monthly_token_limit) {
    throw new Error('Limite mensal de tokens IA atingido para esta organização.')
  }

  // 2. Fetch last 10 messages for context
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  const conversationHistory = (messages || [])
    .reverse()
    .map((m) => {
      const role = m.sender_type === 'contact' ? 'Cliente' : 'Atendente'
      return `${role}: ${m.content || '[mídia]'}`
    })
    .join('\n')

  // 3. Fetch sector config
  let systemPrompt = 'Você é um assistente de atendimento ao cliente.'
  let model = 'claude-sonnet-4-20250514'
  let temperature = 0.3
  let maxTokens = 1024

  if (sectorId) {
    const { data: sector } = await supabaseAdmin
      .from('sectors')
      .select('system_prompt, ai_model, ai_temperature, ai_max_tokens')
      .eq('id', sectorId)
      .single()

    if (sector) {
      systemPrompt = sector.system_prompt || systemPrompt
      model = sector.ai_model || model
      temperature = sector.ai_temperature ?? temperature
      maxTokens = sector.ai_max_tokens ?? maxTokens
    }
  }

  // Cap max_tokens to prevent a single prompt from burning the monthly budget
  maxTokens = Math.min(maxTokens, 1500)

  // 4. RAG search for relevant knowledge
  let sources: AiRagSource[] = []
  let knowledgeContext = ''

  // Fetch all context in parallel with 5-second timeouts to prevent hangs
  if (sectorId) {
    try {
      sources = await withTimeoutFallback(
        searchRelevantChunks(latestMessage, sectorId, orgId),
        5_000,
        [] as AiRagSource[]
      )
      if (sources.length > 0) {
        knowledgeContext = sources
          .map((s, i) => `[${i + 1}] (${s.documentName}, similaridade: ${(s.similarity * 100).toFixed(0)}%)\n${s.content}`)
          .join('\n\n')
      }
    } catch (err) {
      console.error('[AI] RAG search failed, proceeding without knowledge:', err)
    }
  }

  // 4b. Fetch operational insights (Operations Brain)
  let insightsContext = ''
  if (sectorId) {
    try {
      const { data: insights } = await withTimeoutFallback(
        supabaseAdmin
          .from('conversation_insights')
          .select('insight_type, title, description, example_quote, playbook')
          .eq('sector_id', sectorId)
          .eq('org_id', orgId)
          .gte('confidence', 0.7)
          .in('insight_type', ['winning_pattern', 'key_phrase', 'objection_handled', 'playbook_step'])
          .order('confidence', { ascending: false })
          .limit(5),
        5_000,
        { data: null, error: null } as never
      )

      if (insights && insights.length > 0) {
        insightsContext = insights
          .map((ins) => {
            let entry = `- ${ins.title}: ${ins.description}`
            if (ins.example_quote) entry += `\n  Exemplo: "${ins.example_quote}"`
            if (ins.playbook) entry += `\n  Acao: ${ins.playbook}`
            return entry
          })
          .join('\n')
      }
    } catch (err) {
      console.error('[AI] Insights fetch failed, proceeding without:', err)
    }
  }

  // 4c. Fetch org brain directives (Company Brain)
  let brainDirectives = ''
  try {
    const { data: directives } = await withTimeoutFallback(
      supabaseAdmin
        .from('org_brain_directives')
        .select('category, title, content')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .limit(8),
      5_000,
      { data: null, error: null } as never
    )

    if (directives && directives.length > 0) {
      // Filter: only include directives that apply to this sector or to all sectors
      const applicable = directives.filter((d: Record<string, unknown>) => {
        const sectors = d.applies_to_sectors as string[] | null
        if (!sectors || sectors.length === 0) return true // applies to all
        return sectorId ? sectors.includes(sectorId) : true
      })

      if (applicable.length > 0) {
        brainDirectives = applicable
          .map((d) => `[${(d.category as string).toUpperCase()}] ${d.title}:\n${d.content}`)
          .join('\n\n')
      }
    }
  } catch (err) {
    console.error('[AI] Brain directives fetch failed:', err)
  }

  // 4d. Fetch contact profile (Ecosystem Intelligence)
  let contactProfileContext = ''
  try {
    const { data: conv } = await withTimeoutFallback(
      supabaseAdmin
        .from('conversations')
        .select('contact_id, assigned_to')
        .eq('id', conversationId)
        .single(),
      5_000,
      { data: null, error: null } as never
    )

    if (conv?.contact_id) {
      const { data: contact } = await withTimeoutFallback(
        supabaseAdmin
          .from('contacts')
          .select('name, profile_summary, profile_traits, profile_interests, profile_objections, profile_stage, profile_sentiment, total_conversations, total_revenue')
          .eq('id', conv.contact_id)
          .single(),
        5_000,
        { data: null, error: null } as never
      )

      if (contact?.profile_summary) {
        const traits = contact.profile_traits as Record<string, number> || {}
        const topTraits = Object.entries(traits)
          .filter(([, v]) => v >= 0.6)
          .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`)
          .join(', ')

        const interests = (contact.profile_interests as string[]) || []
        const objections = (contact.profile_objections as string[]) || []

        contactProfileContext = `Nome: ${contact.name || 'desconhecido'}
Resumo: ${contact.profile_summary}
Estagio: ${contact.profile_stage || 'desconhecido'}
Sentimento: ${contact.profile_sentiment || 'neutro'}
${topTraits ? `Tracos dominantes: ${topTraits}` : ''}
${interests.length > 0 ? `Interesses: ${interests.join(', ')}` : ''}
${objections.length > 0 ? `Objecoes recorrentes: ${objections.join(', ')}` : ''}
${contact.total_conversations ? `Conversas anteriores: ${contact.total_conversations}` : 'Primeiro contato'}
${contact.total_revenue ? `Receita historica: R$ ${contact.total_revenue}` : ''}`
      }
    }

    // 4e. Fetch latest conversation snapshot (real-time intelligence)
    const { data: snapshot } = await withTimeoutFallback(
      supabaseAdmin
        .from('conversation_snapshots')
        .select('detected_intent, detected_temperature, detected_stage, detected_urgency, buying_signals, risk_signals, opportunity_signals, recommended_action, seller_approach_score')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      5_000,
      { data: null, error: null } as never
    )

    let snapshotContext = ''
    if (snapshot) {
      const buyingSignals = (snapshot.buying_signals as string[]) || []
      const riskSignals = (snapshot.risk_signals as string[]) || []
      const opportunitySignals = (snapshot.opportunity_signals as string[]) || []

      snapshotContext = `Intent: ${snapshot.detected_intent || 'indefinido'}
Temperatura: ${snapshot.detected_temperature || 'indefinida'}
Estagio de venda: ${snapshot.detected_stage || 'indefinido'}
Urgencia: ${snapshot.detected_urgency || 'normal'}
${buyingSignals.length > 0 ? `Sinais de compra: ${buyingSignals.join('; ')}` : ''}
${riskSignals.length > 0 ? `Sinais de risco: ${riskSignals.join('; ')}` : ''}
${opportunitySignals.length > 0 ? `Oportunidades: ${opportunitySignals.join('; ')}` : ''}
${snapshot.recommended_action ? `Acao recomendada: ${snapshot.recommended_action}` : ''}`
    }

    // Merge into contactProfileContext
    if (snapshotContext) {
      contactProfileContext = contactProfileContext
        ? `${contactProfileContext}\n\nANALISE EM TEMPO REAL DA CONVERSA:\n${snapshotContext}`
        : `ANALISE EM TEMPO REAL DA CONVERSA:\n${snapshotContext}`
    }
  } catch (err) {
    console.error('[AI] Contact/snapshot fetch failed, proceeding without:', err)
  }

  // 5. Build the full system prompt
  const fullSystemPrompt = buildSystemPrompt(systemPrompt, knowledgeContext, insightsContext, brainDirectives, contactProfileContext)

  // 6. Build user message
  const userMessage = buildUserMessage(conversationHistory, latestMessage)

  // 7. Call Claude via AI SDK (non-streaming for background suggestions)
  // Circuit breaker + 40s timeout prevents cascading failures
  console.log(`[AI] Chamando Claude (${model})...`)
  const result = await claudeCircuitBreaker.execute(() =>
    withTimeout(
      generateText({
        model: anthropic(model),
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        temperature,
        maxTokens,
      }),
      40_000,
      `Claude ${model} generateText`
    )
  )

  const suggestion = result.text
  const latencyMs = Date.now() - startTime

  const tokenInfo = {
    prompt: result.usage?.promptTokens || 0,
    completion: result.usage?.completionTokens || 0,
    total: (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0),
  }

  // 8. Save suggestion to the latest contact message
  const { data: latestMsg } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'contact')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (latestMsg) {
    const dbSources = sources.map((s) => ({
      doc_name: s.documentName,
      chunk_id: s.chunkId,
      similarity: s.similarity,
      page: s.page,
    }))

    await supabaseAdmin
      .from('messages')
      .update({
        ai_suggested_response: suggestion,
        ai_suggestion_sources: dbSources,
        ai_model_used: model,
        ai_tokens_used: tokenInfo.total,
        ai_latency_ms: latencyMs,
      })
      .eq('id', latestMsg.id)
  }

  // 9. Log usage
  await supabaseAdmin.from('ai_usage_logs').insert({
    org_id: orgId,
    conversation_id: conversationId,
    model,
    prompt_tokens: tokenInfo.prompt,
    completion_tokens: tokenInfo.completion,
    total_tokens: tokenInfo.total,
    latency_ms: latencyMs,
  })

  // 10. Update org token count (atomic via RPC)
  await supabaseAdmin.rpc('increment_ai_tokens', {
    p_org_id: orgId,
    p_tokens: tokenInfo.total,
  })

  console.log(`[AI] Suggestion generated in ${latencyMs}ms — ${tokenInfo.total} tokens — ${sources.length} sources`)

  return {
    suggestion,
    sources,
    model,
    tokens: tokenInfo,
    latencyMs,
  }
}

/**
 * Stream an AI suggestion via SSE (Server-Sent Events).
 */
export async function* streamSuggestion(
  conversationId: string,
  latestMessage: string,
  sectorId: string | null,
  orgId: string
): AsyncGenerator<{ type: 'text' | 'sources' | 'done' | 'error'; data: string }> {
  const startTime = Date.now()

  try {
    // Check token limit
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('ai_monthly_token_limit, ai_tokens_used_this_month')
      .eq('id', orgId)
      .single()

    if (org && org.ai_monthly_token_limit != null && org.ai_tokens_used_this_month >= org.ai_monthly_token_limit) {
      yield { type: 'error', data: 'Limite mensal de tokens IA atingido.' }
      return
    }

    // Fetch context
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('sender_type, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (messages || [])
      .reverse()
      .map((m) => {
        const role = m.sender_type === 'contact' ? 'Cliente' : 'Atendente'
        return `${role}: ${m.content || '[mídia]'}`
      })
      .join('\n')

    // Sector config
    let systemPrompt = 'Você é um assistente de atendimento ao cliente.'
    let model = 'claude-sonnet-4-20250514'
    let temperature = 0.3
    let maxTokens = 1024

    if (sectorId) {
      const { data: sector } = await supabaseAdmin
        .from('sectors')
        .select('system_prompt, ai_model, ai_temperature, ai_max_tokens')
        .eq('id', sectorId)
        .single()

      if (sector) {
        systemPrompt = sector.system_prompt || systemPrompt
        model = sector.ai_model || model
        temperature = sector.ai_temperature ?? temperature
        maxTokens = sector.ai_max_tokens ?? maxTokens
      }
    }

    // Cap max_tokens for streaming consult (slightly higher than suggestions)
    maxTokens = Math.min(maxTokens, 2000)

    // RAG (with 5s timeout to prevent hangs)
    let sources: AiRagSource[] = []
    let knowledgeContext = ''
    if (sectorId) {
      try {
        sources = await withTimeoutFallback(
          searchRelevantChunks(latestMessage, sectorId, orgId),
          5_000,
          [] as AiRagSource[]
        )
        if (sources.length > 0) {
          knowledgeContext = sources
            .map((s, i) => `[${i + 1}] (${s.documentName})\n${s.content}`)
            .join('\n\n')
        }
      } catch {
        // Continue without RAG
      }
    }

    // Fetch operational insights for streaming too (with 5s timeout)
    let streamInsightsContext = ''
    if (sectorId) {
      try {
        const { data: insights } = await withTimeoutFallback(
          supabaseAdmin
            .from('conversation_insights')
            .select('insight_type, title, description, example_quote, playbook')
            .eq('sector_id', sectorId)
            .eq('org_id', orgId)
            .gte('confidence', 0.7)
            .in('insight_type', ['winning_pattern', 'key_phrase', 'objection_handled', 'playbook_step'])
            .order('confidence', { ascending: false })
            .limit(5),
          5_000,
          { data: null, error: null } as never
        )

        if (insights && insights.length > 0) {
          streamInsightsContext = insights
            .map((ins) => {
              let entry = `- ${ins.title}: ${ins.description}`
              if (ins.example_quote) entry += `\n  Exemplo: "${ins.example_quote}"`
              if (ins.playbook) entry += `\n  Acao: ${ins.playbook}`
              return entry
            })
            .join('\n')
        }
      } catch {
        // Continue without insights
      }
    }

    // 4c. Fetch org brain directives (Company Brain) (with 5s timeout)
    let streamBrainDirectives = ''
    try {
      const { data: directives } = await withTimeoutFallback(
        supabaseAdmin
          .from('org_brain_directives')
          .select('category, title, content')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('priority', { ascending: false })
          .limit(8),
        5_000,
        { data: null, error: null } as never
      )

      if (directives && directives.length > 0) {
        const applicable = directives.filter((d: Record<string, unknown>) => {
          const sectors = d.applies_to_sectors as string[] | null
          if (!sectors || sectors.length === 0) return true
          return sectorId ? sectors.includes(sectorId) : true
        })

        if (applicable.length > 0) {
          streamBrainDirectives = applicable
            .map((d) => `[${(d.category as string).toUpperCase()}] ${d.title}:\n${d.content}`)
            .join('\n\n')
        }
      }
    } catch {
      // Continue without brain directives
    }

    // 4d. Fetch contact profile + snapshot (Ecosystem Intelligence) (with 5s timeout)
    let streamContactProfileContext = ''
    try {
      const { data: conv } = await withTimeoutFallback(
        supabaseAdmin
          .from('conversations')
          .select('contact_id, assigned_to')
          .eq('id', conversationId)
          .single(),
        5_000,
        { data: null, error: null } as never
      )

      if (conv?.contact_id) {
        const { data: contact } = await withTimeoutFallback(
          supabaseAdmin
            .from('contacts')
            .select('name, profile_summary, profile_traits, profile_interests, profile_objections, profile_stage, profile_sentiment, total_conversations, total_revenue')
            .eq('id', conv.contact_id)
            .single(),
          5_000,
          { data: null, error: null } as never
        )

        if (contact?.profile_summary) {
          const traits = contact.profile_traits as Record<string, number> || {}
          const topTraits = Object.entries(traits)
            .filter(([, v]) => v >= 0.6)
            .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`)
            .join(', ')

          const interests = (contact.profile_interests as string[]) || []
          const objections = (contact.profile_objections as string[]) || []

          streamContactProfileContext = `Nome: ${contact.name || 'desconhecido'}
Resumo: ${contact.profile_summary}
Estagio: ${contact.profile_stage || 'desconhecido'}
Sentimento: ${contact.profile_sentiment || 'neutro'}
${topTraits ? `Tracos dominantes: ${topTraits}` : ''}
${interests.length > 0 ? `Interesses: ${interests.join(', ')}` : ''}
${objections.length > 0 ? `Objecoes recorrentes: ${objections.join(', ')}` : ''}
${contact.total_conversations ? `Conversas anteriores: ${contact.total_conversations}` : 'Primeiro contato'}
${contact.total_revenue ? `Receita historica: R$ ${contact.total_revenue}` : ''}`
        }
      }

      // 4e. Fetch latest conversation snapshot (with 5s timeout)
      const { data: snapshot } = await withTimeoutFallback(
        supabaseAdmin
          .from('conversation_snapshots')
          .select('detected_intent, detected_temperature, detected_stage, detected_urgency, buying_signals, risk_signals, opportunity_signals, recommended_action, seller_approach_score')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        5_000,
        { data: null, error: null } as never
      )

      if (snapshot) {
        const buyingSignals = (snapshot.buying_signals as string[]) || []
        const riskSignals = (snapshot.risk_signals as string[]) || []
        const opportunitySignals = (snapshot.opportunity_signals as string[]) || []

        const snapshotContext = `Intent: ${snapshot.detected_intent || 'indefinido'}
Temperatura: ${snapshot.detected_temperature || 'indefinida'}
Estagio de venda: ${snapshot.detected_stage || 'indefinido'}
Urgencia: ${snapshot.detected_urgency || 'normal'}
${buyingSignals.length > 0 ? `Sinais de compra: ${buyingSignals.join('; ')}` : ''}
${riskSignals.length > 0 ? `Sinais de risco: ${riskSignals.join('; ')}` : ''}
${opportunitySignals.length > 0 ? `Oportunidades: ${opportunitySignals.join('; ')}` : ''}
${snapshot.recommended_action ? `Acao recomendada: ${snapshot.recommended_action}` : ''}`

        streamContactProfileContext = streamContactProfileContext
          ? `${streamContactProfileContext}\n\nANALISE EM TEMPO REAL DA CONVERSA:\n${snapshotContext}`
          : `ANALISE EM TEMPO REAL DA CONVERSA:\n${snapshotContext}`
      }
    } catch {
      // Continue without ecosystem intelligence
    }

    // Send sources first
    if (sources.length > 0) {
      yield { type: 'sources', data: JSON.stringify(sources) }
    }

    // Stream Claude response
    const fullSystemPrompt = buildSystemPrompt(systemPrompt, knowledgeContext, streamInsightsContext, streamBrainDirectives, streamContactProfileContext)
    const userMessage = buildUserMessage(conversationHistory, latestMessage)

    const result = await streamText({
      model: anthropic(model),
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature,
      maxTokens,
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
      yield { type: 'text', data: chunk }
    }

    const usage = await result.usage
    const latencyMs = Date.now() - startTime
    const totalTokens = (usage?.promptTokens || 0) + (usage?.completionTokens || 0)

    // Save to DB
    const { data: latestMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestMsg) {
      const dbSources = sources.map((s) => ({
        doc_name: s.documentName,
        chunk_id: s.chunkId,
        similarity: s.similarity,
        page: s.page,
      }))

      await supabaseAdmin
        .from('messages')
        .update({
          ai_suggested_response: fullText,
          ai_suggestion_sources: dbSources,
          ai_model_used: model,
          ai_tokens_used: totalTokens,
          ai_latency_ms: latencyMs,
        })
        .eq('id', latestMsg.id)
    }

    // Log usage
    await supabaseAdmin.from('ai_usage_logs').insert({
      org_id: orgId,
      conversation_id: conversationId,
      model,
      prompt_tokens: usage?.promptTokens || 0,
      completion_tokens: usage?.completionTokens || 0,
      total_tokens: totalTokens,
      latency_ms: latencyMs,
    })

    // Update org tokens (atomic via RPC)
    await supabaseAdmin.rpc('increment_ai_tokens', {
      p_org_id: orgId,
      p_tokens: totalTokens,
    })

    yield {
      type: 'done',
      data: JSON.stringify({ model, tokens: totalTokens, latencyMs }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    yield { type: 'error', data: message }
  }
}

// --- Prompt builders ---

function buildSystemPrompt(
  sectorPrompt: string,
  knowledgeContext: string,
  insightsContext?: string,
  brainDirectives?: string,
  contactProfileContext?: string
): string {
  let prompt = sectorPrompt

  // Customer Intelligence: who is this person and what's happening in this conversation
  if (contactProfileContext) {
    prompt += `

INTELIGENCIA DO CLIENTE (perfil evolutivo + analise em tempo real):
${contactProfileContext}

COMO USAR ESTA INTELIGENCIA:
- Adapte o tom ao sentimento e estagio do cliente
- Se ha sinais de compra, seja direto e facilite o fechamento
- Se ha sinais de risco, enderece preocupacoes antes de avancar
- Se o cliente e analitico, use dados; se e relacional, use empatia
- Se e cliente recorrente com receita historica, trate como premium
- Siga a acao recomendada quando disponivel`
  }

  // Company Brain: organizational directives from the CEO/manager
  if (brainDirectives) {
    prompt += `

DIRETRIZES DA EMPRESA (definidas pela gestao — siga rigorosamente):
${brainDirectives}`
  }

  // Operations Brain: learned patterns from real conversations
  if (insightsContext) {
    prompt += `

APRENDIZADOS OPERACIONAIS (padroes extraidos de conversas reais):
${insightsContext}`
  }

  // Knowledge Brain: RAG documents
  if (knowledgeContext) {
    prompt += `

BASE DE CONHECIMENTO (use estas informacoes para responder com precisao):
---
${knowledgeContext}
---`
  }

  prompt += `

REGRAS FINAIS:
- Se nao houver informacao suficiente na base de conhecimento, diga: "Vou verificar com a equipe e retorno em breve."
- NUNCA invente precos, prazos ou especificacoes.
- Responda de forma concisa (1-3 frases, estilo WhatsApp).
- NUNCA use emojis.`

  return prompt
}

function buildUserMessage(history: string, latestMessage: string): string {
  let msg = ''
  if (history) {
    msg += `Histórico da conversa:\n${history}\n\n`
  }
  msg += `Mensagem do cliente:\n${latestMessage}`
  return msg
}
