import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.replace(/\n/g, ' ').trim()
  if (!cleaned) return new Array(EMBEDDING_DIMENSIONS).fill(0)

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data[0].embedding
}

/**
 * Generate embeddings for multiple texts in batch (max 20 per call to OpenAI).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const cleaned = texts.map((t) => t.replace(/\n/g, ' ').trim())
  const results: number[][] = []

  // OpenAI recommends max ~2048 inputs, we batch at 20 for safety
  const BATCH_SIZE = 20
  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE)

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    for (const item of response.data) {
      results.push(item.embedding)
    }
  }

  return results
}

/**
 * Smart text chunking that respects sentence boundaries.
 *
 * Strategy: split by paragraphs → lines → sentences.
 * Never cuts in the middle of a sentence.
 * Overlap ensures context continuity between chunks.
 */
export function chunkText(
  text: string,
  maxTokens = 500,
  overlap = 50
): string[] {
  if (!text.trim()) return []

  // Rough token estimate: 1 token ≈ 4 chars for Portuguese
  const CHARS_PER_TOKEN = 4
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const overlapChars = overlap * CHARS_PER_TOKEN

  // Split into segments (paragraphs → lines → sentences)
  const segments = splitIntoSegments(text)

  const chunks: string[] = []
  let currentChunk = ''

  for (const segment of segments) {
    // If single segment is larger than max, split it further
    if (segment.length > maxChars) {
      // Flush current chunk
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
        currentChunk = getOverlapText(currentChunk, overlapChars)
      }
      // Split large segment by sentences
      const sentences = segment.match(/[^.!?]+[.!?]+\s*/g) || [segment]
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChars && currentChunk.trim()) {
          chunks.push(currentChunk.trim())
          currentChunk = getOverlapText(currentChunk, overlapChars)
        }
        currentChunk += sentence
      }
      continue
    }

    if ((currentChunk + '\n' + segment).length > maxChars && currentChunk.trim()) {
      chunks.push(currentChunk.trim())
      currentChunk = getOverlapText(currentChunk, overlapChars)
    }
    currentChunk += (currentChunk ? '\n' : '') + segment
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

/**
 * Split text into logical segments: paragraphs first, then lines.
 */
function splitIntoSegments(text: string): string[] {
  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n{2,}/)
  const segments: string[] = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // If paragraph has multiple lines, keep them together if short
    const lines = trimmed.split('\n').filter((l) => l.trim())
    if (lines.length === 1) {
      segments.push(trimmed)
    } else {
      // Keep paragraph as one segment
      segments.push(lines.join('\n'))
    }
  }

  return segments
}

/**
 * Extract overlap text from the end of a chunk.
 */
function getOverlapText(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || !text) return ''
  const tail = text.slice(-overlapChars)
  // Try to start at a sentence or word boundary
  const sentenceStart = tail.indexOf('. ')
  if (sentenceStart !== -1 && sentenceStart < tail.length * 0.5) {
    return tail.slice(sentenceStart + 2)
  }
  const wordStart = tail.indexOf(' ')
  if (wordStart !== -1) {
    return tail.slice(wordStart + 1)
  }
  return tail
}

/**
 * Rough token count estimate for Portuguese text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
