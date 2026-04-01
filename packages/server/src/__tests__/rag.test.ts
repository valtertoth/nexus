import { describe, it, expect, vi } from 'vitest'

// Mock supabase and OpenAI before imports
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({ data: [] })),
      })),
    })),
  },
}))

vi.mock('openai', () => {
  return {
    default: class {
      embeddings = {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        }),
      }
    },
  }
})

import { chunkText, estimateTokens } from '../services/embedding.service.js'

// --- Text Chunking ---

describe('chunkText', () => {
  it('should return empty array for empty text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('should return single chunk for short text', () => {
    const text = 'Este é um texto curto.'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(text)
  })

  it('should split long text into multiple chunks', () => {
    // Create text longer than maxTokens * 4 chars
    const paragraph = 'Este é um parágrafo de teste com conteúdo suficiente. '
    const text = paragraph.repeat(50) // ~2700 chars > 500 tokens * 4 = 2000 chars
    const chunks = chunkText(text, 500, 50)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('should respect paragraph boundaries', () => {
    const text = [
      'Primeiro parágrafo com bastante texto para ocupar espaço.',
      '',
      'Segundo parágrafo separado por linha em branco.',
      '',
      'Terceiro parágrafo final.',
    ].join('\n')

    const chunks = chunkText(text, 1000) // High limit to keep all in one
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Primeiro')
    expect(chunks[0]).toContain('Segundo')
    expect(chunks[0]).toContain('Terceiro')
  })

  it('should split by paragraphs when text exceeds max', () => {
    const para1 = 'A '.repeat(300) // 600 chars
    const para2 = 'B '.repeat(300) // 600 chars
    const para3 = 'C '.repeat(300) // 600 chars
    const text = `${para1}\n\n${para2}\n\n${para3}`

    const chunks = chunkText(text, 200, 0) // maxTokens=200 → 800 chars
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('should handle text with only newlines', () => {
    const text = 'Linha 1\nLinha 2\nLinha 3'
    const chunks = chunkText(text, 1000)
    expect(chunks).toHaveLength(1)
  })

  it('should not produce empty chunks', () => {
    const text = 'Texto com espaços.\n\n\n\n\nMais texto aqui.'
    const chunks = chunkText(text)
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0)
    }
  })

  it('should handle overlap between chunks', () => {
    const sentence = 'Esta é uma frase de teste com palavras suficientes. '
    const text = sentence.repeat(40) // ~2120 chars
    const chunksWithOverlap = chunkText(text, 200, 50)
    const chunksNoOverlap = chunkText(text, 200, 0)

    // With overlap, we may have same or more chunks
    expect(chunksWithOverlap.length).toBeGreaterThanOrEqual(chunksNoOverlap.length)
  })
})

// --- Token Estimation ---

describe('estimateTokens', () => {
  it('should estimate tokens based on char count', () => {
    // 1 token ≈ 4 chars
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('a')).toBe(1) // ceil(1/4) = 1
  })

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('should handle Portuguese text', () => {
    const text = 'Olá, este é um texto em português brasileiro com acentuação.'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBe(Math.ceil(text.length / 4))
  })
})

// --- Embedding dimensions (mocked) ---

describe('generateEmbedding (mocked)', () => {
  it('should return 1536-dimensional embedding', async () => {
    const { generateEmbedding } = await import('../services/embedding.service.js')
    const embedding = await generateEmbedding('Teste de embedding')
    expect(embedding).toHaveLength(1536)
  })

  it('should return zero vector for empty text', async () => {
    const { generateEmbedding } = await import('../services/embedding.service.js')
    const embedding = await generateEmbedding('')
    expect(embedding).toHaveLength(1536)
    expect(embedding.every((v) => v === 0)).toBe(true)
  })
})

describe('generateEmbeddings (mocked)', () => {
  it('should return empty array for empty input', async () => {
    const { generateEmbeddings } = await import('../services/embedding.service.js')
    const result = await generateEmbeddings([])
    expect(result).toEqual([])
  })
})
