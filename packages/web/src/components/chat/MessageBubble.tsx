import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Check, CheckCheck, Clock, AlertCircle, RefreshCw, Sparkles, FileText, Download, Play, MapPin, User, Video, X, Mic } from 'lucide-react'
import { format } from 'date-fns'
import type { Message } from '@nexus/shared'

interface MessageBubbleProps {
  message: Message
  onRetry?: (message: Message) => void
}

const MEDIA_TYPES = new Set(['image', 'video', 'sticker'])

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isContact = message.sender_type === 'contact'
  const isSystem = message.sender_type === 'system'
  const isAiApproved = message.ai_approved === true
  const isMedia = MEDIA_TYPES.has(message.content_type)
  const isSticker = message.content_type === 'sticker'

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
                <span className={cn('text-xs', isContact ? 'text-zinc-400' : 'text-zinc-400')}>
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
                <span className={cn('text-xs', isContact ? 'text-zinc-400' : 'text-zinc-400')}>
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
      return <ImageContent url={message.media_url} />
    }
    return <MediaPlaceholder icon="image" label="Imagem" isContact={isContact} />
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
    return <MediaPlaceholder icon="audio" label="Áudio" isContact={isContact} />
  }

  // Video
  if (type === 'video') {
    if (message.media_url) {
      return (
        <video
          controls
          preload="metadata"
          className="max-w-full max-h-72 w-full"
        >
          <source src={message.media_url} type={message.media_mime_type || 'video/mp4'} />
        </video>
      )
    }
    return <MediaPlaceholder icon="video" label="Vídeo" isContact={isContact} />
  }

  // Sticker — no bubble, just the image
  if (type === 'sticker') {
    if (message.media_url) {
      return (
        <img
          src={message.media_url}
          alt="Sticker"
          className="w-36 h-36 object-contain"
        />
      )
    }
    return <MediaPlaceholder icon="sticker" label="Sticker" isContact={isContact} />
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
function ImageContent({ url }: { url: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <>
      <img
        src={url}
        alt="Imagem"
        className="max-w-full max-h-72 w-full object-cover cursor-pointer"
        loading="lazy"
        onClick={() => setLightboxOpen(true)}
      />

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

// ─── WhatsApp-style audio player ────────────────────────────────────
function AudioPlayer({ url, mimeType, isContact }: { url: string; mimeType?: string | null; isContact: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

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
}

// ─── Placeholders ───────────────────────────────────────────────────
function MediaPlaceholder({ icon, label, isContact }: { icon: string; label: string; isContact: boolean }) {
  const IconComponent = icon === 'audio' ? Mic
    : icon === 'video' ? Video
    : icon === 'sticker' ? Sparkles
    : Play

  return (
    <div className={cn(
      'flex items-center gap-2 py-2 px-1 rounded-lg',
      isContact ? 'text-zinc-500' : 'text-zinc-400'
    )}>
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center',
        isContact ? 'bg-zinc-200' : 'bg-zinc-700'
      )}>
        <IconComponent className="w-4 h-4" />
      </div>
      <span className="text-sm">{label}</span>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
