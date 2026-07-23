import { useState, useEffect, useCallback } from 'react'
import {
  User,
  X,
  Phone,
  Mail,
  Wallet,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Megaphone,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Camera,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { getInitials, formatPhone } from '@nexus/shared'
import { getAvatarColor } from '@/lib/avatarColors'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types (mirror server payload: services/contact-enrich.service.ts) ─────────

interface EnrichedShopifyOrder {
  name: string
  total: number
  currency: string
  date: string | null
  title: string | null
}

interface EnrichedShopify {
  linked: boolean
  customerId: number | null
  customerUrl: string | null
  live: {
    name: string | null
    email: string | null
    tags: string[]
    ordersCount: number
    totalSpent: number
    lastOrders: EnrichedShopifyOrder[]
  } | null
  error?: string
}

interface EnrichedContact {
  id: string
  name: string | null
  phone: string | null
  phoneE164: string | null
  email: string | null
  tags: string[]
  lifetimeValue: number | null
  totalRevenue: number | null
  totalConversations: number
  profile: {
    summary: string | null
    stage: string | null
    sentiment: string | null
    interests: string[]
    traits: string[]
    objections: string[]
  }
  origin: {
    source: string | null
    medium: string | null
    campaign: string | null
    channel: string | null
    adId: string | null
    hasAd: boolean
    hasAny: boolean
  }
  shopify: EnrichedShopify | null
  shopifyConfigured: boolean
}

interface ContactInfoPanelProps {
  contactId: string
  open: boolean
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  researching: 'Pesquisando',
  considering: 'Considerando',
  negotiating: 'Negociando',
  customer: 'Cliente',
  lost: 'Perdido',
}

const SENTIMENT_STYLES: Record<string, { label: string; className: string }> = {
  positive: { label: 'Positivo', className: 'bg-emerald-50 text-emerald-700' },
  neutral: { label: 'Neutro', className: 'bg-zinc-100 text-zinc-600' },
  negative: { label: 'Negativo', className: 'bg-rose-50 text-rose-600' },
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border border-zinc-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
            {title}
          </span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-50 rounded-lg p-2.5">
      <span className="text-[11px] text-zinc-400 block">{label}</span>
      <span className={cn('text-sm font-semibold', accent ? 'text-emerald-700' : 'text-zinc-900')}>
        {value}
      </span>
    </div>
  )
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md">
          {it}
        </span>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ContactInfoPanel({ contactId, open, onClose }: ContactInfoPanelProps) {
  const [contact, setContact] = useState<EnrichedContact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!contactId) return
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ contact: EnrichedContact }>(`/api/contacts/${contactId}/enrich`)
      setContact(res.contact)
    } catch (err) {
      console.error('[ContactInfoPanel] enrich failed:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    if (open && contactId) load()
  }, [open, contactId, load])

  if (!open) return null

  const name = contact?.name || contact?.phone || 'Contato'
  const avatarColor = getAvatarColor(name)
  const stageLabel = contact?.profile.stage
    ? STAGE_LABELS[contact.profile.stage] || contact.profile.stage
    : null
  const sentiment = contact?.profile.sentiment
    ? SENTIMENT_STYLES[contact.profile.sentiment] || {
        label: contact.profile.sentiment,
        className: 'bg-zinc-100 text-zinc-600',
      }
    : null

  return (
    <div className="w-[380px] shrink-0 border-l border-zinc-200 bg-white flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-zinc-600" />
          <span className="text-sm font-medium text-zinc-900">Cliente</span>
        </div>
        <div className="flex items-center gap-1">
          {!loading && (
            <button
              onClick={load}
              className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
              aria-label="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
            aria-label="Fechar painel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col items-center gap-3 pt-2">
              <Skeleton className="w-20 h-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <AlertCircle className="w-8 h-8 text-rose-300 mb-3" />
            <p className="text-sm font-medium text-zinc-600 mb-1">Nao foi possivel carregar</p>
            <p className="text-xs text-zinc-400 mb-4">Verifique a conexao e tente novamente.</p>
            <button
              onClick={load}
              className="text-xs font-medium text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loaded */}
        {!loading && !error && contact && (
          <div className="p-4 space-y-3">
            {/* ── Identity ────────────────────────────────────────────── */}
            <div className="flex flex-col items-center text-center pt-1 pb-2">
              <div
                className={cn(
                  'w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold mb-3',
                  avatarColor.bg,
                  avatarColor.text,
                )}
              >
                {getInitials(name)}
              </div>
              <h2 className="text-base font-semibold text-zinc-900 leading-tight">{name}</h2>

              <div className="mt-2 space-y-1 w-full">
                {contact.phoneE164 || contact.phone ? (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-zinc-500">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatPhone(contact.phoneE164 || contact.phone || '')}</span>
                  </div>
                ) : null}
                {contact.email && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-zinc-500">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[280px]">{contact.email}</span>
                  </div>
                )}
              </div>

              {/* Subtle note: Cloud API has no profile photo */}
              <div className="mt-2.5 flex items-center gap-1 text-[10px] text-zinc-300">
                <Camera className="w-3 h-3" />
                <span>Foto de perfil nao disponivel pela API do WhatsApp</span>
              </div>

              {contact.tags.length > 0 && (
                <div className="mt-3 w-full">
                  <Chips items={contact.tags} />
                </div>
              )}
            </div>

            {/* ── Value ───────────────────────────────────────────────── */}
            <Section icon={Wallet} title="Valor">
              <div className="grid grid-cols-2 gap-2">
                {contact.lifetimeValue != null && (
                  <StatCard label="Lifetime value" value={formatCurrency(contact.lifetimeValue)} accent />
                )}
                {contact.totalRevenue != null && (
                  <StatCard label="Receita total" value={formatCurrency(contact.totalRevenue)} />
                )}
                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Conversas
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">
                    {contact.totalConversations}
                  </span>
                </div>
                {contact.shopify?.live && (
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Receipt className="w-3 h-3" /> Pedidos
                    </span>
                    <span className="text-sm font-semibold text-zinc-900">
                      {contact.shopify.live.ordersCount}
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Profile (IA) ────────────────────────────────────────── */}
            {(contact.profile.summary ||
              stageLabel ||
              sentiment ||
              contact.profile.interests.length > 0 ||
              contact.profile.traits.length > 0 ||
              contact.profile.objections.length > 0) && (
              <Section icon={Sparkles} title="Perfil IA">
                {(stageLabel || sentiment) && (
                  <div className="flex items-center gap-2 mb-2.5">
                    {stageLabel && (
                      <span className="text-xs bg-zinc-900 text-white px-2 py-0.5 rounded-md font-medium">
                        {stageLabel}
                      </span>
                    )}
                    {sentiment && (
                      <span className={cn('text-xs px-2 py-0.5 rounded-md font-medium', sentiment.className)}>
                        {sentiment.label}
                      </span>
                    )}
                  </div>
                )}
                {contact.profile.summary && (
                  <p className="text-sm text-zinc-700 leading-relaxed mb-2.5">
                    {contact.profile.summary}
                  </p>
                )}
                {contact.profile.interests.length > 0 && (
                  <div className="mb-2.5">
                    <span className="text-[11px] text-zinc-400 block mb-1">Interesses</span>
                    <Chips items={contact.profile.interests} />
                  </div>
                )}
                {contact.profile.traits.length > 0 && (
                  <div className="mb-2.5">
                    <span className="text-[11px] text-zinc-400 block mb-1">Traços</span>
                    <Chips items={contact.profile.traits} />
                  </div>
                )}
                {contact.profile.objections.length > 0 && (
                  <div>
                    <span className="text-[11px] text-zinc-400 block mb-1">Objeções</span>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.profile.objections.map((o, i) => (
                        <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
                          {o}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* ── Shopify ─────────────────────────────────────────────── */}
            {contact.shopify && (contact.shopify.linked || contact.shopify.live) ? (
              <Section
                icon={ShoppingBag}
                title="Shopify"
                action={
                  contact.shopify.customerUrl ? (
                    <a
                      href={contact.shopify.customerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : undefined
                }
              >
                {contact.shopify.error && (
                  <p className="text-xs text-rose-500 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {contact.shopify.error}
                  </p>
                )}
                {contact.shopify.live ? (
                  <>
                    {contact.shopify.live.tags.length > 0 && (
                      <div className="mb-2.5">
                        <Chips items={contact.shopify.live.tags} />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      <StatCard
                        label="Total gasto"
                        value={formatCurrency(contact.shopify.live.totalSpent)}
                        accent
                      />
                      <StatCard label="Pedidos" value={String(contact.shopify.live.ordersCount)} />
                    </div>
                    {contact.shopify.live.lastOrders.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-zinc-400 block">Últimos pedidos</span>
                        {contact.shopify.live.lastOrders.map((o, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 bg-zinc-50 rounded-lg px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-zinc-800 block truncate">
                                {o.title || o.name}
                              </span>
                              <span className="text-[11px] text-zinc-400">
                                {o.name} · {formatDate(o.date)}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-zinc-900 shrink-0">
                              {formatCurrency(o.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  !contact.shopify.error && (
                    <p className="text-xs text-zinc-400">
                      Cliente vinculado. Dados detalhados indisponiveis no momento.
                    </p>
                  )
                )}
              </Section>
            ) : contact.shopifyConfigured ? (
              <Section icon={ShoppingBag} title="Shopify">
                <p className="text-xs text-zinc-400">
                  Nenhum cliente Shopify vinculado a este contato.
                </p>
              </Section>
            ) : null}

            {/* ── Origin ──────────────────────────────────────────────── */}
            {contact.origin.hasAny && (
              <Section icon={Megaphone} title="Origem">
                <table className="w-full text-sm">
                  <tbody>
                    {contact.origin.campaign && (
                      <tr className="border-b border-zinc-50">
                        <td className="py-1.5 text-zinc-500 pr-4">Campanha</td>
                        <td className="py-1.5 text-zinc-900 font-medium text-right">
                          {contact.origin.campaign}
                        </td>
                      </tr>
                    )}
                    {contact.origin.source && (
                      <tr className="border-b border-zinc-50">
                        <td className="py-1.5 text-zinc-500 pr-4">Fonte</td>
                        <td className="py-1.5 text-zinc-900 font-medium text-right">
                          {contact.origin.source}
                        </td>
                      </tr>
                    )}
                    {contact.origin.medium && (
                      <tr className="border-b border-zinc-50">
                        <td className="py-1.5 text-zinc-500 pr-4">Meio</td>
                        <td className="py-1.5 text-zinc-900 font-medium text-right">
                          {contact.origin.medium}
                        </td>
                      </tr>
                    )}
                    {contact.origin.channel && (
                      <tr className="border-b border-zinc-50">
                        <td className="py-1.5 text-zinc-500 pr-4">Canal</td>
                        <td className="py-1.5 text-zinc-900 font-medium text-right">
                          {contact.origin.channel}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {contact.origin.hasAd && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-violet-600">
                    <Megaphone className="w-3 h-3" />
                    Veio de anuncio pago
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
