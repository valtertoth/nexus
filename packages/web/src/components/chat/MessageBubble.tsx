import { useState, useRef, memo, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Check, CheckCheck, Clock, AlertCircle, RefreshCw, Sparkles, FileText, Download, Play, MapPin, User, Video, X, Mic, Reply } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '@/lib/api'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@nexus/shared'

interface MessageBubbleProps {
  message: Message
  onRetry?: (message: Message) => void
}

const MEDIA_TYPES = new Set(['image', 'video', 'sticker'])

// Memoize to prevent re-rendering ALL bubbles when a new message arrives.
// Only re-renders when this specific message's props change.
export const MessageBubble = memo(function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isContact = message.sender_type === 'contact'
  const isSystem = message.sender_type === 'system'
  const isAiApproved = message.ai_approved === true
  const isMedia = MEDIA_TYPES.has(message.content_type)
  const isSticker = message.content_type === 'sticker'

  const replyToId = message.reply_to_message_id
  const allMessages = useMessageStore((s) => s.messages[message.conversation_id])
  const quotedMessage = useMemo(() => {
    if (!replyToId || !allMessages) return null
    return allMessages.find((m) => m.id === replyToId || m.wa_message_id === replyToId) ?? null
  }, [replyToId, allMessages])

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  const time = message.created_at
    ? format(new Date(message.created_at), 'HH:mm')
    : ''

  // Stickers render without bubble background
  if (isSticker) {
    return (
      <div className={cn('flex mb-2', isContact ? 'justify-start' : 'justify-end')}>
        <div className="max-w-[70%] relative group">
          {quotedMessage && <QuotedReply quoted={quotedMessage} isContact={isContact} isMedia={false} />}
          <MessageContent message={message} isContact={isContact} />
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            <span className="text-xs text-zinc-400">{time}</span>
            {!isContact && <StatusIcon status={message.wa_status} />}
          </div>
        </div>
      </div>
    )
  }

  // Caption text (for media with real captions, not fallback "[Image]" etc.)
  // Strip AI-internal prefixes (🎤 transcription, 📷 analysis) — these are for AI context, not display
  const displayContent = message.content
    ? message.content.split('\n').filter((line) => !line.startsWith('📷 ') && !line.startsWith('🎤 ')).join('\n').trim()
    : ''
  const hasCaption = message.content_type !== 'text' && message.content_type !== 'audio' && displayContent && !displayContent.startsWith('[')

  return (
    <div
      className={cn(
        'flex mb-2',
        isContact ? 'justify-start' : 'justify-end'
      )}
    >
      <div className="max-w-[70%]">
        <div
          className={cn(
            'relative group overflow-hidden',
            // Media messages: no padding on top/sides for edge-to-edge images/video
            isMedia && message.media_url
              ? cn(
                  'rounded-2xl',
                  isContact ? 'bg-zinc-100 rounded-bl-md' : 'bg-zinc-900 rounded-br-md'
                )
              : cn(
                  'px-3.5 py-2 rounded-2xl',
                  isContact
                    ? 'bg-zinc-100 text-zinc-900 rounded-bl-md'
                    : 'bg-zinc-900 text-white rounded-br-md'
                ),
            // Dim pending messages slightly
            message.wa_status === 'pending' && 'opacity-70',
          )}
        >
          {/* Quoted reply context */}
          {quotedMessage && <QuotedReply quoted={quotedMessage} isContact={isContact} isMedia={isMedia} />}

          {/* Content by type */}
          <MessageContent message={message} isContact={isContact} />

          {/* Caption + footer for media */}
          {isMedia && message.media_url ? (
            <div className="px-3 pb-1.5">
              {hasCaption && (
                <p className={cn('text-sm whitespace-pre-wrap break-words mt-1.5', isContact ? 'text-zinc-900' : 'text-white')}>
                  {displayContent}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1 justify-end">
                {isAiApproved && !isContact && (
                  <Sparkles className="w-3 h-3 text-amber-300 opacity-70" />
                )}
                <span className={cn('text-xs', isContact ? 'text-zinc-400' : 'text-zinc-500')}>
                  {time}
                </span>
                {!isContact && <StatusIcon status={message.wa_status} />}
              </div>
            </div>
          ) : (
            <>
              {/* Caption for non-visual media (audio, document) */}
              {hasCaption && (
                <p className="text-sm whitespace-pre-wrap break-words mt-1.5">
                  {displayContent}
                </p>
              )}
              {/* Footer: time + status */}
              <div className="flex items-center gap-1.5 mt-1 justify-end">
                {isAiApproved && !isContact && (
                  <Sparkles className="w-3 h-3 text-amber-300 opacity-70" />
                )}
                <span className={cn('text-xs', isContact ? 'text-zinc-400' : 'text-zinc-500')}>
                  {time}
                </span>
                {!isContact && <StatusIcon status={message.wa_status} />}
              </div>
            </>
          )}
        </div>

        {/* Retry button for failed messages */}
        {message.wa_status === 'failed' && onRetry && (
          <button
            onClick={() => onRetry(message)}
            className="mt-1 text-xs text-red-500 hover:text-red-700 flex items-center gap-1 ml-auto"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  )
}, (prev, next) => {
  // Custom comparison: only re-render when meaningful props change
  return (
    prev.message.id === next.message.id &&
    prev.message.wa_status === next.message.wa_status &&
    prev.message.content === next.message.content &&
    prev.message.media_url === next.message.media_url &&
    prev.message.ai_suggested_response === next.message.ai_suggested_response &&
    prev.message.reply_to_message_id === next.message.reply_to_message_id
  )
})

function QuotedReply({ quoted, isContact, isMedia }: { quoted: Message; isContact: boolean; isMedia: boolean }) {
  const isQuotedContact = quoted.sender_type === 'contact'
  const label = isQuotedContact ? (quoted.content ? '' : 'Contato') : 'Você'
  const previewText = getQuotePreview(quoted)

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg mb-1 cursor-pointer',
        isMedia ? 'mx-2 mt-2' : '',
        isContact
          ? 'bg-zinc-200/60 border-l-2 border-zinc-400'
          : 'bg-zinc-800/60 border-l-2 border-zinc-500',
      )}
      style={{ padding: '6px 8px' }}
    >
      <Reply className={cn('w-3 h-3 mt-0.5 shrink-0 rotate-180', isContact ? 'text-zinc-400' : 'text-zinc-500')} />
      <div className="min-w-0 flex-1">
        {label && (
          <span className={cn('text-[11px] font-medium block', isContact ? 'text-zinc-500' : 'text-zinc-400')}>
            {label}
          </span>
        )}
        <p className={cn('text-xs truncate', isContact ? 'text-zinc-600' : 'text-zinc-400')}>
          {previewText}
        </p>
      </div>
      {quoted.content_type === 'image' && quoted.media_url && (
        <img src={quoted.media_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
      )}
    </div>
  )
}

function getQuotePreview(msg: Message): string {
  if (msg.content_type === 'image') return msg.content?.split('\n')[0] || 'Imagem'
  if (msg.content_type === 'audio') return 'Audio'
  if (msg.content_type === 'video') return 'Video'
  if (msg.content_type === 'document') return msg.media_filename || 'Documento'
  if (msg.content_type === 'sticker') return 'Sticker'
  if (msg.content_type === 'location') return 'Localizacao'
  if (msg.content_type === 'contact') return 'Contato'
  const text = msg.content || ''
  return text.length > 120 ? text.slice(0, 120) + '...' : text
}

function StatusIcon({ status }: { status?: string | null }) {
  return (
    <span className="flex">
      {status === 'pending' ? (
        <Clock className="w-3.5 h-3.5 text-zinc-400" />
      ) : status === 'failed' ? (
        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
      ) : status === 'read' ? (
        <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
      ) : status === 'delivered' ? (
        <CheckCheck className="w-3.5 h-3.5 text-zinc-400" />
      ) : (
        <Check className="w-3.5 h-3.5 text-zinc-400" />
      )}
    </span>
  )
}

function MessageContent({ message, isContact }: { message: Message; isContact: boolean }) {
  const type = message.content_type

  // Text
  if (type === 'text') {
    return (
      <p className="text-sm whitespace-pre-wrap break-words">
        {message.content}
      </p>
    )
  }

  // Image
  if (type === 'image') {
    if (message.media_url) {
      return <ImageContent url={message.media_url} isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
    }
    return <MediaPlaceholder icon="image" label="Imagem" isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
  }

  // Audio — WhatsApp-style custom player (transcription is internal, used by AI context only)
  if (type === 'audio') {
    if (message.media_url) {
      return (
        <AudioPlayer
          url={message.media_url}
          mimeType={message.media_mime_type}
          isContact={isContact}
        />
      )
    }
    return <MediaPlaceholder icon="audio" label="Áudio" isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
  }

  // Video
  if (type === 'video') {
    if (message.media_url) {
      return <VideoContent url={message.media_url} mimeType={message.media_mime_type} isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
    }
    return <MediaPlaceholder icon="video" label="Vídeo" isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
  }

  // Sticker — no bubble, just the image
  if (type === 'sticker') {
    if (message.media_url) {
      return (
        <img
          src={message.media_url}
          alt="Sticker"
          className="w-36 h-36 object-contain"
          loading="lazy"
        />
      )
    }
    return <MediaPlaceholder icon="sticker" label="Sticker" isContact={isContact} messageId={message.id} waMediaId={message.wa_media_id} />
  }

  // Document
  if (type === 'document') {
    const hasUrl = !!message.media_url
    return (
      <div className="flex items-center gap-3 py-1">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          isContact ? 'bg-zinc-200' : 'bg-zinc-700'
        )}>
          <FileText className={cn('w-5 h-5', isContact ? 'text-zinc-500' : 'text-zinc-300')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {message.media_filename || 'Documento'}
          </p>
          {message.media_size ? (
            <p className={cn('text-xs', isContact ? 'text-zinc-400' : 'text-zinc-400')}>
              {formatFileSize(message.media_size)}
            </p>
          ) : !hasUrl && message.media_filename ? (
            <p className="text-xs text-amber-500">
              Arquivo indisponível
            </p>
          ) : null}
        </div>
        {hasUrl ? (
          <a
            href={message.media_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'p-1.5 rounded-lg transition-colors shrink-0',
              isContact ? 'hover:bg-zinc-200' : 'hover:bg-zinc-700'
            )}
          >
            <Download className={cn('w-4 h-4', isContact ? 'text-zinc-500' : 'text-zinc-300')} />
          </a>
        ) : message.wa_media_id ? (
          <ReloadMediaButton messageId={message.id} isContact={isContact} compact />
        ) : null}
      </div>
    )
  }

  // Location
  if (type === 'location') {
    return (
      <div className="flex items-center gap-2 py-1">
        <MapPin className={cn('w-5 h-5 shrink-0', isContact ? 'text-red-500' : 'text-red-400')} />
        <span className="text-sm">{message.content || 'Localização compartilhada'}</span>
      </div>
    )
  }

  // Contact
  if (type === 'contact') {
    return (
      <div className="flex items-center gap-2 py-1">
        <User className={cn('w-5 h-5 shrink-0', isContact ? 'text-zinc-500' : 'text-zinc-300')} />
        <span className="text-sm">{message.content || 'Contato compartilhado'}</span>
      </div>
    )
  }

  // Fallback for any other type (poll, list, interactive, template, etc.)
  return (
    <p className="text-sm whitespace-pre-wrap break-words italic opacity-80">
      {message.content || `[${type}]`}
    </p>
  )
}

