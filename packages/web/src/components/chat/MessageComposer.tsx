import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Paperclip, Send, Loader2, Mic, X, FileText } from 'lucide-react'
import { AudioRecorder } from './AudioRecorder'

interface MessageComposerProps {
  onSend: (content: string) => void
  onSendMedia?: (file: File, contentType: 'image' | 'audio' | 'video' | 'document', caption?: string) => Promise<void>
  disabled?: boolean
  sending?: boolean
  placeholder?: string
  initialValue?: string
}

function detectContentType(file: File): 'image' | 'video' | 'audio' | 'document' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync when initialValue changes (e.g. AI edit)
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue)
      // Focus textarea when AI suggestion is edited
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [initialValue])

  const handleSendMedia = useCallback(async () => {
    if (!pendingFile || disabled || sending) return
    await onSendMedia?.(pendingFile, detectContentType(pendingFile), value.trim() || undefined)
    setPendingFile(null)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [pendingFile, value, disabled, sending, onSendMedia])

  const handleSend = useCallback(() => {
    if (disabled || sending) return
    // If there's a pending file, send media with caption instead of text
    if (pendingFile) {
      handleSendMedia()
      return
    }
    if (!value.trim()) return
    onSend(value.trim())
    setValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, sending, onSend, pendingFile, handleSendMedia])

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

  return (
    <div className="bg-white">
      {/* Audio Recorder */}
      {isRecording && (
        <AudioRecorder
          onSend={async (file) => {
            await onSendMedia?.(file, 'audio')
            setIsRecording(false)
          }}
          onCancel={() => setIsRecording(false)}
          disabled={sending}
        />
      )}

      {/* File Preview Bar */}
      {pendingFile && (
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 border-t border-zinc-100">
          {pendingFile.type.startsWith('image/') ? (
            <img
              src={URL.createObjectURL(pendingFile)}
              alt=""
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-zinc-200 flex items-center justify-center">
              <FileText className="w-5 h-5 text-zinc-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{pendingFile.name}</p>
            <p className="text-xs text-zinc-400">{formatFileSize(pendingFile.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPendingFile(null)}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-600"
            aria-label="Remover arquivo"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleSendMedia}
            disabled={sending}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
          </Button>
        </div>
      )}

      {/* Composer Row */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-200">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-zinc-400 hover:text-zinc-600 h-9 w-9"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar arquivo"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setPendingFile(file)
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
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          className="min-h-9 max-h-36 resize-none text-sm py-2"
        />

        {/* Show Mic button when no text, Send button when there is text */}
        {!value.trim() && !pendingFile ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-zinc-400 hover:text-zinc-600"
            onClick={() => setIsRecording(true)}
            disabled={disabled || sending || isRecording}
            aria-label="Gravar audio"
          >
            <Mic className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={(!value.trim() && !pendingFile) || disabled || sending}
            aria-label="Enviar mensagem"
          >
            {sending ? (
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
