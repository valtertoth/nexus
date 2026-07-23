import { supabaseAdmin } from '../lib/supabase.js'
import { autoAssignConversation } from './assignment.service.js'
import type { Contact, Conversation, MessageInsert } from '@nexus/shared'

/**
 * Find or create a contact by WhatsApp ID.
 */
export async function upsertContact(
  orgId: string,
  waId: string,
  profileName: string,
  waJid?: string
): Promise<Contact> {
  // Try to find existing
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .eq('wa_id', waId)
    .single()

  if (existing) {
    // Build update payload
    const updatePayload: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    }
    if (profileName && existing.name !== profileName) {
      updatePayload.name = profileName
    }
    if (waJid && (existing as Record<string, unknown>).wa_jid !== waJid) {
      updatePayload.wa_jid = waJid
    }
    await supabaseAdmin
      .from('contacts')
      .update(updatePayload)
      .eq('id', existing.id)
    return { ...existing, name: profileName || existing.name } as Contact
  }

  // Create new — handle race condition where another webhook creates the same contact
  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      org_id: orgId,
      wa_id: waId,
      name: profileName,
      phone: waId,
      wa_jid: waJid || `${waId}@s.whatsapp.net`,
      first_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raceWinner } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('org_id', orgId)
        .eq('wa_id', waId)
        .single()
      if (raceWinner) return raceWinner as Contact
    }
    throw new Error(`Failed to create contact: ${error.message}`)
  }
  return created as Contact
}

/**
 * Find active conversation, reopen a resolved one, or create new.
 *
 * Priority:
 * 1. Return existing open/pending conversation
 * 2. Reopen most recent resolved/closed conversation (preserves sector + history)
 * 3. Create brand new conversation (no sector, no assignment)
 */
