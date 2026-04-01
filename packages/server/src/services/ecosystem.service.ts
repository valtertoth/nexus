import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { supabaseAdmin } from '../lib/supabase.js'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─────────────────────────────────────────────────────────────────────────────
// ECOSYSTEM INTELLIGENCE SERVICE
// Analisa conversas em tempo real para alimentar:
// 1. Perfil evolutivo do cliente (quem e, o que quer, como se comporta)
// 2. Performance do vendedor (como aborda, pontos fortes/fracos)
// 3. Snapshot da conversa (intent, temperatura, sinais de compra/risco)
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL = 5 // Gera snapshot a cada N mensagens do contato
const SNAPSHOT_MODEL = 'claude-haiku-4-5-20251001' // Rapido e barato para analise continua

interface ConversationContext {
  conversationId: string
  orgId: string
  contactId: string
  contactName: string
  assignedTo: string | null
  sectorName: string | null
  messageCount: number
  contactMessageCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DECIDE SE DEVE ANALISAR (chamado a cada mensagem do contato)
// ─────────────────────────────────────────────────────────────────────────────
export async function shouldAnalyzeConversation(
  conversationId: string,
  orgId: string
): Promise<boolean> {
  // Contar mensagens do contato nesta conversa
  const { count } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'contact')

  const contactMsgCount = count || 0

