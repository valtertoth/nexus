import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Send, RefreshCw, ExternalLink, Check } from 'lucide-react'
import type { Message } from '@nexus/shared'

const PHONE_NUMBER_ID = '570599596140291'
const WABA_ID = '1859328711573674'

interface SimContact {
  name: string
  waId: string
}

const DEFAULT_CONTACTS: SimContact[] = [
  { name: 'João Silva', waId: '5519988887777' },
  { name: 'Maria Fernandes', waId: '5511987654321' },
  { name: 'Carlos Mendes', waId: '5521912345678' },
  { name: 'Ana Costa', waId: '5541999887766' },
]

let msgCounter = Date.now()

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function StatusTick({ status }: { status: string }) {
  if (status === 'read') return <span className="text-[#53BDEB]">✓✓</span>
  if (status === 'delivered') return <span className="text-zinc-400">✓✓</span>
  return <span className="text-zinc-400">✓</span>
}

export default function Simulator() {
  const [contact, setContact] = useState<SimContact>(DEFAULT_CONTACTS[0])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPhone, setCustomPhone] = useState('')
  const [showCustomForm, setShowCustomForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const lookupConversation = useCallback(async (waId: string): Promise<string | null> => {
    const { data: ct } = await supabase
      .from('contacts')
      .select('id')
      .eq('wa_id', waId)
      .maybeSingle()

    if (!ct) return null

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', ct.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return conv?.id ?? null
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .eq('is_internal_note', false)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) setMessages(data as Message[])
  }, [])

  // Load existing conversation when contact changes
  useEffect(() => {
    setConversationId(null)
    setMessages([])

    lookupConversation(contact.waId).then(id => {
      if (id) {
        setConversationId(id)
        loadMessages(id)
      }
    })
  }, [contact.waId, lookupConversation, loadMessages])

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`sim:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          if (msg.is_internal_note) return
          setMessages(prev =>
            prev.find(m => m.id === msg.id) ? prev : [...prev, msg]
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          setMessages(prev =>
            prev.map(m => m.id === updated.id ? updated : m)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    inputRef.current?.focus()

    const msgId = `wamid.sim${++msgCounter}`

    try {
      await fetch('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [{
            id: WABA_ID,
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15556338690',
                  phone_number_id: PHONE_NUMBER_ID,
                },
                contacts: [{ profile: { name: contact.name }, wa_id: contact.waId }],
                messages: [{
                  from: contact.waId,
                  id: msgId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: text },
                  type: 'text',
                }],
              },
              field: 'messages',
            }],
          }],
        }),
      })

      // If no conversation yet, poll briefly for it to be created
      if (!conversationId) {
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 300))
          const id = await lookupConversation(contact.waId)
          if (id) {
            setConversationId(id)
            await loadMessages(id)
            break
          }
        }
      }
    } finally {
      setSending(false)
    }
  }

  const resetConversation = () => {
    setConversationId(null)
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const addCustomContact = () => {
    const name = customName.trim()
    const raw = customPhone.trim().replace(/\D/g, '')
    if (!name || !raw) return

    const newContact: SimContact = { name, waId: raw }
    setContact(newContact)
    setCustomName('')
    setCustomPhone('')
    setShowCustomForm(false)
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: '#111b21' }}>
      {/* Sidebar */}
      <div className="w-80 flex flex-col border-r shrink-0" style={{ borderColor: '#2a3942', backgroundColor: '#111b21' }}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 shrink-0" style={{ backgroundColor: '#202c33' }}>
          <span className="text-white font-semibold text-sm tracking-wide">WhatsApp</span>
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-2 py-0.5 rounded-full">
            Simulador
          </span>
        </div>

        {/* Contacts */}
        <div className="flex-1 overflow-y-auto">
          {DEFAULT_CONTACTS.map(c => (
            <button
              key={c.waId}
              onClick={() => setContact(c)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b',
                contact.waId === c.waId
                  ? 'bg-[#2a3942]'
                  : 'hover:bg-[#182229]'
              )}
              style={{ borderColor: '#2a3942' }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: '#6b7280', color: '#fff' }}>
                {c.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{c.name}</p>
                <p className="text-xs truncate" style={{ color: '#8696a0' }}>+{c.waId}</p>
              </div>
            </button>
          ))}

          {/* Custom contact */}
          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className="w-full px-4 py-3 text-sm text-left transition-colors hover:bg-[#182229]"
              style={{ color: '#00a884' }}
            >
              + Novo contato personalizado
            </button>
          ) : (
            <div className="px-4 py-3 space-y-2 border-b" style={{ borderColor: '#2a3942' }}>
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Nome"
                className="w-full text-sm px-3 py-1.5 rounded outline-none"
                style={{ backgroundColor: '#2a3942', color: '#fff', border: 'none' }}
              />
              <input
                value={customPhone}
                onChange={e => setCustomPhone(e.target.value)}
                placeholder="Telefone com DDI (ex: 5511999990000)"
                className="w-full text-sm px-3 py-1.5 rounded outline-none"
                style={{ backgroundColor: '#2a3942', color: '#fff', border: 'none' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={addCustomContact}
                  className="flex-1 text-xs py-1.5 rounded font-medium"
                  style={{ backgroundColor: '#00a884', color: '#fff' }}
                >
                  Adicionar
                </button>
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="flex-1 text-xs py-1.5 rounded font-medium"
                  style={{ backgroundColor: '#2a3942', color: '#8696a0' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-3 border-t" style={{ borderColor: '#2a3942' }}>
          <p className="text-[10px] leading-relaxed" style={{ color: '#8696a0' }}>
            Mensagens enviadas aqui chegam ao Nexus como se fossem de um cliente real via WhatsApp.
          </p>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
            style={{ color: '#00a884' }}
          >
            <ExternalLink className="w-3 h-3" />
            Abrir Nexus Inbox
          </a>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="h-14 flex items-center gap-3 px-4 shrink-0" style={{ backgroundColor: '#202c33' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
            style={{ backgroundColor: '#6b7280', color: '#fff' }}>
            {contact.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white leading-none">{contact.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>+{contact.waId}</p>
          </div>
          <button
            onClick={resetConversation}
            title="Nova conversa"
            className="p-2 rounded-full transition-colors hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" style={{ color: '#aebac1' }} />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
          style={{ backgroundColor: '#0b141a' }}
        >
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-xs px-4 py-2 rounded-lg text-center max-w-xs"
                style={{ backgroundColor: '#182229', color: '#8696a0' }}>
                Envie uma mensagem para iniciar o atendimento no Nexus
              </div>
            </div>
          )}

          {messages.map(msg => {
            const isContact = msg.sender_type === 'contact'
            return (
              <div
                key={msg.id}
                className={cn('flex', isContact ? 'justify-start' : 'justify-end')}
              >
                <div
                  className="max-w-sm px-3 py-1.5 rounded-lg shadow-sm"
                  style={{
                    backgroundColor: isContact ? '#202c33' : '#005c4b',
                    borderRadius: isContact
                      ? '0px 8px 8px 8px'
                      : '8px 0px 8px 8px',
                  }}
                >
                  {!isContact && (
                    <p className="text-[10px] font-medium mb-0.5" style={{ color: '#00a884' }}>
                      Agente — Nexus
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e9edef' }}>
                    {msg.content}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[10px]" style={{ color: '#8696a0' }}>
                      {formatTime(msg.created_at)}
                    </span>
                    {!isContact && <StatusTick status={msg.wa_status} />}
                  </div>
                </div>
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ backgroundColor: '#202c33' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Digite uma mensagem"
            className="flex-1 text-sm px-4 py-2.5 rounded-lg outline-none"
            style={{
              backgroundColor: '#2a3942',
              color: '#e9edef',
              border: 'none',
            }}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
            style={{
              backgroundColor: input.trim() && !sending ? '#00a884' : '#2a3942',
              cursor: input.trim() && !sending ? 'pointer' : 'default',
            }}
          >
            {sending ? (
              <Check className="w-4 h-4" style={{ color: '#8696a0' }} />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
