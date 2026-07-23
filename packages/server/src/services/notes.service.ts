import { supabaseAdmin } from '../lib/supabase.js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NoteAuthor {
  id: string
  name: string | null
  avatar_url: string | null
}

export interface ConversationNote {
  id: string
  org_id: string
  conversation_id: string
  author_id: string | null
  body: string
  mentions: string[]
  created_at: string
  author?: NoteAuthor | null
}

export interface TransferResult {
  note: ConversationNote
  target: { id: string; name: string | null }
}

const NOTE_SELECT =
  'id, org_id, conversation_id, author_id, body, mentions, created_at, author:author_id(id, name, avatar_url)'

// ── @menção → user_id ────────────────────────────────────────────────────────

interface OrgMember {
  id: string
  name: string | null
}

async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('org_id', orgId)
  return (data as OrgMember[] | null) || []
}

/**
 * Resolve as @menções de uma nota em user_ids válidos do org.
 *
 * Combina duas fontes, sempre validando contra a lista de membros do org:
 *  1. `explicit` — ids passados pelo cliente (ex.: seleção no autocomplete).
 *  2. Nomes citados no corpo como `@Fulano` (nome completo ou primeiro nome),
 *     casados case-insensitive contra os nomes dos membros.
 *
 * Ids que não pertencem ao org são descartados (nunca vazam menção cross-tenant).
 */
export async function resolveMentions(
  orgId: string,
  body: string,
  explicit?: string[]
): Promise<string[]> {
  const members = await getOrgMembers(orgId)
  const validIds = new Set(members.map((m) => m.id))
  const resolved = new Set<string>()

  // 1) ids explícitos válidos na org
  if (Array.isArray(explicit)) {
    for (const id of explicit) {
      if (typeof id === 'string' && validIds.has(id)) resolved.add(id)
    }
  }

  // 2) parse @nome no corpo (nome completo OU primeiro nome), case-insensitive
  if (body) {
    const lower = body.toLowerCase()
    for (const m of members) {
      const name = (m.name || '').trim()
      if (!name) continue
      const fullLower = name.toLowerCase()
      const candidates = [fullLower]
      const first = fullLower.split(/\s+/)[0]
      if (first && first !== fullLower) candidates.push(first)
      for (const cand of candidates) {
        if (lower.includes('@' + cand)) {
          resolved.add(m.id)
          break
        }
      }
    }
  }

  return [...resolved]
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** Lista as notas internas de uma conversa em ordem cronológica. */
export async function listNotes(
  orgId: string,
  conversationId: string
): Promise<ConversationNote[]> {
  const { data, error } = await supabaseAdmin
    .from('conversation_notes')
    .select(NOTE_SELECT)
    .eq('org_id', orgId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list notes: ${error.message}`)
  }
  return (data as unknown as ConversationNote[]) || []
}

/**
 * Cria uma nota interna. Resolve as @menções antes de gravar.
 *
 * NOTA (integração futura): a ENTREGA da @menção (realtime/push/badge) ainda não
 * é feita aqui — só persistimos o array `mentions`. Um consumidor futuro (canal
 * realtime do Supabase em `conversation_notes` ou um serviço de notificação) deve
 * observar inserts e avisar os mencionados.
 */
export async function createNote(
  orgId: string,
  conversationId: string,
  authorId: string,
  body: string,
  mentions?: string[]
): Promise<ConversationNote> {
  const resolved = await resolveMentions(orgId, body, mentions)

  const { data, error } = await supabaseAdmin
    .from('conversation_notes')
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      author_id: authorId,
      body,
      mentions: resolved,
    })
    .select(NOTE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(`Failed to create note: ${error?.message || 'unknown'}`)
  }
  return data as unknown as ConversationNote
}

/**
 * Registra a transferência de uma conversa como NOTA interna (trilha de auditoria)
 * e devolve o membro-alvo para o chamador.
 *
 * IMPORTANTE — separação de responsabilidades: aqui só gravamos a nota
 * "Transferido para X: <motivo>" e o alvo é mencionado. A REATRIBUIÇÃO em si
 * (conversations.assigned_to) é responsabilidade da lane de assignment — o
 * integrador liga o resultado desta função ao assignment.service.
 *
 * Retorna null se o membro-alvo não pertence ao org (deixa o chamador responder 404).
 */
export async function createTransferNote(
  orgId: string,
  conversationId: string,
  authorId: string,
  toUserId: string,
  note?: string
): Promise<TransferResult | null> {
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('id', toUserId)
    .eq('org_id', orgId)
    .single()

  if (!target) return null

  const reason = note && note.trim() ? `: ${note.trim()}` : ''
  const body = `Transferido para ${target.name || 'membro'}${reason}`
  const created = await createNote(orgId, conversationId, authorId, body, [toUserId])

  return { note: created, target: { id: target.id, name: target.name } }
}
