# Nexus Data Flow Reference

## Fluxo: Cliente envia mensagem

```
1. Cliente envia msg no WhatsApp
2. Meta Cloud API envia webhook POST para /webhook
3. Server valida assinatura HMAC SHA256
4. Server retorna 200 IMEDIATAMENTE
5. setImmediate() processa em background:
   a. parseWebhookPayload() extrai dados
   b. Upsert contact (by wa_id + org_id)
   c. Upsert conversation (atualiza last_message_at, wa_service_window +24h)
   d. Se tem mídia: media.service.downloadAndStore() → Supabase Storage
   e. INSERT message → Supabase (Realtime notifica frontend)
   f. Se ai_mode != 'off':
      - Busca últimas 10 msgs (contexto)
      - RAG: gera embedding da pergunta
      - RAG: match_knowledge_chunks() no pgvector
      - Monta prompt: system + context + history + question
      - Claude API (generateText)
      - UPDATE message.ai_suggested_response → Supabase (Realtime → AISuggestionBar)
```

## Fluxo: Atendente responde

```
1. Atendente vê sugestão da IA no AISuggestionBar
2. Decide:
   - ✅ Aprovar: POST /api/messages/send {aiApproved: true}
   - ✏️ Editar: cola no composer, modifica, POST {aiEdited: true, aiOriginal: ...}
   - ✖ Descartar: remove sugestão localmente
   - 🤖 Auto: countdown 5s → POST automático
3. Server:
   a. Verifica janela de 24h (wa_service_window_expires_at)
   b. whatsapp.service.sendTextMessage()
   c. INSERT message com metadata de IA
   d. Supabase Realtime → Frontend: bubble enviada
```

## Fluxo: Upload de documento (RAG)

```
1. Atendente faz upload no Knowledge Manager
2. Frontend:
   a. Upload para Supabase Storage bucket 'knowledge/{orgId}/{sectorId}/'
   b. INSERT knowledge_documents (status: 'pending')
   c. POST /api/knowledge/process {documentId}
3. Server (background):
   a. UPDATE status = 'processing'
   b. Download do arquivo do Storage
   c. Extração de texto (pdf-parse / mammoth / xlsx)
   d. chunkText() → chunks de ~500 tokens
   e. generateEmbeddings() em batch (max 20/chamada)
   f. INSERT knowledge_chunks com embeddings
   g. UPDATE status = 'ready', chunks_count = N
   h. Supabase Realtime → Frontend: status atualiza ao vivo
```

## Fluxo: Realtime subscriptions

```
Frontend mantém estas subscriptions ativas:

1. conversations (org_id = meu org):
   - INSERT → adiciona na lista
   - UPDATE → reordena por last_message_at

2. messages (conversation_id = conversa selecionada):
   - INSERT → nova bubble no chat
   - UPDATE (ai_suggested_response) → AISuggestionBar aparece

3. knowledge_documents (org_id = meu org):
   - UPDATE (status) → atualiza badge de processamento

4. Presence channel:
   - Heartbeat a cada 30s
   - Lista de quem está online
```

## Janela de serviço do WhatsApp (24h)

```
- Quando CLIENTE inicia conversa → janela de 24h abre → mensagens GRÁTIS
- Cada nova msg do cliente RESETA o timer de 24h
- Se expirou: só pode enviar templates aprovados (pagos)
- Campo: conversations.wa_service_window_expires_at
- Frontend mostra countdown visual: "Expira em 4h32min"
- Se expirado: composer desabilitado, mostra "Enviar template"
```
