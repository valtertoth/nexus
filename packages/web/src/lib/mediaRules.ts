// ---------------------------------------------------------------------------
// Media rules — single source of truth for what the WhatsApp Cloud API accepts.
// Used by the composer (pre-upload validation) and reusable by drag-drop paths.
//
// Meta Cloud API media size limits (v22.0):
//   image 5MB · video 16MB · audio 16MB · document 100MB · sticker 500KB
// Accepted MIME per category: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
// ---------------------------------------------------------------------------

export type MediaCategory = 'image' | 'video' | 'audio' | 'document'

export const MEDIA_SIZE_LIMITS: Record<MediaCategory, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

// MIME types Meta accepts natively for a *visual/audio* message. Anything an
// image/video/audio file that isn't in these sets is still sendable — we just
// route it as a `document` so it always goes through instead of being rejected.
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png'])
const VIDEO_MIMES = new Set(['video/mp4', 'video/3gpp'])
const AUDIO_MIMES = new Set([
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/opus',
])

function baseMime(type: string): string {
  return (type || '').split(';')[0].trim().toLowerCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface ResolvedMedia {
  /** The content type to send as. Falls back to 'document' for anything Meta won't take natively. */
  category: MediaCategory
  /** Non-null when the file must be rejected (e.g. too large, empty). */
  error: string | null
  /** True when we downgraded an image/video/audio to 'document' so it still sends. */
  downgraded: boolean
}

/**
 * Decide how a file should be sent and whether it passes Meta's limits.
 * Never throws — returns a friendly, user-facing `error` string when invalid.
 */
export function resolveMedia(file: File): ResolvedMedia {
  const mime = baseMime(file.type)

  let category: MediaCategory
  let downgraded = false

  if (mime.startsWith('image/')) {
    category = IMAGE_MIMES.has(mime) ? 'image' : 'document'
    downgraded = category === 'document'
  } else if (mime.startsWith('video/')) {
    category = VIDEO_MIMES.has(mime) ? 'video' : 'document'
    downgraded = category === 'document'
  } else if (mime.startsWith('audio/')) {
    category = AUDIO_MIMES.has(mime) ? 'audio' : 'document'
    downgraded = category === 'document'
  } else {
    category = 'document'
  }

  if (file.size === 0) {
    return { category, downgraded, error: 'Arquivo vazio — nada para enviar.' }
  }

  const limit = MEDIA_SIZE_LIMITS[category]
  if (file.size > limit) {
    const kind =
      category === 'image' ? 'imagem'
      : category === 'video' ? 'vídeo'
      : category === 'audio' ? 'áudio'
      : 'documento'
    return {
      category,
      downgraded,
      error: `Arquivo muito grande (${formatBytes(file.size)}). Limite do WhatsApp para ${kind}: ${formatBytes(limit)}.`,
    }
  }

  return { category, downgraded, error: null }
}

/** True when a browser object URL can safely render a thumbnail for this file. */
export function isPreviewable(file: File): 'image' | 'video' | null {
  const mime = baseMime(file.type)
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return null
}