export async function upsertConversation(
  orgId: string,
  contactId: string
): Promise<Conversation> {
  // 1. Find open/pending conversation
  const { data: active } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .in('status', ['open', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (active) {
    return active as Conversation
  }

  // 2. Find most recent resolved/closed — reopen it
  const { data: resolved } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .in('status', ['resolved', 'closed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (resolved) {
    const { data: reopened, error: reopenErr } = await supabaseAdmin
      .from('conversations')
      .update({
        status: 'open',
        resolved_at: null,
        outcome: null,
        outcome_value: null,
        outcome_reason: null,
        outcome_product: null,
        outcome_at: null,
        outcome_by: null,
      })
      .eq('id', resolved.id)
      .eq('status', resolved.status) // optimistic lock — only reopen if status unchanged
      .select()
      .single()

    if (reopenErr) {
      // Another webhook already reopened this or a different conversation — refetch
      const { data: current } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .in('status', ['open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (current) return current as Conversation
      // If still nothing, fall through to create new
    } else {
      return reopened as Conversation
    }
  }

  // 3. Create brand new conversation. Atribuição é responsabilidade ÚNICA do
  // motor (organizations.assign_mode) via autoAssignConversation abaixo — o
  // bloco naive antigo ("atribui ao 1º usuário se org pequeno") foi removido
  // para o guard .is('assigned_to', null) do motor funcionar.
  const assignedTo: string | null = null

  const { data: created, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      status: 'open',
      assigned_to: assignedTo,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raceWinner } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .in('status', ['open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (raceWinner) return raceWinner as Conversation
    }
    throw new Error(`Failed to create conversation: ${error.message}`)
  }

  // Increment total_conversations on the contact (fire-and-forget)
  supabaseAdmin.rpc('increment_contact_conversations', { p_contact_id: contactId }).then(({ error: rpcErr }) => {
    if (rpcErr) {
      // Fallback: non-atomic increment
      supabaseAdmin
        .from('contacts')
        .select('total_conversations')
        .eq('id', contactId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabaseAdmin
              .from('contacts')
              .update({ total_conversations: (data.total_conversations || 0) + 1 })
              .eq('id', contactId)
              .then(() => {})
          }
        })
    }
  })

  const motorAgent = await autoAssignConversation(orgId, created.id, contactId)
  if (motorAgent) (created as { assigned_to: string | null }).assigned_to = motorAgent

  return created as Conversation
}

/**
 * Update conversation with latest message info.
 *
 * IMPORTANTE: a janela de 24h SÓ é aberta/estendida por mensagem INBOUND do cliente
 * (extendServiceWindow=true). Sends do vendedor (texto/mídia/template) NÃO tocam a
 * janela — só o cliente respondendo abre a janela na Meta. A fonte autoritativa da
 * janela é o conversation.expiration_timestamp dos statuses (applyServiceWindowFromStatus);
 * o +24h aqui é só um palpite otimista até a Meta confirmar.
 */
export async function updateConversationWithMessage(
  conversationId: string,
  preview: string,
  incrementUnread: boolean,
  extendServiceWindow = false
): Promise<void> {
  const now = new Date()

  const updateData: Record<string, unknown> = {
    last_message_preview: preview,
    last_message_at: now.toISOString(),
  }

  if (extendServiceWindow) {
    const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000) // +24h
    updateData.wa_service_window_expires_at = windowExpires.toISOString()
  }

  // Update conversation fields (without unread_count — that's handled atomically)
  await supabaseAdmin
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId)

  // Atomically increment unread_count via RPC (avoids read-then-write race condition).
  // RPC defined in migration 007_production_hardening.sql.
  // Fallback: if the RPC call fails, do a non-atomic read+write.
  if (incrementUnread) {
    const { error: rpcError } = await supabaseAdmin.rpc('increment_unread_count', {
      conv_id: conversationId,
    })

    if (rpcError) {
      // Fallback: non-atomic increment (small race window, better than crashing)
      console.warn('[Conversation] increment_unread_count RPC not available, using fallback:', rpcError.message)
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single()

      await supabaseAdmin
        .from('conversations')
        .update({ unread_count: (conv?.unread_count || 0) + 1 })
        .eq('id', conversationId)
    }
  }
}

/**
 * Persiste a janela de 24h a partir do conversation.expiration_timestamp de um status
 * do webhook — fonte AUTORITATIVA (o valor que a própria Meta calcula). Faz lookup da
 * conversa pelo org + wa_id do contato (recipient_id do status) e grava o expiresAt.
 */
export async function applyServiceWindowFromStatus(
  orgId: string,
  recipientWaId: string,
  expiresAt: string
): Promise<void> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('wa_id', recipientWaId)
    .single()

  if (!contact) return

  // Conversa mais recente desse contato (a que a janela se refere)
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('org_id', orgId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!conv) return

  await supabaseAdmin
    .from('conversations')
    .update({ wa_service_window_expires_at: expiresAt })
    .eq('id', conv.id)
}

/**
 * Save a message to the database.
 */
export async function saveMessage(message: MessageInsert): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(message)
    .select('id')
    .single()

  if (error) {
    // Handle unique constraint violation (duplicate message from crash recovery)
    if (error.code === '23505') {
      console.log('[Message] Duplicate message detected (wa_message_id constraint), skipping')
      const { data: existing } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('wa_message_id', message.wa_message_id ?? '')
        .eq('org_id', message.org_id)
        .single()
      return existing?.id || 'duplicate'
    }
    throw new Error(`Failed to save message: ${error.message}`)
  }
  return data.id as string
}

/**
 * Check if a message with this wa_message_id already exists (deduplication).
 * When orgId is provided, scopes the check to that organization to prevent
 * cross-tenant deduplication collisions.
 */
export async function messageExists(waMessageId: string, orgId?: string): Promise<boolean> {
  let query = supabaseAdmin
    .from('messages')
    .select('id')
    .eq('wa_message_id', waMessageId)

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  const { data } = await query.limit(1).single()
  return !!data
}

/**
 * Get the assigned user's AI mode for a conversation.
 */
export async function getAssignedUserAiMode(
  conversationId: string
): Promise<string | null> {
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('assigned_to')
    .eq('id', conversationId)
    .single()

  if (!conv?.assigned_to) return 'dictated' // default if unassigned

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('ai_mode')
    .eq('id', conv.assigned_to)
    .single()

  return user?.ai_mode || 'dictated'
}
