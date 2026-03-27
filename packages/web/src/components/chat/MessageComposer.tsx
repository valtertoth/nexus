import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Paperclip, Send, Loader2 } from 'lucide-react'

interface MessageComposerProps {
  onSend: (content: string) => void
  disabled?: boolean
  sending?: boolean
  placeholder?: string
  initialValue?: string
}

export function MessageComposer({
  onSend,
  disabled = false,
  sending = false,
  placeholder = 'Digite uma mensagem...',
  initialValue = '',
}: MessageComposerProps) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    if (!value.trim() || disabled || sending) return
    onSend(value.trim())
    setValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, sending, onSend])

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
    <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-200 bg-white">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-zinc-400 hover:text-zinc-600 h-9 w-9"
        disabled={disabled}
      >
        <Paperclip className="w-4 h-4" />
      </Button>

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

      <Button
        size="icon"
        className="shrink-0 h-9 w-9"
        onClick={handleSend}
        disabled={!value.trim() || disabled || sending}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </div>
  )
}
