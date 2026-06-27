import { useState, useEffect, useCallback } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Phone, Mail, Calendar, Tag, X, ChevronDown, Loader2, ShoppingBag, ExternalLink, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials, formatPhone } from '@nexus/shared'
import { getAvatarColor } from '@/lib/avatarColors'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useConversationStore } from '@/stores/conversationStore'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { Sector } from '@nexus/shared'

interface ContactPanelProps {
  conversation: ConversationWithRelations
  onClose: () => void
  /** When true, header is hidden (rendered by parent Inbox tab bar) */
  embedded?: boolean
}

// ─── Inline Select ─────────────────────────────────────────────────
interface InlineSelectProps {
  label: string
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (value: string) => void
  saving?: boolean
}

function InlineSelect({ label, value, options, onChange, saving }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={saving}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-50"
          style={
            selected?.color
              ? { backgroundColor: `${selected.color}15`, color: selected.color }
              : undefined
          }
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              {selected?.label || '—'}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 bottom-full mb-1 z-50 min-w-[140px] rounded-lg border border-zinc-200 bg-white shadow-lg py-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 transition-colors flex items-center gap-2 ${
                    option.value === value ? 'font-medium text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  {option.color && (
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  {option.label}
                  {option.value === value && (
                    <span className="ml-auto text-emerald-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Status badge config ────────────────────────────────────────────
const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  open: { label: 'Aberto', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Resolvido', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
  closed: { label: 'Fechado', className: 'bg-zinc-100 text-zinc-400 border-zinc-200' },
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]

// ─── Main component ────────────────────────────────────────────────
export function ContactPanel({ conversation, onClose, embedded }: ContactPanelProps) {
  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'
  const avatarColor = getAvatarColor(contactName)
  const { update: updateConversation } = useConversationStore()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [savingField, setSavingField] = useState<string | null>(null)

  // Load sectors once
  useEffect(() => {
    async function loadSectors() {
      const { data } = await supabase
        .from('sectors')
        .select('id, name, color, org_id')
        .eq('org_id', conversation.org_id)
        .order('name')
      if (data) setSectors(data as Sector[])
    }
    loadSectors()
  }, [conversation.org_id])

  // Generic field updater
  const updateField = useCallback(
    async (field: string, value: string | null) => {
      setSavingField(field)
      try {
        const { error } = await supabase
          .from('conversations')
          .update({ [field]: value })
          .eq('id', conversation.id)

        if (error) throw error

        // Optimistic update in store
        const storeUpdate: Record<string, unknown> = { [field]: value }
        if (field === 'sector_id') {
          storeUpdate.sector = value
            ? sectors.find((s) => s.id === value) || null
            : null
        }
        updateConversation(conversation.id, storeUpdate as Partial<ConversationWithRelations>)
      } catch (err) {
        console.error(`Failed to update ${field}:`, err)
        toast.error('Erro ao atualizar. Tente novamente.')
      } finally {
        setSavingField(null)
      }
    },
    [conversation.id, sectors, updateConversation]
  )

  // Build sector options
  const sectorOptions = [
    { value: '__none__', label: 'Sem setor', color: undefined },
    ...sectors.map((s) => ({ value: s.id, label: s.name, color: s.color })),
  ]

  const currentSectorValue = conversation.sector_id || '__none__'
  const statusBadge = STATUS_DISPLAY[conversation.status] || STATUS_DISPLAY.open

  return (
    <div className={cn('flex flex-col h-full bg-white', !embedded && 'border-l border-zinc-200')}>
      {/* Header — hidden when embedded (parent renders tab bar) */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200">
          <span className="text-sm font-medium text-zinc-900">Detalhes</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Fechar painel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Contact info */}
      <div className="flex flex-col items-center px-4 py-6">
        <Avatar className="w-16 h-16 mb-3">
          {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contactName} />}
          <AvatarFallback className={`${avatarColor.bg} ${avatarColor.text} text-lg font-medium`}>
            {getInitials(contactName)}
          </AvatarFallback>
        </Avatar>
        <h3 className="text-sm font-semibold text-zinc-900">{contactName}</h3>
        {contact?.wa_id && (
          <p className="text-xs text-zinc-400 mt-0.5">
            {formatPhone(contact.wa_id)}
          </p>
        )}
      </div>

      <Separator />

      {/* Contact details — editable */}
      <div className="px-4 py-4 space-y-4">
        {contact?.phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">{formatPhone(contact.phone)}</span>
          </div>
        )}
        {contact && (
          <EditableContactField
            icon={<Mail className="w-4 h-4 text-zinc-400" />}
            value={contact.email || ''}
            placeholder="Adicionar email"
            onSave={async (val) => {
              await api.patch(`/api/contacts/${contact.id}`, { email: val || null })
              toast.success('Email atualizado')
            }}
          />
        )}
        {contact?.first_message_at && (
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">
              Desde {format(new Date(contact.first_message_at), "dd 'de' MMM yyyy", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {contact?.tags && contact.tags.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Conversation management */}
      <Separator />
      <div className="px-4 py-4 space-y-3">
        {/* Status — read-only badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Status</span>
          <Badge variant="outline" className={`text-xs ${statusBadge.className}`}>
            {statusBadge.label}
          </Badge>
        </div>

        {/* Priority — editable */}
        <InlineSelect
          label="Prioridade"
          value={conversation.priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => updateField('priority', v)}
          saving={savingField === 'priority'}
        />

        {/* Sector — editable */}
        <InlineSelect
          label="Setor"
          value={currentSectorValue}
          options={sectorOptions}
          onChange={(v) => updateField('sector_id', v === '__none__' ? null : v)}
          saving={savingField === 'sector_id'}
        />
      </div>

      {/* Shopify integration */}
      {contact && <ShopifySection contactId={contact.id} />}
    </div>
  )
}

// ─── Editable Contact Field ────────────────────────────────────────
function EditableContactField({
  icon,
  value,
  placeholder,
  onSave,
}: {
  icon: React.ReactNode
  value: string
  placeholder: string
  onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-3">
        {icon}
        <input
          autoFocus
          className="text-sm text-zinc-600 bg-transparent border-b border-zinc-300 focus:border-zinc-900 outline-none flex-1 py-0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          disabled={saving}
          placeholder={placeholder}
        />
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 cursor-pointer group"
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      {icon}
      <span className={cn('text-sm', value ? 'text-zinc-600' : 'text-zinc-400 italic')}>
        {value || placeholder}
      </span>
    </div>
  )
}

// ─── Shopify Section ────────────────────────────────────────────────
interface ShopifyCandidate {
  id: number
  name: string
  email: string
  phone: string
  orders_count: number
  total_spent: string
  url: string
}

function ShopifySection({ contactId }: { contactId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'linked' | 'error'>('idle')
  const [candidates, setCandidates] = useState<ShopifyCandidate[]>([])
  const [linkedId, setLinkedId] = useState<number | null>(null)
  const [linking, setLinking] = useState(false)

  const lookup = useCallback(async () => {
    setState('loading')
    try {
      const data = await api.get<{ linked?: boolean; shopify_customer_id?: number; candidates?: ShopifyCandidate[]; error?: string }>(`/api/contacts/${contactId}/shopify`)

      if (data.error) {
        setState('error')
        return
      }

      if (data.linked) {
        setLinkedId(data.shopify_customer_id || null)
        setState('linked')
      } else if (data.candidates && data.candidates.length > 0) {
        setCandidates(data.candidates)
        setState('found')
      } else {
        setState('not_found')
      }
    } catch {
      setState('error')
    }
  }, [contactId])

  const linkCustomer = useCallback(async (candidate: ShopifyCandidate) => {
    setLinking(true)
    try {
      await api.post(`/api/contacts/${contactId}/shopify/link`, {
        shopifyCustomerId: candidate.id,
        shopifyCustomerUrl: candidate.url,
      })
      setLinkedId(candidate.id)
      setState('linked')
      toast.success('Contato vinculado ao Shopify')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setLinking(false)
    }
  }, [contactId])

  return (
    <>
      <Separator />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-500">Shopify</span>
        </div>

        {state === 'idle' && (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={lookup}>
            <Link2 className="w-3 h-3 mr-1.5" />
            Buscar cliente no Shopify
          </Button>
        )}

        {state === 'loading' && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          </div>
        )}

        {state === 'linked' && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Vinculado (ID: {linkedId})</span>
          </div>
        )}

        {state === 'found' && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{candidates.length} cliente(s) encontrado(s):</p>
            {candidates.map((c) => (
              <div key={c.id} className="border border-zinc-200 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-900">{c.name || 'Sem nome'}</span>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-600">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {c.email && <p className="text-xs text-zinc-500">{c.email}</p>}
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{c.orders_count} pedidos</span>
                  <span>R$ {c.total_spent}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs mt-1"
                  onClick={() => linkCustomer(c)}
                  disabled={linking}
                >
                  {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Vincular este cliente'}
                </Button>
              </div>
            ))}
          </div>
        )}

        {state === 'not_found' && (
          <p className="text-xs text-zinc-400 text-center py-2">Nenhum cliente encontrado no Shopify</p>
        )}

        {state === 'error' && (
          <div className="text-center py-2">
            <p className="text-xs text-zinc-400 mb-2">Shopify nao configurado</p>
            <Button variant="outline" size="sm" className="text-xs" onClick={lookup}>
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
