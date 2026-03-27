# Nexus Database Schema Reference

## Tabelas e campos completos

### organizations
- id: UUID PK
- name: TEXT NOT NULL
- slug: TEXT UNIQUE NOT NULL
- plan: TEXT ('starter' | 'pro' | 'enterprise')
- wa_phone_number_id: TEXT
- wa_business_account_id: TEXT
- wa_access_token_encrypted: BYTEA (pgcrypto)
- wa_webhook_secret: TEXT
- settings: JSONB
- max_agents: INTEGER (default 3)
- ai_monthly_token_limit: INTEGER (default 500000)
- ai_tokens_used_this_month: INTEGER (default 0)
- created_at, updated_at: TIMESTAMPTZ

### users
- id: UUID PK (references auth.users)
- org_id: UUID FK organizations
- email: TEXT NOT NULL
- name: TEXT NOT NULL
- avatar_url: TEXT
- role: TEXT ('owner' | 'admin' | 'agent')
- sector_id: UUID FK sectors
- ai_mode: TEXT ('automatic' | 'dictated' | 'off') default 'dictated'
- is_online: BOOLEAN
- last_seen_at: TIMESTAMPTZ
- created_at: TIMESTAMPTZ

### sectors
- id: UUID PK
- org_id: UUID FK organizations
- name: TEXT NOT NULL
- description: TEXT
- ai_model: TEXT (default 'claude-sonnet-4-20250514')
- system_prompt: TEXT NOT NULL
- ai_temperature: NUMERIC (default 0.3)
- ai_max_tokens: INTEGER (default 1024)
- color: TEXT (hex, default '#6366f1')
- created_at: TIMESTAMPTZ

### contacts
- id: UUID PK
- org_id: UUID FK organizations
- wa_id: TEXT NOT NULL (número WhatsApp)
- name, phone, email, avatar_url: TEXT
- tags: TEXT[]
- metadata: JSONB
- first_message_at, last_message_at: TIMESTAMPTZ
- UNIQUE(org_id, wa_id)

### conversations
- id: UUID PK
- org_id: UUID FK organizations
- contact_id: UUID FK contacts
- sector_id: UUID FK sectors
- assigned_to: UUID FK users
- status: TEXT ('open' | 'pending' | 'resolved' | 'closed')
- priority: TEXT ('low' | 'normal' | 'high' | 'urgent')
- subject: TEXT
- unread_count: INTEGER
- last_message_preview: TEXT
- last_message_at: TIMESTAMPTZ
- wa_service_window_expires_at: TIMESTAMPTZ
- metadata: JSONB

### messages
- id: UUID PK
- conversation_id: UUID FK conversations
- org_id: UUID NOT NULL
- sender_type: TEXT ('contact' | 'agent' | 'ai' | 'system')
- sender_id: UUID
- content: TEXT
- content_type: TEXT ('text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact' | 'sticker' | 'interactive' | 'template')
- media_url: TEXT (URL local Supabase Storage)
- media_original_url: TEXT (URL Meta, expira em ~3 dias)
- media_mime_type, media_filename: TEXT
- media_size: INTEGER
- wa_message_id: TEXT
- wa_status: TEXT ('sent' | 'delivered' | 'read' | 'failed')
- wa_timestamp: TIMESTAMPTZ
- **Campos de IA:**
  - ai_suggested_response: TEXT
  - ai_suggestion_sources: JSONB [{doc_name, chunk_id, similarity, page}]
  - ai_approved: BOOLEAN
  - ai_edited: BOOLEAN
  - ai_original_suggestion: TEXT
  - ai_model_used: TEXT
  - ai_tokens_used: INTEGER
  - ai_latency_ms: INTEGER
- is_internal_note: BOOLEAN
- reply_to_message_id: UUID
- metadata: JSONB

### knowledge_documents
- id: UUID PK
- org_id: UUID FK organizations
- sector_id: UUID FK sectors
- filename, file_path, mime_type: TEXT
- file_size: INTEGER
- status: TEXT ('pending' | 'processing' | 'ready' | 'error')
- chunks_count: INTEGER
- error_message: TEXT
- uploaded_by: UUID FK users
- processed_at, created_at: TIMESTAMPTZ

### knowledge_chunks
- id: UUID PK
- document_id: UUID FK knowledge_documents
- org_id, sector_id: UUID
- content: TEXT NOT NULL
- metadata: JSONB
- embedding: VECTOR(1536) com índice HNSW
- token_count: INTEGER

### ai_usage_logs
- id: UUID PK
- org_id, user_id, conversation_id: UUID
- model: TEXT
- prompt_tokens, completion_tokens, total_tokens: INTEGER
- latency_ms: INTEGER
- was_approved, was_edited: BOOLEAN

## Função RPC principal
```sql
match_knowledge_chunks(
  query_embedding VECTOR(1536),
  p_sector_id UUID,
  p_org_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
) → TABLE (id, document_id, content, metadata, similarity)
```

## RLS Helper
```sql
get_user_org_id() → UUID
-- Retorna org_id do usuário autenticado via auth.uid()
```

## Storage Buckets
- `media` — mídias das mensagens (org_id/ como prefixo)
- `knowledge` — documentos da base (org_id/sector_id/ como prefixo)