// ─── Image with lightbox ────────────────────────────────────────────
function ImageContent({ url, isContact, messageId, waMediaId }: { url: string; isContact: boolean; messageId: string; waMediaId?: string | null }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  // A broken/expired signed URL must never leave a broken <img> in the thread.
  if (errored) {
    return <MediaPlaceholder icon="image" label="Imagem" isContact={isContact} messageId={messageId} waMediaId={waMediaId} />
  }

  return (
    <>
      {/* Reserve a min height while loading so the thread doesn't jump (no layout shift). */}
      <div className={cn('relative w-full', !loaded && 'min-h-[140px]', isContact ? 'bg-zinc-200/50' : 'bg-zinc-800/50')}>
        <img
          src={url}
          alt="Imagem"
          className="max-w-full max-h-72 w-full object-cover cursor-pointer block"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          onClick={() => setLightboxOpen(true)}
        />
      </div>

      {/* Lightbox overlay */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-50"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={url}
            alt="Imagem"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ─── Video with error fallback + reserved space ─────────────────────
function VideoContent({ url, mimeType, isContact, messageId, waMediaId }: { url: string; mimeType?: string | null; isContact: boolean; messageId: string; waMediaId?: string | null }) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return <MediaPlaceholder icon="video" label="Vídeo" isContact={isContact} messageId={messageId} waMediaId={waMediaId} />
  }

  return (
    <video
      controls
      preload="metadata"
      className="max-w-full max-h-72 w-full min-h-[140px] bg-black block"
      onError={() => setErrored(true)}
    >
      <source src={url} type={mimeType || 'video/mp4'} />
    </video>
  )
}

// ─── Re-download media from WhatsApp (media_url null but wa_media_id present) ──
function ReloadMediaButton({ messageId, isContact, compact }: { messageId: string; isContact: boolean; compact?: boolean }) {
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      // Bulk endpoint re-downloads all pending media for the org; a realtime UPDATE
      // then fills media_url on this bubble automatically.
      const res = await api.post<{ retried: number; success: number; failed: number }>('/api/messages/retry-media')
      if (res.success > 0) {
        toast.success('Mídia recarregada.')
      } else if (res.retried === 0) {
        toast.info('Nenhuma mídia pendente para recarregar.')
      } else {
        toast.error('Não foi possível recarregar a mídia.')
      }
    } catch {
      toast.error('Falha ao recarregar mídia.')
    } finally {
      setLoading(false)
    }
    // messageId kept for a future per-message endpoint; harmless here.
    void messageId
  }, [loading, messageId])

  if (compact) {
    return (
      <button
        onClick={reload}
        disabled={loading}
        className={cn('p-1.5 rounded-lg transition-colors shrink-0', isContact ? 'hover:bg-zinc-200' : 'hover:bg-zinc-700')}
        aria-label="Recarregar mídia"
      >
        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin', isContact ? 'text-zinc-500' : 'text-zinc-300')} />
      </button>
    )
  }

  return (
    <button
      onClick={reload}
      disabled={loading}
      className={cn(
        'mt-1 inline-flex items-center gap-1 text-xs transition-colors',
        isContact ? 'text-zinc-500 hover:text-zinc-700' : 'text-zinc-300 hover:text-white'
      )}
    >
      <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
      {loading ? 'Recarregando…' : 'Recarregar mídia'}
    </button>
  )
}

