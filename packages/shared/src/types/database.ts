// ============================================
// NEXUS DATABASE TYPES
// Espelham o schema SQL do Supabase
// ============================================

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'enterprise'
  wa_phone_number_id: string | null
  wa_business_account_id: string | null
  wa_webhook_secret: string | null
  settings: Record<string, unknown>
  max_agents: number
  ai_monthly_token_limit: number
  ai_tokens_used_this_month: number
  created_at: string
  updated_at: string
}

export interface OrganizationInsert {
  name: string
  slug: string
  plan?: Organization['plan']
  wa_phone_number_id?: string
  wa_business_account_id?: string
  wa_webhook_secret?: string
  settings?: Record<string, unknown>
  max_agents?: number
  ai_monthly_token_limit?: number
}

export interface OrganizationUpdate extends Partial<OrganizationInsert> {
  ai_tokens_used_this_month?: number
}

export type AiMode = 'automatic' | 'dictated' | 'off'
export type UserRole = 'owner' | 'admin' | 'agent'

export interface User {
  id: string
  org_id: string
  email: string
  name: string
  avatar_url: string | null
  role: UserRole
  sector_id: string | null
  ai_mode: AiMode
  is_online: boolean
  last_seen_at: string | null
  created_at: string
}

export interface UserInsert {
  id: string // matches auth.users.id
  org_id: string
  email: string
  name: string
  avatar_url?: string
  role?: UserRole
  sector_id?: string
  ai_mode?: AiMode
}

export interface UserUpdate {
  name?: string
  avatar_url?: string
  role?: UserRole
  sector_id?: string
  ai_mode?: AiMode
  is_online?: boolean
  last_seen_at?: string
}

export interface Sector {
  id: string
  org_id: string
  name: string
  description: string | null
  ai_model: string
  system_prompt: string
  ai_temperature: number
  ai_max_tokens: number
  color: string
  created_at: string
}

export interface SectorInsert {
  org_id: string
  name: string
  description?: string
  ai_model?: string
  system_prompt: string
  ai_temperature?: number
  ai_max_tokens?: number
  color?: string
}

export interface SectorUpdate extends Partial<Omit<SectorInsert, 'org_id'>> {}

export interface Contact {
  id: string
  org_id: string
  wa_id: string
  name: string | null
  phone: string | null
  email: string | null
  avatar_url: string | null
  tags: string[]
  metadata: Record<string, unknown>
  first_message_at: string | null
  last_message_at: string | null
  created_at: string
}

export interface ContactInsert {
  org_id: string
  wa_id: string
  name?: string
  phone?: string
  email?: string
  avatar_url?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  first_message_at?: string
  last_message_at?: string
}

export interface ContactUpdate extends Partial<Omit<ContactInsert, 'org_id' | 'wa_id'>> {}

export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'closed'
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Conversation {
  id: string
  org_id: string
  contact_id: string
  sector_id: string | null
  assigned_to: string | null
  status: ConversationStatus
  priority: ConversationPriority
  subject: string | null
  unread_count: number
  last_message_preview: string | null
  last_message_at: string | null
  resolved_at: string | null
  wa_service_window_expires_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Joined fields (from queries)
  contact?: Contact
  sector?: Sector
  assigned_user?: User
}

export interface ConversationInsert {
  org_id: string
  contact_id: string
  sector_id?: string
  assigned_to?: string
  status?: ConversationStatus
  priority?: ConversationPriority
  subject?: string
}

export interface ConversationUpdate {
  sector_id?: string
  assigned_to?: string
  status?: ConversationStatus
  priority?: ConversationPriority
  subject?: string
  unread_count?: number
  last_message_preview?: string
  last_message_at?: string
  resolved_at?: string
  wa_service_window_expires_at?: string
}

export type SenderType = 'contact' | 'agent' | 'ai' | 'system'
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact' | 'sticker' | 'interactive' | 'template'
export type WaMessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface AiSuggestionSource {
  doc_name: string
  chunk_id: string
  similarity: number
  page?: number
}

export interface Message {
  id: string
  conversation_id: string
  org_id: string
  sender_type: SenderType
  sender_id: string | null
  content: string | null
  content_type: ContentType
  media_url: string | null
  media_original_url: string | null
  media_mime_type: string | null
  media_filename: string | null
  media_size: number | null
  wa_message_id: string | null
  wa_status: WaMessageStatus
  wa_timestamp: string | null
  ai_suggested_response: string | null
  ai_suggestion_sources: AiSuggestionSource[] | null
  ai_approved: boolean | null
  ai_edited: boolean
  ai_original_suggestion: string | null
  ai_model_used: string | null
  ai_tokens_used: number | null
  ai_latency_ms: number | null
  is_internal_note: boolean
  reply_to_message_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MessageInsert {
  conversation_id: string
  org_id: string
  sender_type: SenderType
  sender_id?: string
  content?: string
  content_type?: ContentType
  media_url?: string
  media_original_url?: string
  media_mime_type?: string
  media_filename?: string
  media_size?: number
  wa_message_id?: string
  wa_status?: WaMessageStatus
  wa_timestamp?: string
  ai_suggested_response?: string
  ai_suggestion_sources?: AiSuggestionSource[]
  ai_approved?: boolean
  ai_edited?: boolean
  ai_original_suggestion?: string
  ai_model_used?: string
  ai_tokens_used?: number
  ai_latency_ms?: number
  is_internal_note?: boolean
  reply_to_message_id?: string
  metadata?: Record<string, unknown>
}

export interface MessageUpdate {
  content?: string
  wa_status?: WaMessageStatus
  ai_suggested_response?: string
  ai_suggestion_sources?: AiSuggestionSource[]
  ai_approved?: boolean
  ai_edited?: boolean
  ai_original_suggestion?: string
  ai_model_used?: string
  ai_tokens_used?: number
  ai_latency_ms?: number
}

export type KnowledgeDocumentStatus = 'pending' | 'processing' | 'ready' | 'error'

export interface KnowledgeDocument {
  id: string
  org_id: string
  sector_id: string
  filename: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  status: KnowledgeDocumentStatus
  chunks_count: number
  error_message: string | null
  uploaded_by: string | null
  processed_at: string | null
  created_at: string
}

export interface KnowledgeDocumentInsert {
  org_id: string
  sector_id: string
  filename: string
  file_path: string
  file_size?: number
  mime_type?: string
  uploaded_by?: string
}

export interface KnowledgeChunk {
  id: string
  document_id: string
  org_id: string
  sector_id: string
  content: string
  metadata: Record<string, unknown>
  embedding: number[] | null
  token_count: number | null
  created_at: string
}

export interface KnowledgeChunkInsert {
  document_id: string
  org_id: string
  sector_id: string
  content: string
  metadata?: Record<string, unknown>
  embedding?: number[]
  token_count?: number
}

export interface AiUsageLog {
  id: string
  org_id: string
  user_id: string | null
  conversation_id: string | null
  model: string
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  latency_ms: number | null
  was_approved: boolean | null
  was_edited: boolean | null
  created_at: string
}

export interface AiUsageLogInsert {
  org_id: string
  user_id?: string
  conversation_id?: string
  model: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  latency_ms?: number
  was_approved?: boolean
  was_edited?: boolean
}
