import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

/**
 * Transcribe audio buffer using OpenAI Whisper.
 *
 * Accepts any common audio format (ogg, mp3, mp4, wav, webm, etc.)
 * Returns the transcribed text, or null if transcription fails.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  language: string = 'pt'
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Transcription] OPENAI_API_KEY not configured, skipping')
    return null
  }

  // Normalize mime type (remove codec params like "; codecs=opus")
  const baseMime = mimeType.split(';')[0].trim()

  if (!SUPPORTED_FORMATS.has(baseMime)) {
    console.warn(`[Transcription] Unsupported format: ${mimeType}`)
    return null
  }

  // Determine file extension for Whisper (it needs a filename with extension)
  const ext = getExtFromMime(baseMime)

  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: baseMime })
    const file = new File([blob], `audio.${ext}`, { type: baseMime })

    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language,
      response_format: 'text',
    })

    const text = typeof result === 'string' ? result.trim() : (result as unknown as { text: string }).text?.trim()

    if (!text) {
      console.log('[Transcription] Empty transcription result')
      return null
    }

    console.log(`[Transcription] Success: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`)
    return text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Transcription] Whisper API failed:', msg)
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