// ─── WhatsApp-style audio player ────────────────────────────────────
// Memoized audio player — throttles progress updates to ~4fps instead of 60fps
const AudioPlayer = memo(function AudioPlayer({ url, mimeType, isContact }: { url: string; mimeType?: string | null; isContact: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const lastProgressUpdateRef = useRef(0)

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-w-[240px] max-w-[300px] flex items-center gap-3 py-1">
      {/* Play/Pause button */}
      <button
        onClick={() => {
          const audio = audioElRef.current
          if (!audio) return
          if (isPlaying) {
            audio.pause()
          } else {
            audio.play()
          }
        }}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
          isContact
            ? 'bg-zinc-300 text-zinc-700 hover:bg-zinc-400'
            : 'bg-zinc-600 text-white hover:bg-zinc-500'
        )}
      >
        {isPlaying ? (
          <div className="flex items-center gap-0.5">
            <div className={cn('w-0.5 h-3 rounded-full', isContact ? 'bg-zinc-700' : 'bg-white')} />
            <div className={cn('w-0.5 h-3 rounded-full', isContact ? 'bg-zinc-700' : 'bg-white')} />
          </div>
        ) : (
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        )}
      </button>

      {/* Waveform-like progress bar */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="relative h-2 cursor-pointer"
          onClick={(e) => {
            const audio = audioElRef.current
            if (!audio || !duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audio.currentTime = pct * duration
          }}
        >
          <div className={cn('absolute inset-0 rounded-full', isContact ? 'bg-zinc-300' : 'bg-zinc-600')} />
          <div
            className={cn('absolute left-0 top-0 h-full rounded-full transition-all', isContact ? 'bg-zinc-500' : 'bg-zinc-300')}
            style={{ width: `${progress}%` }}
          />
          {/* Seek handle */}
          <div
            className={cn('absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-sm transition-all',
              isContact ? 'bg-zinc-600' : 'bg-white'
            )}
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <span className={cn('text-xs tabular-nums', isContact ? 'text-zinc-400' : 'text-zinc-400')}>
          {isPlaying ? formatTime((progress / 100) * duration) : formatTime(duration)}
        </span>
      </div>

      {/* Mic icon */}
      <Mic className={cn('w-3.5 h-3.5 shrink-0', isContact ? 'text-zinc-400' : 'text-zinc-500')} />

      {/* Hidden audio element */}
      <audio
        ref={audioElRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          // Throttle to ~4 updates/sec (250ms) instead of 60+/sec
          const now = Date.now()
          if (now - lastProgressUpdateRef.current < 250) return
          lastProgressUpdateRef.current = now
          const audio = e.currentTarget
          if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setProgress(0) }}
      >
        <source src={url} type={mimeType || 'audio/ogg'} />
      </audio>
    </div>
  )
})

// ─── Placeholders ───────────────────────────────────────────────────
function MediaPlaceholder({ icon, label, isContact, messageId, waMediaId }: { icon: string; label: string; isContact: boolean; messageId?: string; waMediaId?: string | null }) {
  const IconComponent = icon === 'audio' ? Mic
    : icon === 'video' ? Video
    : icon === 'sticker' ? Sparkles
    : Play

  // Recoverable when we still hold the WhatsApp media id — offer a manual re-download.
  const canReload = !!(messageId && waMediaId)

  return (
    <div className={cn(
      'flex items-center gap-2 py-2 px-1 rounded-lg',
      isContact ? 'text-zinc-500' : 'text-zinc-400'
    )}>
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
        isContact ? 'bg-zinc-200' : 'bg-zinc-700'
      )}>
        <IconComponent className="w-4 h-4" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm">{label}</span>
        {canReload ? (
          <ReloadMediaButton messageId={messageId!} isContact={isContact} />
        ) : (
          <span className="text-xs opacity-60">Midia indisponivel</span>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
