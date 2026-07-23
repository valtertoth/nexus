import { supabaseAdmin } from '../lib/supabase.js'
import { getMediaUrl } from './whatsapp.service.js'
import { withTimeout } from '../lib/resilience.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Supabase Storage standard upload limit)

/**
 * Single end-to-end deadline for the whole media pipeline (metadata + download
 * + upload). It is deliberately larger than every internal step timeout so the
 * pipeline never fails before its own steps do. The caller MUST NOT wrap this in
 * a shorter external timeout — doing so would reject while this abort-aware
 * pipeline keeps the underlying download running.
 */
export const MEDIA_PIPELINE_TIMEOUT_MS = 60_000

/**
 * Downloads media from WhatsApp Cloud API and stores it in Supabase Storage.
 * This is critical because Meta URLs expire in ~3 days.
 *
 * A single 60s deadline governs the whole pipeline. An AbortController is
 * threaded end-to-end so that when the deadline is hit the underlying download
 * fetch is actually aborted (not left running consuming memory).
 *
 * Flow:
 * 1. Get temporary URL from Meta Graph API
 * 2. Check file size before downloading
 * 3. Download the binary file
 * 4. Upload to Supabase Storage bucket 'media'
 * 5. Return permanent signed URL
 */
export async function downloadAndStore(
  mediaId: string,
  accessToken: string,
  orgId: string,
  conversationId: string
): Promise<{
  localUrl: string
  mimeType: string
  fileSize: number
  filename: string
  buffer: Buffer
}> {
  const controller = new AbortController()
  return withTimeout(
    runMediaPipeline(mediaId, accessToken, orgId, conversationId, controller.signal),
    MEDIA_PIPELINE_TIMEOUT_MS,
    `media pipeline ${mediaId}`,
    controller
  )
}

async function runMediaPipeline(
  mediaId: string,
  accessToken: string,
  orgId: string,
  conversationId: string,
  signal: AbortSignal
): Promise<{
  localUrl: string
  mimeType: string
  fileSize: number
  filename: string
  buffer: Buffer
}> {
  // 1. Get temporary URL + metadata from Meta
  const mediaInfo = await getMediaUrl(accessToken, mediaId)

  // 2. Check file size before downloading (Meta provides file_size in metadata)
  if (mediaInfo.file_size && mediaInfo.file_size > MAX_FILE_SIZE) {
    console.warn(
      `[Media] File too large: ${(mediaInfo.file_size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB). mediaId=${mediaId}`
    )
    throw new Error(
      `Arquivo muito grande (${(mediaInfo.file_size / 1024 / 1024).toFixed(1)}MB). Limite: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    )
  }

  // 3. Download the file — the shared signal aborts the fetch when the pipeline
  // deadline fires, so a hung download stops consuming memory.
  const response = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  // Double-check size after download (in case Meta metadata was missing)
  if (buffer.length > MAX_FILE_SIZE) {
    console.warn(
      `[Media] Downloaded file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. mediaId=${mediaId}`
    )
    throw new Error(
      `Arquivo muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Limite: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    )
  }

  // 4. Determine filename from mime type
  const ext = getExtensionFromMime(mediaInfo.mime_type)
  const filename = `${mediaId}.${ext}`
  const storagePath = `${orgId}/${conversationId}/${filename}`

  // 5. Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(storagePath, buffer, {
      contentType: mediaInfo.mime_type,
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { data: signedData } = await supabaseAdmin.storage
    .from('media')
    .createSignedUrl(storagePath, 31536000)

  const localUrl = signedData?.signedUrl || storagePath

  return {
    localUrl,
    mimeType: mediaInfo.mime_type,
    fileSize: mediaInfo.file_size || buffer.length,
    filename,
    buffer,
  }
}

function getExtensionFromMime(mimeType: string): string {
  // Meta frequently returns MIME with codec params (e.g. "audio/ogg; codecs=opus").
  // Normalize to the base type so the lookup doesn't fall through to "bin".
  const base = (mimeType || '').split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'audio/ogg': 'ogg',
    'audio/opus': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'image/sticker': 'webp',
  }
  return map[base] || 'bin'
}
