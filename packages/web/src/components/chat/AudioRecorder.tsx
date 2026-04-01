import { useState, useRef, useCallback } from 'react'
import { Square, Play, Pause, Trash2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AudioRecorderProps {
  onSend: (file: File) => void
  onCancel: () => void
  disabled?: boolean
}

export function AudioRecorder({ onSend, onCancel, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview'>('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const startedRef = useRef(false)

  const cleanup = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (timerRef.current) clearInterval(timerRef.current)
    setAudioUrl(null)
    setState('idle')
    setDuration(0)
    blobRef.current = null
    onCancel()
  }, [audioUrl, onCancel])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // WhatsApp Cloud API accepts OGG/Opus, MP4, MP3 — NOT WebM
      // Chrome/Firefox: ogg, Safari: mp4, fallback: webm (needs server conversion)
      const preferredMime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm;codecs=opus'

      const mediaRecorder = new MediaRecorder(stream, { mimeType: preferredMime })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const actualMime = mediaRecorder.mimeType || preferredMime
        const blob = new Blob(chunksRef.current, { type: actualMime })
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setState('preview')
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.start()
      setState('recording')
      setDuration(0)
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } catch {
      // Microphone permission denied or unavailable
    }
  }, [])

  // Auto-start recording on mount
  if (!startedRef.current) {
    startedRef.current = true
    startRecording()
  }

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const handleSend = useCallback(() => {
    if (!blobRef.current) return
    const blobType = blobRef.current.type || 'audio/ogg;codecs=opus'
    const ext = blobType.includes('ogg') ? 'ogg' : blobType.includes('mp4') ? 'm4a' : 'webm'
    const file = new File([blobRef.current], `audio_${Date.now()}.${ext}`, { type: blobType })
    onSend(file)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (timerRef.current) clearInterval(timerRef.current)
    setAudioUrl(null)
    setState('idle')
    setDuration(0)
    blobRef.current = null
  }, [onSend, audioUrl])

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
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
        <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayback}
          className="h-8 w-8 text-zinc-600 hover:text-zinc-800"
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="flex-1 h-1 bg-zinc-200 rounded-full">
          <div className="h-full bg-zinc-600 rounded-full" style={{ width: '100%' }} />
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