  // Primeira analise apos 3 mensagens, depois a cada SNAPSHOT_INTERVAL
  if (contactMsgCount < 3) return false
  if (contactMsgCount === 3) return true
  if ((contactMsgCount - 3) % SNAPSHOT_INTERVAL === 0) return true

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GERA SNAPSHOT DA CONVERSA (analise completa em tempo real)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateConversationSnapshot(
  conversationId: string,
  orgId: string
): Promise<void> {
  const startTime = Date.now()

  try {
    // Buscar contexto completo
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, org_id, contact_id, assigned_to, sector_id,
        status, priority, outcome,
        created_at, last_message_at
      `)
      .eq('id', conversationId)
      .single()

    if (!conversation) return

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, name, phone, profile_summary, profile_traits, profile_interests, profile_stage, total_conversations')
      .eq('id', conversation.contact_id)
      .single()

    if (!contact) return

    // Buscar nome do setor
    let sectorName: string | null = null
    if (conversation.sector_id) {
      const { data: sector } = await supabaseAdmin
        .from('sectors')
        .select('name')
        .eq('id', conversation.sector_id)
        .single()
      sectorName = sector?.name || null
    }

    // Buscar mensagens
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_internal_note', false)
      .order('created_at', { ascending: true })
      .limit(100)

    if (!messages || messages.length < 3) return

    const contactMsgCount = messages.filter(m => m.sender_type === 'contact').length
    const agentMsgCount = messages.filter(m => m.sender_type === 'agent').length

    // Calcular tempo medio de resposta do vendedor
    const avgResponseTime = calculateAvgResponseTime(messages)

    // Montar transcript
    const transcript = messages
      .filter(m => m.content?.trim())
      .map(m => {
        const role = m.sender_type === 'contact' ? 'CLIENTE' : m.sender_type === 'agent' ? 'VENDEDOR' : 'IA'
        return `[${role}]: ${m.content}`
      })
      .join('\n')

    // Contexto do perfil existente do cliente (se houver)
    const existingProfile = contact.profile_summary
      ? `\nPERFIL EXISTENTE DO CLIENTE: ${contact.profile_summary}\nTracos: ${JSON.stringify(contact.profile_traits)}\nInteresses: ${JSON.stringify(contact.profile_interests)}\nEstagio: ${contact.profile_stage}\nConversas anteriores: ${contact.total_conversations}`
      : '\nPRIMEIRO CONTATO deste cliente.'

    // Chamar IA para analise
    const result = await generateText({
      model: anthropic(SNAPSHOT_MODEL),
      system: `Voce e um analista de vendas consultivas de moveis planejados via WhatsApp. Analise a conversa e retorne APENAS um JSON valido (sem markdown, sem explicacao).`,
      messages: [{
        role: 'user',
        content: `Analise esta conversa de vendas e retorne um JSON com a estrutura EXATA abaixo.

SETOR: ${sectorName || 'Geral'}
${existingProfile}

TRANSCRICAO:
${transcript}

Retorne APENAS este JSON:
{
  "snapshot": {
    "detected_intent": "orcamento|compra|duvida|reclamacao|sondagem|recompra|social",
    "detected_product": "produto ou servico mencionado (ou null)",
    "detected_urgency": "low|normal|high|critical",
    "detected_temperature": "cold|warm|hot|burning",
    "detected_sentiment": "positive|neutral|negative",
    "detected_stage": "discovery|qualification|proposal|negotiation|closing|post_sale",
    "buying_signals": ["sinal 1", "sinal 2"],
    "risk_signals": ["risco 1"],
    "opportunity_signals": ["oportunidade 1"],
    "seller_approach_score": 7.5,
    "seller_approach_notes": "O que o vendedor fez bem e o que poderia melhorar",
    "recommended_action": "O que o vendedor deveria fazer AGORA como proximo passo",
    "recommended_priority": "immediate|today|this_week|can_wait"
  },
  "contact_profile": {
    "summary": "Resumo de 1-2 frases sobre quem e este cliente",
    "traits": {"decisor": 0.8, "pesquisador": 0.3, "impulsivo": 0.2, "analitico": 0.5, "relacional": 0.7, "price_sensitive": 0.4},
    "interests": ["interesse 1", "interesse 2"],
    "objections": ["objecao 1"],
    "stage": "curiosity|consideration|decision|loyal|churned",
    "sentiment": "positive|neutral|negative|mixed"
  },
  "seller_evaluation": {
    "strengths": ["ponto forte 1"],
    "weaknesses": ["ponto fraco 1"],
    "style": "consultivo|agressivo|tecnico|relacional|passivo"
  }
}

REGRAS:
- Seja especifico para ESTA conversa, nao generico
- Se nao ha dados suficientes para um campo, use null ou array vazio
- Traits sao probabilidades de 0 a 1
- Approach score de 0 a 10 (10 = perfeito)
- Considere o contexto de moveis planejados / sob medida quando relevante
- Se a conversa e pessoal/social (nao e venda), detected_intent = "social" e nao avalie o vendedor`
      }],
      temperature: 0.2,
      maxTokens: 1500,
    })

    // Parse resposta
    let analysis: {
      snapshot: Record<string, unknown>
      contact_profile: Record<string, unknown>
      seller_evaluation: Record<string, unknown>
    }

    try {
      const clean = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      analysis = JSON.parse(clean)
    } catch {
      console.error('[Ecosystem] Failed to parse analysis:', result.text.slice(0, 300))
      return
    }

    const s = analysis.snapshot
    const cp = analysis.contact_profile
    const se = analysis.seller_evaluation
    const latencyMs = Date.now() - startTime
    const tokensUsed = (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0)

    // 3. SALVAR SNAPSHOT
    await supabaseAdmin.from('conversation_snapshots').insert({
      org_id: orgId,
      conversation_id: conversationId,
      contact_id: conversation.contact_id,
      assigned_to: conversation.assigned_to,
      detected_intent: s.detected_intent as string,
      detected_product: s.detected_product as string || null,
      detected_urgency: s.detected_urgency as string,
      detected_temperature: s.detected_temperature as string,
      detected_sentiment: s.detected_sentiment as string,
      detected_stage: s.detected_stage as string,
      seller_approach_score: s.seller_approach_score as number,
      seller_approach_notes: s.seller_approach_notes as string,
      seller_response_avg_secs: avgResponseTime,
      seller_messages_count: agentMsgCount,
      contact_messages_count: contactMsgCount,
      buying_signals: s.buying_signals || [],
      risk_signals: s.risk_signals || [],
      opportunity_signals: s.opportunity_signals || [],
      recommended_action: s.recommended_action as string,
      recommended_priority: s.recommended_priority as string,
      message_count_at_snapshot: messages.length,
      ai_model: SNAPSHOT_MODEL,
      ai_tokens_used: tokensUsed,
    })

    // 4. ATUALIZAR PERFIL DO CLIENTE
    await supabaseAdmin
      .from('contacts')
      .update({
        profile_summary: cp.summary as string,
        profile_traits: cp.traits || {},
        profile_interests: cp.interests || [],
        profile_objections: cp.objections || [],
        profile_stage: cp.stage as string,
        profile_sentiment: cp.sentiment as string,
        profile_updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.contact_id)

    // 5. ATUALIZAR PERFIL DO VENDEDOR (se atribuido)
    if (conversation.assigned_to && se) {
      await updateSellerProfile(conversation.assigned_to, se, s)
    }

    console.log(
      `[Ecosystem] Snapshot: ${(contact.name as string) || 'unknown'} | ` +
      `intent=${s.detected_intent} temp=${s.detected_temperature} ` +
      `stage=${s.detected_stage} score=${s.seller_approach_score} | ` +
      `${tokensUsed} tokens ${latencyMs}ms`
    )

  } catch (err) {
    console.error('[Ecosystem] Snapshot failed:', err instanceof Error ? err.message : err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function calculateAvgResponseTime(
  messages: Array<{ sender_type: string; created_at: string }>
): number {
  const responseTimes: number[] = []

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].sender_type === 'agent' && messages[i - 1].sender_type === 'contact') {
      const contactTime = new Date(messages[i - 1].created_at).getTime()
      const agentTime = new Date(messages[i].created_at).getTime()
      const diffSecs = Math.round((agentTime - contactTime) / 1000)
      if (diffSecs > 0 && diffSecs < 86400) { // ignore > 24h
        responseTimes.push(diffSecs)
      }
    }
  }

  if (responseTimes.length === 0) return 0
  return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
}

async function updateSellerProfile(
  userId: string,
  evaluation: Record<string, unknown>,
  snapshot: Record<string, unknown>
): Promise<void> {
  try {
    // Buscar perfil atual do vendedor
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('seller_strengths, seller_weaknesses, seller_stats, seller_score')
      .eq('id', userId)
      .single()

    if (!user) return

    // Merge strengths/weaknesses (acumular, nao substituir)
    const existingStrengths = (user.seller_strengths as string[]) || []
    const existingWeaknesses = (user.seller_weaknesses as string[]) || []
    const newStrengths = (evaluation.strengths as string[]) || []
    const newWeaknesses = (evaluation.weaknesses as string[]) || []

    const mergedStrengths = [...new Set([...existingStrengths, ...newStrengths])].slice(0, 10)
    const mergedWeaknesses = [...new Set([...existingWeaknesses, ...newWeaknesses])].slice(0, 10)

    // Atualizar stats incrementais
    const stats = (user.seller_stats as Record<string, number>) || {}
    const totalSnapshots = (stats.total_snapshots || 0) + 1
    const approachScore = snapshot.seller_approach_score as number || 0
    const avgScore = ((stats.avg_approach_score || 0) * (totalSnapshots - 1) + approachScore) / totalSnapshots

    const updatedStats = {
      ...stats,
      total_snapshots: totalSnapshots,
      avg_approach_score: Math.round(avgScore * 10) / 10,
      last_approach_score: approachScore,
    }

    // Score geral do vendedor (media ponderada)
    const sellerScore = Math.round(avgScore * 10) // 0-100

    await supabaseAdmin
      .from('users')
      .update({
        seller_strengths: mergedStrengths,
        seller_weaknesses: mergedWeaknesses,
        seller_style: evaluation.style as string,
        seller_stats: updatedStats,
        seller_score: sellerScore,
        seller_profile_updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

  } catch (err) {
    console.error('[Ecosystem] Seller profile update failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE CONTACT STATS (chamado ao fechar conversa)
// ─────────────────────────────────────────────────────────────────────────────
export async function updateContactLifetimeStats(
  contactId: string,
  outcome: string,
  value: number | null
): Promise<void> {
  try {
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('total_conversations, total_revenue, lifetime_value')
      .eq('id', contactId)
      .single()

    if (!contact) return

    const totalConvs = (contact.total_conversations || 0) + 1
    const totalRevenue = (contact.total_revenue || 0) + (outcome === 'converted' && value ? value : 0)

    // LTV simplificado: receita total / conversas totais * taxa historica
    const ltv = totalRevenue

    await supabaseAdmin
      .from('contacts')
      .update({
        total_conversations: totalConvs,
        total_revenue: totalRevenue,
        lifetime_value: ltv,
      })
      .eq('id', contactId)

  } catch (err) {
    console.error('[Ecosystem] Contact stats update failed:', err)
  }
}
