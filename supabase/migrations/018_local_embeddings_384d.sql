-- ============================================
-- 018: Switch from OpenAI 1536d to local multilingual-e5-small 384d embeddings
-- Removes external API dependency for embeddings.
-- knowledge_chunks has 0 rows — no data to migrate.
-- ============================================

-- Drop existing HNSW index
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Change vector dimensions
ALTER TABLE knowledge_chunks
  ALTER COLUMN embedding TYPE VECTOR(384)
  USING NULL;

-- Recreate HNSW index with new dimensions
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Must drop old function first — return type changed with new vector dimension
DROP FUNCTION IF EXISTS match_knowledge_chunks(VECTOR, UUID, UUID, FLOAT, INT);

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding VECTOR(384),
  p_org_id UUID,
  p_sector_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.org_id = p_org_id
    AND kd.sector_id = p_sector_id
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Maintain security lockdown from migration 017
REVOKE ALL ON FUNCTION match_knowledge_chunks(VECTOR, UUID, UUID, FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(VECTOR, UUID, UUID, FLOAT, INT) TO service_role;
