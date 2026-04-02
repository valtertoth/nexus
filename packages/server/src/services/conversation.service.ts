import { supabaseAdmin } from '../lib/supabase.js'
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

  // Create new
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

  if (error) throw new Error(`Failed to create contact: ${error.message}`)
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
      .select()
      .single()

    if (reopenErr) throw new Error(`Failed to reopen conversation: ${reopenErr.message}`)
    return reopened as Conversation
  }

  // 3. Create brand new conversation — auto-assign if org has few users
  let assignedTo: string | null = null

  // Auto-assign: if org has 1–3 users, assign to the first one
  const { data: orgUsers } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .limit(4)

  if (orgUsers && orgUsers.length > 0 && orgUsers.length <= 3) {
    assignedTo = orgUsers[0].id
  }

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

  if (error) throw new Error(`Failed to create conversation: ${error.message}`)
  return created as Conversation
}

/**
 * Update conversation with latest message info.
 */
export async function updateConversationWithMessage(
  conversationId: string,
  preview: string,
  incrementUnread: boolean
): Promise<void> {
  const now = new Date()
  const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000) // +24h

  const updateData: Record<string, unknown> = {
    last_message_preview: preview,
    last_message_at: now.toISOString(),
    wa_service_window_expires_at: windowExpires.toISOString(),
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
 * Save a message to the database.
 */
export async function saveMessage(message: MessageInsert): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(message)
    .select('id')
    .single()

  if (error) throw new Error(`Failed to save message: ${error.message}`)
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
