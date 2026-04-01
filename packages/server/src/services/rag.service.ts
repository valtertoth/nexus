import { supabaseAdmin } from '../lib/supabase.js'
import { generateEmbedding, generateEmbeddings, chunkText, estimateTokens } from './embedding.service.js'
import type { AiRagSource } from '@nexus/shared'

interface MatchedChunk {
  id: string
  document_id: string
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

/**
 * Search for relevant knowledge chunks using pgvector similarity.
 */
export async function searchRelevantChunks(
  query: string,
  sectorId: string,
  orgId: string,
  threshold = 0.7,
  limit = 5
): Promise<AiRagSource[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query)

  // Call the match_knowledge_chunks RPC
  const { data, error } = await supabaseAdmin.rpc('match_knowledge_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    p_sector_id: sectorId,
    p_org_id: orgId,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('[RAG] Search error:', error.message)
    return []
  }

  const chunks = (data || []) as MatchedChunk[]

  // Enrich with document names
  const docIds = [...new Set(chunks.map((c) => c.document_id))]
  const { data: docs } = await supabaseAdmin
    .from('knowledge_documents')
    .select('id, filename')
    .in('id', docIds)

  const docMap = new Map((docs || []).map((d: { id: string; filename: string }) => [d.id, d.filename]))

  return chunks.map((chunk) => ({
    documentName: docMap.get(chunk.document_id) || 'Documento',
    chunkId: chunk.id,
    similarity: chunk.similarity,
    page: (chunk.metadata?.page as number) || undefined,
    content: chunk.content,
  }))
}

/**
 * Ingest a document: extract text, chunk, embed, store.
 */
export async function ingestDocument(
  documentId: string,
  orgId: string
): Promise<void> {
  try {
    // 1. Update status to processing
    await supabaseAdmin
      .from('knowledge_documents')
      .update({ status: 'processing' })
      .eq('id', documentId)

    // 2. Get document info
    const { data: doc, error: docError } = await supabaseAdmin
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      throw new Error(`Document not found: ${documentId}`)
    }

    // 3. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('knowledge')
      .download(doc.file_path)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`)
    }

    // 4. Extract text based on mime type
    const buffer = Buffer.from(await fileData.arrayBuffer())
    const text = await extractText(buffer, doc.mime_type || '', doc.filename)

    if (!text.trim()) {
      throw new Error('No text could be extracted from the document')
    }

    // 5. Chunk the text
    const chunks = chunkText(text, 500, 50)
    console.log(`[RAG] Document ${doc.filename}: ${chunks.length} chunks`)

    // 6. Generate embeddings in batch
    const embeddings = await generateEmbeddings(chunks)

    // 7. Insert chunks into knowledge_chunks
    const chunkInserts = chunks.map((content, i) => ({
      document_id: documentId,
      org_id: orgId,
      sector_id: doc.sector_id,
      content,
      metadata: { page: Math.floor(i / 3) + 1, index: i },
      embedding: JSON.stringify(embeddings[i]),
      token_count: estimateTokens(content),
    }))

    // Insert in batches of 50
    const BATCH_SIZE = 50
    for (let i = 0; i < chunkInserts.length; i += BATCH_SIZE) {
      const batch = chunkInserts.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabaseAdmin
        .from('knowledge_chunks')
        .insert(batch)

      if (insertError) {
        throw new Error(`Failed to insert chunks: ${insertError.message}`)
      }
    }

    // 8. Update document status
    await supabaseAdmin
      .from('knowledge_documents')
      .update({
        status: 'ready',
        chunks_count: chunks.length,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    console.log(`[RAG] Document ${doc.filename} ingested: ${chunks.length} chunks`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[RAG] Ingestion failed for ${documentId}:`, message)

    await supabaseAdmin
      .from('knowledge_documents')
      .update({
        status: 'error',
        error_message: message,
      })
      .eq('id', documentId)
  }
}

/**
 * Extract text from a file buffer based on MIME type.
 */
async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()

  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    return result.text
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // XLSX / XLS
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const texts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      texts.push(`--- ${sheetName} ---\n${csv}`)
    }
    return texts.join('\n\n')
  }

  // CSV
  if (mimeType === 'text/csv' || ext === 'csv') {
    return buffer.toString('utf-8')
  }

  // Plain text / Markdown
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    ext === 'txt' ||
    ext === 'md'
  ) {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported file type: ${mimeType} (${filename})`)
}
