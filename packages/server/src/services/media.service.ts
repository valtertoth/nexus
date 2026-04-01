import { supabaseAdmin } from '../lib/supabase.js'
import { getMediaUrl } from './whatsapp.service.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Supabase Storage standard upload limit)

/**
 * Downloads media from WhatsApp Cloud API and stores it in Supabase Storage.
 * This is critical because Meta URLs expire in ~3 days.
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

  // 3. Download the file
  const response = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

  // 6. Get signed URL (1 year expiry, since bucket is private)
  const { data: signedData } = await supabaseAdmin.storage
    .from('media')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

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
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/amr': 'amr',
    'audio/aac': 'aac',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'application/vnd.ms-excel': 'xls',
    'image/sticker': 'webp',
  }
  return map[mimeType] || 'bin'
}
