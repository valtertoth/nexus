import { withTimeout, CircuitBreaker } from '../lib/resilience.js'

const whisperCircuitBreaker = new CircuitBreaker('Whisper Transcription', {
  threshold: 3,
  cooldownMs: 60_000,
})

const SUPPORTED_FORMATS = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/webm',
  'audio/flac',
  'audio/aac',
  'audio/amr',
])

// Whisper-compatible transcription via Groq (free tier, uses GROQ_API_KEY)
// Falls back to null if no key configured — audio messages just won't have text preview
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  language: string = 'pt'
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return null
  }

  const baseMime = mimeType.split(';')[0].trim()

  if (!SUPPORTED_FORMATS.has(baseMime)) {
    console.warn(`[Transcription] Unsupported format: ${mimeType}`)
    return null
  }

  const ext = getExtFromMime(baseMime)

  try {
    return await whisperCircuitBreaker.execute(async () => {
      const blob = new Blob([new Uint8Array(buffer)], { type: baseMime })
      const formData = new FormData()
      formData.append('file', blob, `audio.${ext}`)
      formData.append('model', 'whisper-large-v3')
      formData.append('language', language)
      formData.append('response_format', 'json')

      const response = await withTimeout(
        fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        }),
        30_000,
        'Whisper transcription'
      )

      if (!response.ok) {
        throw new Error(`Groq API ${response.status}: ${await response.text()}`)
      }

      const data = await response.json() as { text?: string }
      const text = data.text?.trim()

      if (!text) {
        console.log('[Transcription] Empty transcription result')
        return null
      }

      console.log(`[Transcription] Success: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`)
      return text
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Transcription] API failed:', msg)
    return null
  }
}

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
  }
  return map[mime] || 'ogg'
}
