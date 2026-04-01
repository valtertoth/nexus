import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { ingestDocument } from '../services/rag.service.js'

type AuthVars = { Variables: { userId: string; orgId: string } }

const knowledge = new Hono<AuthVars>()

knowledge.use('*', authMiddleware)
knowledge.use('*', apiRateLimit)

// POST /api/knowledge/process — Trigger document ingestion
knowledge.post('/process', async (c) => {
  const orgId = c.get('orgId')
  const { documentId } = await c.req.json<{ documentId: string }>()

  if (!documentId) {
    return c.json({ error: 'documentId é obrigatório' }, 400)
  }

  // Verify document belongs to org
  const { data: doc } = await supabaseAdmin
    .from('knowledge_documents')
    .select('id')
    .eq('id', documentId)
    .eq('org_id', orgId)
    .single()

  if (!doc) {
    return c.json({ error: 'Documento não encontrado' }, 404)
  }

  // Process in background
  setImmediate(() => {
    ingestDocument(documentId, orgId).catch((err) => {
      console.error('[Knowledge] Ingestion error:', err)
    })
  })

  return c.json({ status: 'processing' }, 202)
})

// GET /api/knowledge/sectors/:sectorId/documents — List documents
knowledge.get('/sectors/:sectorId/documents', async (c) => {
  const orgId = c.get('orgId')
  const sectorId = c.req.param('sectorId')

  const { data: docs, error } = await supabaseAdmin
    .from('knowledge_documents')
    .select('*')
    .eq('org_id', orgId)
    .eq('sector_id', sectorId)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: 'Erro ao buscar documentos' }, 500)
  }

  return c.json({ documents: docs || [] })
})

// DELETE /api/knowledge/documents/:documentId — Delete document + chunks + file
knowledge.delete('/documents/:documentId', async (c) => {
  const orgId = c.get('orgId')
  const documentId = c.req.param('documentId')

  // Get document info for storage path
  const { data: doc } = await supabaseAdmin
    .from('knowledge_documents')
    .select('id, file_path')
    .eq('id', documentId)
    .eq('org_id', orgId)
    .single()

  if (!doc) {
    return c.json({ error: 'Documento não encontrado' }, 404)
  }

  // Delete chunks first (FK constraint)
  await supabaseAdmin
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', documentId)

  // Delete document record
  await supabaseAdmin
    .from('knowledge_documents')
    .delete()
    .eq('id', documentId)

  // Delete file from storage
  if (doc.file_path) {
    await supabaseAdmin.storage
      .from('knowledge')
      .remove([doc.file_path])
  }

  return c.json({ ok: true })
})

// POST /api/knowledge/documents/:documentId/reprocess — Clear chunks and re-ingest
knowledge.post('/documents/:documentId/reprocess', async (c) => {
  const orgId = c.get('orgId')
  const documentId = c.req.param('documentId')

  // Verify document exists and belongs to org
  const { data: doc } = await supabaseAdmin
    .from('knowledge_documents')
    .select('id')
    .eq('id', documentId)
    .eq('org_id', orgId)
    .single()

  if (!doc) {
    return c.json({ error: 'Documento não encontrado' }, 404)
  }

  // Delete old chunks
  await supabaseAdmin
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', documentId)

  // Reset document status
  await supabaseAdmin
    .from('knowledge_documents')
    .update({ status: 'pending', chunks_count: 0, error_message: null })
    .eq('id', documentId)

  // Re-ingest in background
  setImmediate(() => {
    ingestDocument(documentId, orgId).catch((err) => {
      console.error('[Knowledge] Reprocessing error:', err)
    })
  })

  return c.json({ status: 'processing' }, 202)
})

export default knowledge
