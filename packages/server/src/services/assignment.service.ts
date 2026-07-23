import { supabaseAdmin } from '../lib/supabase.js'

/**
 * MOTOR DE ATRIBUIÇÃO (multi-vendedor).
 *
 * Popular conversations.assigned_to (round-robin / sticky), o SLA de primeira
 * resposta (first_response_at + response_time_secs) e as transições de status
 * (open ⇄ closed). Todas as operações são org-scoped e usam o supabaseAdmin
 * (service_role) — a autorização por papel acontece na camada de rota.
 *
 * Estados canônicos de status seguem migration 001: 'open' | 'pending' |
 * 'resolved' | 'closed'. A lógica aqui trabalha com open (ativo) e closed
 * (fechado); 'pending'/'resolved' pré-existentes nos dados são preservados.
 */

export type AssignMode = 'off' | 'round_robin' | 'sticky_round_robin'

/**
 * Lê o modo de atribuição da org. Default 'off' se ausente/desconhecido.
 */
export async function getAssignMode(orgId: string): Promise<AssignMode> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('assign_mode')
    .eq('id', orgId)
    .single()

  const mode = (data?.assign_mode as AssignMode | undefined) ?? 'off'
  return mode === 'round_robin' || mode === 'sticky_round_robin' ? mode : 'off'
}

/**
 * Próximo agente por menor carga (round-robin) entre usuários online do org.
 * Usa a função SQL pick_next_agent; fallback: qualquer usuário ativo do org
 * (online preferencialmente) se a RPC não retornar ninguém.
 */
export async function pickNextAgent(orgId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('pick_next_agent', {
    p_org_id: orgId,
  })

  if (!error && typeof data === 'string' && data) {
    return data
  }

  // Fallback: prioriza online, senão qualquer membro do org.
  const { data: online } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_online', true)
    .in('role', ['owner', 'admin', 'agent'])
    .order('last_seen_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()

  if (online?.id) return online.id

  const { data: anyUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin', 'agent'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return anyUser?.id ?? null
}

/**
 * Agente "grudento": o último que atendeu esse contato (conversa anterior com
 * assigned_to preenchido). Retorna null se não houver histórico.
 */
export async function stickyAgentFor(
  orgId: string,
  contactId: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('assigned_to')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .not('assigned_to', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.assigned_to as string | null) ?? null
}

/**
 * Atribuição automática ao CRIAR uma conversa nova. Respeita org.assign_mode:
 *   off                → não faz nada
 *   round_robin        → pickNextAgent
 *   sticky_round_robin → stickyAgentFor; se não houver, cai no round-robin
 *
 * Só escreve se a conversa ainda estiver sem dono (não sobrescreve atribuição
 * manual feita em paralelo). Idempotente e fail-safe (nunca lança).
 */
export async function autoAssignConversation(
  orgId: string,
  conversationId: string,
  contactId: string
): Promise<string | null> {
  try {
    const mode = await getAssignMode(orgId)
    if (mode === 'off') return null

    let agentId: string | null = null
    if (mode === 'sticky_round_robin') {
      agentId = await stickyAgentFor(orgId, contactId)
    }
    if (!agentId) {
      agentId = await pickNextAgent(orgId)
    }
    if (!agentId) return null

    // Só atribui se ainda estiver sem dono (guard contra corrida com atribuição manual).
    const { data: updated } = await supabaseAdmin
      .from('conversations')
      .update({ assigned_to: agentId })
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .is('assigned_to', null)
      .select('id')
      .maybeSingle()

    return updated ? agentId : null
  } catch (err) {
    console.warn('[Assignment] autoAssign falhou (ignorado):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Atribuição administrativa: owner/admin define o dono de uma conversa.
 * Escopo por org garantido pelo caller; reforçado aqui via eq(org_id) no update.
 */
export async function assignConversation(
  orgId: string,
  conversationId: string,
  userId: string,
  _byUserId: string
): Promise<boolean> {
  // Valida que o alvo pertence à mesma org e tem papel operável.
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin', 'agent'])
    .maybeSingle()

  if (!target) return false

  const { data: updated } = await supabaseAdmin
    .from('conversations')
    .update({ assigned_to: userId })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()

  return !!updated
}

/**
 * Um agente "pega pra si" (claim) uma conversa — normalmente uma sem dono.
 * Aceita reivindicar mesmo já atribuída (o próprio agente assume o atendimento).
 */
export async function claimConversation(
  orgId: string,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data: updated } = await supabaseAdmin
    .from('conversations')
    .update({ assigned_to: userId })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()

  return !!updated
}

/**
 * Fecha uma conversa (status='closed', resolved_at=agora, zera unread).
 */
export async function closeConversation(
  orgId: string,
  conversationId: string
): Promise<boolean> {
  const { data: updated } = await supabaseAdmin
    .from('conversations')
    .update({
      status: 'closed',
      resolved_at: new Date().toISOString(),
      unread_count: 0,
    })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()

  return !!updated
}

/**
 * Reabre uma conversa fechada/resolvida (status='open', limpa resolved_at).
 */
export async function reopenConversation(
  orgId: string,
  conversationId: string
): Promise<boolean> {
  const { data: updated } = await supabaseAdmin
    .from('conversations')
    .update({
      status: 'open',
      resolved_at: null,
    })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()

  return !!updated
}

/**
 * Marca a PRIMEIRA resposta do vendedor. Idempotente: só age se first_response_at
 * ainda for nulo. Calcula response_time_secs a partir do último inbound do cliente
 * (message.sender_type='contact') anterior a agora; se não houver, usa created_at
 * da conversa como âncora. Fail-safe (nunca lança).
 */
export async function markFirstResponse(conversationId: string): Promise<void> {
  try {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, first_response_at, created_at')
      .eq('id', conversationId)
      .single()

    if (!conv || conv.first_response_at) return

    const now = new Date()

    // Último inbound do cliente nesta conversa (âncora do tempo de resposta).
    const { data: lastInbound } = await supabaseAdmin
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const anchorIso = (lastInbound?.created_at as string | undefined) || (conv.created_at as string)
    const anchorMs = new Date(anchorIso).getTime()
    const responseSecs = Number.isFinite(anchorMs)
      ? Math.max(0, Math.round((now.getTime() - anchorMs) / 1000))
      : null

    await supabaseAdmin
      .from('conversations')
      .update({
        first_response_at: now.toISOString(),
        response_time_secs: responseSecs,
      })
      .eq('id', conversationId)
      .is('first_response_at', null) // guard de idempotência contra corrida
  } catch (err) {
    console.warn('[Assignment] markFirstResponse falhou (ignorado):', err instanceof Error ? err.message : err)
  }
}
