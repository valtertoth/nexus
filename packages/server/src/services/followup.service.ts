import { supabaseAdmin } from '../lib/supabase.js'

// ── Types ────────────────────────────────────────────────────────────────────

export type FollowupScope = 'due' | 'upcoming'

export interface FollowupRow {
  id: string
  org_id: string
  conversation_id: string
  user_id: string | null
  remind_at: string
  note: string | null
  done_at: string | null
  created_at: string
}

// Item da fila enriquecido com o mínimo pra montar o card + link pra conversa.
export interface FollowupListItem extends FollowupRow {
  contact_name: string | null
  contact_wa_id: string | null
  conversation_subject: string | null
  last_message_preview: string | null
}

// Formato bruto que o join do PostgREST devolve (relação vem como objeto ou array).
interface FollowupJoinRow extends FollowupRow {
  conversations:
    | {
        subject: string | null
        last_message_preview: string | null
        contacts: { name: string | null; wa_id: string | null } | { name: string | null; wa_id: string | null }[] | null
      }
    | {
        subject: string | null
        last_message_preview: string | null
        contacts: { name: string | null; wa_id: string | null } | { name: string | null; wa_id: string | null }[] | null
      }[]
    | null
}

function flatten(row: FollowupJoinRow): FollowupListItem {
  const conv = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations
  const contactRaw = conv?.contacts
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const {
    conversations: _drop, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...base
  } = row
  return {
    ...base,
    contact_name: contact?.name ?? null,
    contact_wa_id: contact?.wa_id ?? null,
    conversation_subject: conv?.subject ?? null,
    last_message_preview: conv?.last_message_preview ?? null,
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createFollowup(params: {
  orgId: string
  userId: string
  conversationId: string
  remindAt: string
  note?: string | null
}): Promise<FollowupRow> {
  const { orgId, userId, conversationId, remindAt, note } = params

  // Garante que a conversa é da org do vendedor antes de agendar.
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) {
    throw new FollowupError(404, 'Conversa não encontrada')
  }

  const { data, error } = await supabaseAdmin
    .from('conversation_followups')
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      user_id: userId,
      remind_at: remindAt,
      note: note?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new FollowupError(500, `Erro ao criar follow-up: ${error?.message || ''}`)
  }

  return data as FollowupRow
}

// ── List (fila do vendedor logado) ───────────────────────────────────────────

export async function listMine(params: {
  orgId: string
  userId: string
  scope: FollowupScope
}): Promise<FollowupListItem[]> {
  const { orgId, userId, scope } = params
  const nowIso = new Date().toISOString()

  let query = supabaseAdmin
    .from('conversation_followups')
    .select(
      'id, org_id, conversation_id, user_id, remind_at, note, done_at, created_at, conversations(subject, last_message_preview, contacts(name, wa_id))'
    )
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('done_at', null)

  if (scope === 'due') {
    query = query.lte('remind_at', nowIso).order('remind_at', { ascending: true })
  } else {
    query = query.gt('remind_at', nowIso).order('remind_at', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    throw new FollowupError(500, `Erro ao buscar follow-ups: ${error.message}`)
  }

  return ((data as FollowupJoinRow[] | null) || []).map(flatten)
}

// ── Mark done ────────────────────────────────────────────────────────────────

export async function markDone(params: {
  orgId: string
  userId: string
  id: string
}): Promise<FollowupRow> {
  const { orgId, userId, id } = params

  const { data, error } = await supabaseAdmin
    .from('conversation_followups')
    .update({ done_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('done_at', null)
    .select('*')
    .single()

  if (error || !data) {
    throw new FollowupError(404, 'Follow-up não encontrado ou já concluído')
  }

  return data as FollowupRow
}

// ── Error ────────────────────────────────────────────────────────────────────

export class FollowupError extends Error {
  readonly status: 400 | 404 | 500
  constructor(status: 400 | 404 | 500, message: string) {
    super(message)
    this.name = 'FollowupError'
    this.status = status
  }
}
