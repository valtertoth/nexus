import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabase.js'
import { generateEmbedding } from './embedding.service.js'
import type { ConversationInsightInsert, InsightType, ConversationOutcome } from '@nexus/shared'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

interface ConversationForAnalysis {
  id: string
  org_id: string
  sector_id: string | null
  outcome: ConversationOutcome
  outcome_value: number | null
  attr_channel: string | null
  attr_campaign: string | null
}

interface MessageForAnalysis {
  sender_type: 'contact' | 'agent' | 'ai' | 'system'
  content: string | null
  created_at: string
}

/**
 * Fetch full conversation with messages for analysis.
 */
async function fetchConversationWithMessages(
  conversationId: string
): Promise<{ conversation: ConversationForAnalysis; messages: MessageForAnalysis[] } | null> {
  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, sector_id, outcome, outcome_value, attr_channel, attr_campaign')
    .eq('id', conversationId)
    .single()

  if (!conversation || !conversation.outcome) return null

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_internal_note', false)
    .order('created_at', { ascending: true })
    .limit(200) // Limit to avoid huge prompts

  if (!messages || messages.length < 3) return null // Too short to be useful

  return {
    conversation: conversation as ConversationForAnalysis,
    messages: messages as MessageForAnalysis[],
  }
}

/**
 * Build the conversation transcript for the analysis prompt.
 */
function buildTranscript(messages: MessageForAnalysis[]): string {
  return messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => {
      const role =
        m.sender_type === 'contact'
          ? 'CLIENTE'
          : m.sender_type === 'ai'
          ? 'IA'
          : 'ATENDENTE'
      return `[${role}]: ${m.content}`
    })
    .join('\n')
}

/**
 * Extract structured insights from a closed conversation using Claude.
 */
async function extractInsightsWithClaude(
  conversation: ConversationForAnalysis,
  transcript: string
): Promise<{ insights: ConversationInsightInsert[]; tokensUsed: number }> {
  const outcomeLabel = {
    converted: 'CONVERTIDO (venda realizada)',
    lost: 'PERDIDO (não comprou)',
    problem: 'PROBLEMA (reclamação ou conflito)',
  }[conversation.outcome]

  const prompt = `Você é um especialista em análise de conversas de vendas via WhatsApp. Analise a conversa abaixo e extraia insights estruturados que possam ajudar outros atendentes e a IA a performar melhor.

RESULTADO DA CONVERSA: ${outcomeLabel}
${conversation.outcome_value ? `VALOR: R$ ${conversation.outcome_value}` : ''}
${conversation.attr_channel ? `CANAL DE ORIGEM: ${conversation.attr_channel}` : ''}
${conversation.attr_campaign ? `CAMPANHA: ${conversation.attr_campaign}` : ''}

TRANSCRIÇÃO:
${transcript}

Extraia de 2 a 5 insights no formato JSON. Responda APENAS com um array JSON válido, sem markdown:

[
  {
    "insight_type": "winning_pattern" | "losing_pattern" | "key_phrase" | "objection_handled" | "turning_point" | "playbook_step",
    "title": "Título curto e descritivo (máx 80 chars)",
    "description": "Descrição clara do que aconteceu e por que é relevante (máx 300 chars)",
    "example_quote": "Citação exata da conversa que ilustra o insight (ou null)",
    "playbook": "Como replicar ou evitar isso em futuras conversas (ou null)",
    "tags": ["tag1", "tag2"],
    "confidence": 0.0 a 1.0
  }
]

Regras:
- winning_pattern: para conversas convertidas — o que funcionou
- losing_pattern: para conversas perdidas — o que causou a perda
- key_phrase: frase ou abordagem específica que teve impacto positivo
- objection_handled: objeção do cliente que foi superada com sucesso
- turning_point: momento em que a conversa mudou de direção
- playbook_step: passo acionável replicável em futuras conversas
- Foco em conversas convertidas: extraia winning_patterns, key_phrases
- Foco em conversas perdidas: extraia losing_patterns, turning_points
- confidence: quão claro e replicável é o padrão (0.9+ = cristalino, 0.5 = incerto)
- Seja específico ao comportamento DESTA conversa, não genérico`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  let rawInsights: Array<{
    insight_type: InsightType
    title: string
    description: string
    example_quote?: string
    playbook?: string
    tags?: string[]
    confidence?: number
  }> = []

  try {
    // Strip any accidental markdown
    const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    rawInsights = JSON.parse(clean)
  } catch {
    console.error('[Intelligence] Failed to parse Claude response:', rawText.slice(0, 500))
    return { insights: [], tokensUsed }
  }

  const insights: ConversationInsightInsert[] = rawInsights
    .filter((i) => i.title && i.description && i.insight_type)
    .map((i) => ({
      org_id: conversation.org_id,
      sector_id: conversation.sector_id ?? undefined,
      conversation_id: conversation.id,
      outcome: conversation.outcome,
      outcome_value: conversation.outcome_value ?? undefined,
      attr_channel: conversation.attr_channel ?? undefined,
      attr_campaign: conversation.attr_campaign ?? undefined,
      insight_type: i.insight_type,
      title: i.title.slice(0, 100),
      description: i.description.slice(0, 500),
      example_quote: i.example_quote?.slice(0, 500),
      playbook: i.playbook?.slice(0, 1000),
      tags: i.tags ?? [],
      confidence: Math.min(1, Math.max(0, i.confidence ?? 0.7)),
      ai_model: 'claude-haiku-4-5-20251001',
      ai_tokens_used: Math.round(tokensUsed / (rawInsights.length || 1)),
    }))

  return { insights, tokensUsed }
}

