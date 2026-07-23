import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Square, Play, Pause, Trash2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AudioRecorderProps {
  onSend: (file: File) => void
  onCancel: () => void
  disabled?: boolean
}

// WhatsApp voice notes can be long, but cap to keep files under the 16MB Meta
// audio limit and avoid runaway recordings.
const MAX_DURATION_SEC = 300 // 5 minutes

export function AudioRecorder({ onSend, onCancel, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview'>('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackPct, setPlaybackPct] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<Blob | null>(null)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const cleanup = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (timerRef.current) clearInterval(timerRef.current)
    stopTracks()
    setAudioUrl(null)
    setState('idle')
    setDuration(0)
    setPlaybackPct(0)
    blobRef.current = null
    onCancel()
  }, [audioUrl, onCancel, stopTracks])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const startRecording = useCallback(async () => {
    // Guard for browsers without MediaRecorder / getUserMedia (older Safari, insecure origin).
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Gravação de áudio não suportada neste navegador.')
      onCancel()
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      // Permission denied, no mic, or hardware busy — tell the user and close cleanly.
      const name = err instanceof DOMException ? err.name : ''
      const msg =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Permissão de microfone negada. Autorize o acesso para gravar áudio.'
          : name === 'NotFoundError'
            ? 'Nenhum microfone encontrado.'
            : 'Não foi possível acessar o microfone.'
      toast.error(msg)
      onCancel()
      return
    }

    streamRef.current = stream

    // WhatsApp Cloud API accepts OGG/Opus, MP4/AAC, MP3 — NOT WebM.
    // Chrome/Firefox: ogg/opus · Safari: mp4 · last-resort: webm (may be rejected by Meta).
    const preferredMime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : ''

    let mediaRecorder: MediaRecorder
    try {
      mediaRecorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream)
    } catch {
      toast.error('Formato de gravação não suportado neste navegador.')
      stopTracks()
      onCancel()
      return
    }

    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = () => {
      stopTracks()
      if (chunksRef.current.length === 0) {
        // Nothing captured (immediate cancel) — bail without a broken preview.
        setState('idle')
        return
      }
      const actualMime = mediaRecorder.mimeType || preferredMime || 'audio/ogg'
      const blob = new Blob(chunksRef.current, { type: actualMime })
      blobRef.current = blob
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setState('preview')
    }

    mediaRecorder.start()
    setState('recording')
    setDuration(0)
    timerRef.current = setInterval(() => {
      setDuration((d) => {
        const nextD = d + 1
        if (nextD >= MAX_DURATION_SEC) {
          // Hit the cap — stop and let the user review/send.
          if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
          if (timerRef.current) clearInterval(timerRef.current)
          toast.info('Tempo máximo de gravação atingido (5 min).')
        }
        return nextD
      })
    }, 1000)
  }, [onCancel, stopTracks])

  // Auto-start on mount (side effect belongs in an effect, not the render body).
  useEffect(() => {
    startRecording()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      stopTracks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = useCallback(() => {
    if (!blobRef.current) return
    const blobType = blobRef.current.type || 'audio/ogg;codecs=opus'
    const ext = blobType.includes('ogg') ? 'ogg' : blobType.includes('mp4') ? 'm4a' : blobType.includes('mpeg') ? 'mp3' : 'webm'
    const file = new File([blobRef.current], `audio_${Date.now()}.${ext}`, { type: blobType })
    onSend(file)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (timerRef.current) clearInterval(timerRef.current)
    setAudioUrl(null)
    setState('idle')
    setDuration(0)
    setPlaybackPct(0)
    blobRef.current = null
  }, [onSend, audioUrl])

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.pause()
    else audio.play().catch(() => setIsPlaying(false))
  }, [isPlaying])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border-t border-red-100">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm font-medium text-red-600 tabular-nums">
          {formatTime(duration)}
        </span>
        <span className="text-xs text-red-400">Gravando...</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={cleanup}
          className="h-8 w-8 text-zinc-400 hover:text-zinc-600"
          aria-label="Cancelar gravacao"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={stopRecording}
          className="h-8 w-8 text-red-500 hover:text-red-600"
          aria-label="Parar gravacao"
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      </div>
    )
  }

  if (state === 'preview' && audioUrl) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 border-t border-zinc-200">
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setPlaybackPct(0) }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget
            if (a.duration && isFinite(a.duration)) setPlaybackPct((a.currentTime / a.duration) * 100)
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayback}
          className="h-8 w-8 text-zinc-600 hover:text-zinc-800"
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="flex-1 h-1 bg-zinc-200 rounded-full overflow-hidden">
          <div className="h-full bg-zinc-600 rounded-full transition-all" style={{ width: `${playbackPct}%` }} />
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">{formatTime(duration)}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={cleanup}
          className="h-8 w-8 text-zinc-400 hover:text-zinc-600"
          aria-label="Descartar audio"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={disabled}
          className="h-8 w-8 text-zinc-900 hover:text-zinc-700"
          aria-label="Enviar audio"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return null
}
