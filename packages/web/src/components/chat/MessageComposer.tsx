import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Paperclip, Send, Loader2, Mic, X, FileText, Play } from 'lucide-react'
import { AudioRecorder } from './AudioRecorder'
import { resolveMedia, isPreviewable, formatBytes, type MediaCategory } from '@/lib/mediaRules'

interface MessageComposerProps {
  onSend: (content: string) => void
  onSendMedia?: (file: File, contentType: 'image' | 'audio' | 'video' | 'document', caption?: string) => Promise<void>
  disabled?: boolean
  sending?: boolean
  placeholder?: string
  initialValue?: string
}

interface PendingItem {
  id: string
  file: File
  category: MediaCategory
  previewUrl: string | null
  previewKind: 'image' | 'video' | null
  downgraded: boolean
}

export function MessageComposer({
  onSend,
  onSendMedia,
  disabled = false,
  sending = false,
  placeholder = 'Digite uma mensagem...',
  initialValue = '',
}: MessageComposerProps) {
  const [value, setValue] = useState(initialValue)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [isRecording, setIsRecording] = useState(false)
  // Batch send progress: [done, total]. total > 0 means a queue is in flight.
  const [queueProgress, setQueueProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isSendingQueue = queueProgress.total > 0

  // Revoke every outstanding object URL on unmount (prevents leaks).
  const pendingRef = useRef<PendingItem[]>([])
  pendingRef.current = pendingItems
  useEffect(() => {
    return () => {
      for (const item of pendingRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
    }
  }, [])

  // Sync when initialValue changes (e.g. AI edit)
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [initialValue])

  // Validate + queue newly-picked files. Rejected files raise a friendly toast.
  const addFiles = useCallback((files: FileList | File[]) => {
    const next: PendingItem[] = []
    for (const file of Array.from(files)) {
      const { category, error, downgraded } = resolveMedia(file)
      if (error) {
        toast.error(error, { description: file.name })
        continue
      }
      const kind = isPreviewable(file)
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        category,
        previewUrl: kind ? URL.createObjectURL(file) : null,
        previewKind: kind,
        downgraded,
      })
    }
    if (next.length > 0) setPendingItems((prev) => [...prev, ...next])
  }, [])

  const removeItem = useCallback((id: string) => {
    setPendingItems((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const handleSendMedia = useCallback(async () => {
    if (pendingItems.length === 0 || disabled || isSendingQueue) return
    if (!onSendMedia) return

    const caption = value.trim() || undefined
    const items = pendingItems

    // Clear the composer immediately so the UI stays responsive while the queue flushes.
    setPendingItems([])
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setQueueProgress({ done: 0, total: items.length })

    for (let i = 0; i < items.length; i++) {
      setQueueProgress({ done: i, total: items.length })
      try {
        // Caption rides only with the first file (WhatsApp-album style).
        await onSendMedia(items[i].file, items[i].category, i === 0 ? caption : undefined)
      } catch {
        // onSendMedia surfaces its own error toast; keep flushing the rest of the queue.
      } finally {
        if (items[i].previewUrl) URL.revokeObjectURL(items[i].previewUrl!)
      }
    }

    setQueueProgress({ done: 0, total: 0 })
  }, [pendingItems, value, disabled, isSendingQueue, onSendMedia])

  const handleSend = useCallback(() => {
    if (disabled || isSendingQueue) return
    if (pendingItems.length > 0) {
      handleSendMedia()
      return
    }
    if (sending) return
    if (!value.trim()) return
    onSend(value.trim())
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, disabled, sending, isSendingQueue, onSend, pendingItems, handleSendMedia])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const maxHeight = 6 * 24 // ~6 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  const hasPending = pendingItems.length > 0

  return (
    <div className="bg-white">
      {/* Audio Recorder */}
      {isRecording && (
        <AudioRecorder
          onSend={async (file) => {
            setIsRecording(false)
            try {
              await onSendMedia?.(file, 'audio')
            } catch {
              /* onSendMedia toasts its own error */
            }
          }}
          onCancel={() => setIsRecording(false)}
          disabled={sending || isSendingQueue}
        />
      )}

      {/* Sending queue progress */}
      {isSendingQueue && (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border-t border-zinc-100">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          <span className="text-sm text-zinc-600">
            Enviando {Math.min(queueProgress.done + 1, queueProgress.total)}/{queueProgress.total}…
          </span>
        </div>
      )}

      {/* File preview strip */}
      {hasPending && !isSendingQueue && (
        <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="relative shrink-0 group"
              >
                {item.previewKind === 'image' && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="w-16 h-16 rounded-lg object-cover border border-zinc-200"
                  />
                ) : item.previewKind === 'video' && item.previewUrl ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-200 bg-black">
                    <video src={item.previewUrl} className="w-full h-full object-cover" preload="metadata" muted />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white/90 fill-current" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-zinc-200 flex flex-col items-center justify-center gap-1 px-1">
                    <FileText className="w-5 h-5 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 truncate max-w-full">
                      {formatBytes(item.file.size)}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow hover:bg-zinc-700"
                  aria-label={`Remover ${item.file.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
                {item.downgraded && (
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-amber-500/90 text-white rounded-b-lg py-px">
                    documento
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-zinc-400 truncate">
              {pendingItems.length === 1
                ? pendingItems[0].file.name
                : `${pendingItems.length} arquivos`}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  pendingItems.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl))
                  setPendingItems([])
                }}
                className="h-7 text-zinc-400 hover:text-zinc-600"
              >
                Cancelar
              </Button>
              <Button size="sm" className="h-7" onClick={handleSendMedia} disabled={disabled}>
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Composer Row */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-200">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-zinc-400 hover:text-zinc-600 h-9 w-9"
          disabled={disabled || isSendingQueue}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar arquivo"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder={hasPending ? 'Adicione uma legenda…' : placeholder}
          disabled={disabled || (sending && !hasPending) || isSendingQueue}
          rows={1}
          className="min-h-9 max-h-36 resize-none text-sm py-2"
        />

        {/* Mic when empty; Send otherwise */}
        {!value.trim() && !hasPending ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-zinc-400 hover:text-zinc-600"
            onClick={() => setIsRecording(true)}
            disabled={disabled || sending || isRecording || isSendingQueue}
            aria-label="Gravar audio"
          >
            <Mic className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={(!value.trim() && !hasPending) || disabled || (sending && !hasPending) || isSendingQueue}
            aria-label="Enviar mensagem"
          >
            {sending || isSendingQueue ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