/**
 * Save insights to DB and inject high-confidence ones into RAG.
 */
async function saveInsightsAndInjectRAG(
  insights: ConversationInsightInsert[]
): Promise<void> {
  if (insights.length === 0) return

  const { data: saved, error } = await supabaseAdmin
    .from('conversation_insights')
    .insert(insights)
    .select('id, confidence, title, sector_id, org_id, insight_type, description, playbook, tags')

  if (error) {
    console.error('[Intelligence] Failed to save insights:', error.message)
    return
  }

  // Inject winning patterns with confidence >= 0.75 into RAG
  const toInject = (saved || []).filter(
    (i) => i.confidence >= 0.75 && ['winning_pattern', 'key_phrase', 'playbook_step', 'objection_handled'].includes(i.insight_type)
  )

  for (const insight of toInject) {
    await injectInsightIntoRAG(insight)
  }
}

/**
 * Inject a single insight as a RAG knowledge document for AI suggestions.
 */
async function injectInsightIntoRAG(insight: {
  id: string
  title: string
  description: string
  playbook: string | null
  tags: string[]
  confidence: number
  sector_id: string | null
  org_id: string
  insight_type: string
}): Promise<void> {
  if (!insight.sector_id) return // Need sector for RAG

  const docContent = [
    `# ${insight.title}`,
    '',
    insight.description,
    '',
    insight.playbook ? `## Como aplicar\n${insight.playbook}` : '',
    '',
    `Confiança: ${Math.round(insight.confidence * 100)}%`,
    insight.tags.length > 0 ? `Tags: ${insight.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // Create a knowledge_document entry (source_type = 'auto_insight')
  const filename = `insight_${insight.id.slice(0, 8)}.md`
  const filePath = `auto_insights/${insight.org_id}/${filename}`

  const { data: doc, error: docError } = await supabaseAdmin
    .from('knowledge_documents')
    .insert({
      org_id: insight.org_id,
      sector_id: insight.sector_id,
      filename,
      file_path: filePath,
      mime_type: 'text/markdown',
      status: 'processing',
      source_type: 'auto_insight',
    })
    .select('id')
    .single()

  if (docError || !doc) {
    console.error('[Intelligence] Failed to create doc for insight:', docError?.message)
    return
  }

  // Generate embedding and create chunk
  try {
    const embedding = await generateEmbedding(docContent)

    await supabaseAdmin.from('knowledge_chunks').insert({
      document_id: doc.id,
      org_id: insight.org_id,
      sector_id: insight.sector_id,
      content: docContent,
      metadata: {
        insight_id: insight.id,
        insight_type: insight.insight_type,
        confidence: insight.confidence,
        auto_generated: true,
      },
      embedding,
      token_count: Math.ceil(docContent.length / 4),
    })

    // Mark document as ready
    await supabaseAdmin
      .from('knowledge_documents')
      .update({ status: 'ready', chunks_count: 1, processed_at: new Date().toISOString() })
      .eq('id', doc.id)

    // Mark insight as injected
    await supabaseAdmin
      .from('conversation_insights')
      .update({ injected_to_rag: true, rag_document_id: doc.id })
      .eq('id', insight.id)

    console.log(`[Intelligence] Insight "${insight.title}" injected into RAG`)
  } catch (err) {
    await supabaseAdmin
      .from('knowledge_documents')
      .update({ status: 'error', error_message: String(err) })
      .eq('id', doc.id)
    console.error('[Intelligence] RAG injection failed:', err)
  }
}

/**
 * Main entry point: analyze a closed conversation and extract insights.
 * Called after an agent marks a conversation as resolved with an outcome.
 */
export async function analyzeConversation(conversationId: string): Promise<{
  success: boolean
  insightsCount: number
  skipped?: boolean
}> {
  // Check for duplicate job
  const { data: existingJob } = await supabaseAdmin
    .from('conversation_analysis_jobs')
    .select('id, status')
    .eq('conversation_id', conversationId)
    .single()

  if (existingJob) {
    if (existingJob.status === 'completed') {
      return { success: true, insightsCount: 0, skipped: true }
    }
    if (existingJob.status === 'processing') {
      return { success: true, insightsCount: 0, skipped: true }
    }
  }

  // Create or update job record
  const { data: job } = await supabaseAdmin
    .from('conversation_analysis_jobs')
    .upsert(
      {
        conversation_id: conversationId,
        status: 'processing',
        started_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id' }
    )
    .select('id, org_id')
    .single()

  try {
    const data = await fetchConversationWithMessages(conversationId)

    if (!data) {
      await supabaseAdmin
        .from('conversation_analysis_jobs')
        .update({ status: 'skipped', completed_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
      return { success: true, insightsCount: 0, skipped: true }
    }

    const transcript = buildTranscript(data.messages)
    const { insights, tokensUsed } = await extractInsightsWithClaude(data.conversation, transcript)

    await saveInsightsAndInjectRAG(insights)

    await supabaseAdmin
      .from('conversation_analysis_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        insights_count: insights.length,
      })
      .eq('conversation_id', conversationId)

    console.log(
      `[Intelligence] Conversation ${conversationId}: ${insights.length} insights extracted, ${tokensUsed} tokens`
    )

    return { success: true, insightsCount: insights.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await supabaseAdmin
      .from('conversation_analysis_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
        retry_count: ((job as unknown as { retry_count?: number })?.retry_count ?? 0) + 1,
      })
      .eq('conversation_id', conversationId)

    console.error('[Intelligence] Analysis failed:', message)
    return { success: false, insightsCount: 0 }
  }
}

/**
 * Get top insights for a sector (used by AI service to enhance suggestions).
 */
export async function getTopInsightsForSector(
  orgId: string,
  sectorId: string,
  limit = 10
): Promise<Array<{ title: string; description: string; playbook: string | null; confidence: number }>> {
  const { data } = await supabaseAdmin
    .from('conversation_insights')
    .select('title, description, playbook, confidence')
    .eq('org_id', orgId)
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .in('insight_type', ['winning_pattern', 'key_phrase', 'playbook_step', 'objection_handled'])
    .gte('confidence', 0.7)
    .order('confidence', { ascending: false })
    .limit(limit)

  return (data || []) as Array<{ title: string; description: string; playbook: string | null; confidence: number }>
}
