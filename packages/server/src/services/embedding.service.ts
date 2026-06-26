const MODEL_NAME = 'Xenova/multilingual-e5-small'
const EMBEDDING_DIMENSIONS = 384

type Embedder = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>

let embedder: Embedder | null = null
let loading: Promise<Embedder> | null = null

async function getEmbedder(): Promise<Embedder> {
  if (embedder) return embedder
  if (loading) return loading

  loading = (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    const model = await pipeline('feature-extraction', MODEL_NAME, { dtype: 'q8' })
    console.log(`[Embedding] Model ${MODEL_NAME} loaded (${EMBEDDING_DIMENSIONS}d)`)
    return model as unknown as Embedder
  })()

  embedder = await loading
  loading = null
  return embedder
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.replace(/\n/g, ' ').trim()
  if (!cleaned) return new Array(EMBEDDING_DIMENSIONS).fill(0)

  const model = await getEmbedder()
  const result = await model(`query: ${cleaned}`, { pooling: 'mean', normalize: true })
  return Array.from(result.data as Float32Array)
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const model = await getEmbedder()
  const results: number[][] = []

  for (const text of texts) {
    const cleaned = text.replace(/\n/g, ' ').trim()
    if (!cleaned) {
      results.push(new Array(EMBEDDING_DIMENSIONS).fill(0))
      continue
    }
    const result = await model(`passage: ${cleaned}`, { pooling: 'mean', normalize: true })
    results.push(Array.from(result.data as Float32Array))
  }

  return results
}

export function chunkText(
  text: string,
  maxTokens = 500,
  overlap = 50
): string[] {
  if (!text.trim()) return []

  const CHARS_PER_TOKEN = 4
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const overlapChars = overlap * CHARS_PER_TOKEN

  const segments = splitIntoSegments(text)

  const chunks: string[] = []
  let currentChunk = ''

  for (const segment of segments) {
    if (segment.length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
        currentChunk = getOverlapText(currentChunk, overlapChars)
      }
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

function splitIntoSegments(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/)
  const segments: string[] = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n').filter((l) => l.trim())
    if (lines.length === 1) {
      segments.push(trimmed)
    } else {
      segments.push(lines.join('\n'))
    }
  }

  return segments
}

function getOverlapText(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || !text) return ''
  const tail = text.slice(-overlapChars)
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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
