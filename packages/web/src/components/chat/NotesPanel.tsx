import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { StickyNote, Send, Loader2, X, AtSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuthContext } from '@/components/auth/AuthProvider'

// ── Types (espelham o payload do servidor: routes/notes.ts) ──────────────────

interface NoteAuthor {
  id: string
  name: string | null
  avatar_url: string | null
}

interface Note {
  id: string
  author_id: string | null
  body: string
  mentions: string[]
  created_at: string
  author?: NoteAuthor | null
}

interface Member {
  id: string
  name: string
}

interface NotesPanelProps {
  conversationId: string
  open?: boolean
  onClose?: () => void
  /** Quando true, renderiza sem header/borda próprios (o pai desenha a barra de abas). */
  embedded?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

/** Renderiza o corpo destacando tokens @menção. */
function renderBody(body: string) {
  const parts = body.split(/(@[^\s@]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={i} className="font-medium text-emerald-700 bg-emerald-50 rounded px-0.5">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function NotesPanel({ conversationId, open, onClose, embedded }: NotesPanelProps) {
  const { profile } = useAuthContext()
  const [notes, setNotes] = useState<Note[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Autocomplete de @menção
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isVisible = embedded || open

  // Carrega notas + membros ao abrir / trocar de conversa
  useEffect(() => {
    if (!isVisible) return
    let cancelled = false
    setLoading(true)
    setNotes([])
    Promise.all([
      api.get<{ notes: Note[] }>(`/api/notes/${conversationId}`).catch(() => ({ notes: [] })),
      api.get<{ members: Member[] }>('/api/team/members').catch(() => ({ members: [] })),
    ]).then(([notesRes, membersRes]) => {
      if (cancelled) return
      setNotes(notesRes.notes || [])
      setMembers(membersRes.members || [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [conversationId, isVisible])

  // Auto-scroll para a nota mais recente
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [notes])

  // Sugestões filtradas pelo texto após o '@'
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => m.name && m.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members])

  // Detecta se o cursor está digitando uma @menção
  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    const el = textareaRef.current
    const caret = el ? el.selectionStart : value.length
    const upToCaret = value.slice(0, caret)
    const match = upToCaret.match(/@([\p{L}0-9]*)$/u)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }, [])

  // Insere o membro escolhido no lugar do @parcial
  const applyMention = useCallback((member: Member) => {
    const el = textareaRef.current
    const caret = el ? el.selectionStart : input.length
    const before = input.slice(0, caret).replace(/@([\p{L}0-9]*)$/u, `@${member.name} `)
    const after = input.slice(caret)
    const next = before + after
    setInput(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = before.length
      el?.setSelectionRange(pos, pos)
    })
  }, [input])

  const handleSubmit = useCallback(async () => {
    const body = input.trim()
    if (!body || saving) return
    setSaving(true)
    try {
      const res = await api.post<{ note: Note }>(`/api/notes/${conversationId}`, { body })
      setNotes((prev) => [...prev, res.note])
      setInput('')
      setMentionQuery(null)
    } catch (err) {
      console.error('[NotesPanel] Failed to save note:', err)
    } finally {
      setSaving(false)
    }
  }, [input, saving, conversationId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Navegação no dropdown de menção
      if (mentionQuery !== null && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionIndex((i) => (i + 1) % suggestions.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          applyMention(suggestions[mentionIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionQuery(null)
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [mentionQuery, suggestions, mentionIndex, applyMention, handleSubmit]
  )

  if (!embedded && !open) return null

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white',
        !embedded && 'w-[380px] shrink-0 border-l border-zinc-200 animate-in slide-in-from-right-4 duration-200'
      )}
    >
      {/* Header — oculto quando embedded (o pai desenha a barra de abas) */}
      {!embedded && (
        <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-zinc-600" />
            <span className="text-sm font-medium text-zinc-900">Notas internas</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
              aria-label="Fechar painel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Lista de notas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <StickyNote className="w-8 h-8 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500 mb-1">Nenhuma nota ainda</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Registre observações para o time sobre esta conversa. Use @ para mencionar um colega.
              O cliente nunca vê estas notas.
            </p>
          </div>
        ) : (
          notes.map((note) => {
            const isMine = note.author_id && note.author_id === profile?.id
            const authorName = isMine ? 'Você' : note.author?.name || 'Membro'
            return (
              <div key={note.id} className="flex gap-2.5">
                <div className="shrink-0">
                  {note.author?.avatar_url ? (
                    <img
                      src={note.author.avatar_url}
                      alt={authorName}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-semibold text-zinc-600">
                      {initials(note.author?.name)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-zinc-800 truncate">{authorName}</span>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {formatDistanceToNow(new Date(note.created_at), { locale: ptBR, addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-zinc-700 whitespace-pre-wrap break-words bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    {renderBody(note.body)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer com autocomplete de @menção */}
      <div className="border-t border-zinc-200 p-3">
        <div className="relative">
          {mentionQuery !== null && suggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden z-10">
              {suggestions.map((m, i) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applyMention(m)
                  }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors',
                    i === mentionIndex ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center text-[9px] font-semibold text-zinc-600">
                    {initials(m.name)}
                  </div>
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva uma nota interna… use @ para mencionar"
              rows={1}
              className="min-h-9 max-h-24 resize-none text-sm py-2"
              disabled={saving}
            />
            <Button
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={handleSubmit}
              disabled={!input.trim() || saving}
              aria-label="Adicionar nota"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-400">
          <AtSign className="w-3 h-3" />
          Menções e notas ficam só entre o time — nunca vão ao cliente.
        </p>
      </div>
    </div>
  )
}
