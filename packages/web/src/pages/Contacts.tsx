import { useEffect, useState, useMemo } from 'react'
import { Search, Phone, MessageSquare, Calendar, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getInitials, formatPhone } from '@nexus/shared'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Contact } from '@nexus/shared'

interface ContactWithStats extends Contact {
  conversation_count: number
}

export default function Contacts() {
  const { profile } = useAuthContext()
  const [contacts, setContacts] = useState<ContactWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const orgId = profile?.org_id || ''

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }

    async function load() {
      try {
        // Fetch contacts and conversation counts in parallel
        const [contactRes, countRes] = await Promise.all([
          supabase
            .from('contacts')
            .select('*')
            .eq('org_id', orgId)
            .order('last_message_at', { ascending: false })
            .limit(500),
          // Use aggregation instead of fetching all rows
          supabase
            .from('conversations')
            .select('contact_id')
            .eq('org_id', orgId)
            .limit(5000),
        ])

        const contactData = contactRes.data
        if (!contactData) {
          setLoading(false)
          return
        }

        const countMap: Record<string, number> = {}
        for (const conv of countRes.data || []) {
          countMap[conv.contact_id] = (countMap[conv.contact_id] || 0) + 1
        }

        setContacts(
          contactData.map((c) => ({
            ...(c as Contact),
            conversation_count: countMap[c.id] || 0,
          }))
        )
      } catch (err) {
        console.error('[Contacts] Failed to load:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [orgId])

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.wa_id?.includes(q) ||
        c.email?.toLowerCase().includes(q)
    )
  }, [contacts, search])

  const selected = contacts.find((c) => c.id === selectedId) ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="flex flex-col w-80 shrink-0 border-r border-zinc-200 bg-white">
        {/* Header */}
        <div className="border-b border-zinc-200 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-700" />
              Contatos
            </h1>
            <span className="text-xs text-zinc-400">{contacts.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm border-zinc-200 bg-zinc-50 focus-visible:ring-0 focus-visible:border-zinc-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 mb-3">
                <Users className="h-5 w-5 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                {search ? 'Nenhum resultado' : 'Nenhum contato'}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {search ? 'Tente buscar por outro nome ou telefone' : 'Os contatos aparecem aqui quando mensagens chegam'}
              </p>
            </div>
          ) : (
            filtered.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelectedId(contact.id === selectedId ? null : contact.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-zinc-50 last:border-0 ${
                  selectedId === contact.id
                    ? 'bg-zinc-100'
                    : 'hover:bg-zinc-50'
                }`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xs">
                    {getInitials(contact.name || contact.wa_id)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 truncate">
                      {contact.name || contact.wa_id}
                    </span>
                    {contact.last_message_at && (
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {formatDistanceToNow(new Date(contact.last_message_at), {
                          locale: ptBR,
                          addSuffix: false,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-400 truncate">
                      {formatPhone(contact.phone || contact.wa_id)}
                    </span>
                    {contact.conversation_count > 0 && (
                      <span className="text-[10px] text-zinc-400 shrink-0 flex items-center gap-0.5">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {contact.conversation_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — details */}
      <div className="flex-1 overflow-auto bg-zinc-50">
        {selected ? (
          <div className="max-w-lg mx-auto p-8">
            {/* Contact header */}
            <div className="flex items-center gap-5 mb-8">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xl">
                  {getInitials(selected.name || selected.wa_id)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {selected.name || selected.wa_id}
                </h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {formatPhone(selected.phone || selected.wa_id)}
                </p>
              </div>
            </div>

            {/* Info cards */}
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Phone className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </div>
                  <span className="text-sm font-medium text-zinc-900">
                    {formatPhone(selected.wa_id)}
                  </span>
                </div>
                {selected.email && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Email</span>
                    <span className="text-sm font-medium text-zinc-900">{selected.email}</span>
                  </div>
                )}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Conversas</span>
                  </div>
                  <span className="text-sm font-medium text-zinc-900">
                    {selected.conversation_count}
                  </span>
                </div>
                {selected.first_message_at && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Primeiro contato</span>
                    </div>
                    <span className="text-sm font-medium text-zinc-900">
                      {format(new Date(selected.first_message_at), "dd 'de' MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {selected.last_message_at && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Última mensagem</span>
                    <span className="text-sm font-medium text-zinc-900">
                      {format(new Date(selected.last_message_at), "dd 'de' MMM yyyy, HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>

              {selected.tags && selected.tags.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 mb-4">
              <Users className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">Selecione um contato</p>
            <p className="text-xs text-zinc-500 mt-1">
              Clique em um contato para ver os detalhes
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
