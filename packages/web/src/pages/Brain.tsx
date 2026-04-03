import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  Target,
  Users,
  MessageCircle,
  Sparkles,
  Clock,
  DollarSign,
  Heart,
  Layers,
  GripVertical,
  Search,
  Loader2,
} from 'lucide-react'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SERVER_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

// --- Types ---

interface Directive {
  id: string
  category: string
  title: string
  description: string | null
  content: string
  source_reference: string | null
  priority: number
  is_active: boolean
  applies_to_sectors: string[]
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  name: string
  description: string
}

interface Sector {
  id: string
  name: string
}

// --- Category config ---

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  brand_identity: { icon: Sparkles, color: 'violet' },
  sales_strategy: { icon: Target, color: 'emerald' },
  customer_psychology: { icon: Users, color: 'blue' },
  communication_style: { icon: MessageCircle, color: 'sky' },
  leadership_mindset: { icon: Brain, color: 'amber' },
  productivity_habits: { icon: Clock, color: 'orange' },
  financial_mindset: { icon: DollarSign, color: 'green' },
  wellbeing_culture: { icon: Heart, color: 'rose' },
  custom: { icon: Layers, color: 'zinc' },
}

// --- Helpers ---

function apiFetch(path: string, options: RequestInit = {}) {
  const headers = getAuthHeaders()
  return fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(err.error || `Erro ${res.status}`)
    }
    return res.json()
  })
}

// --- Main Component ---

export function BrainPage() {
  const [directives, setDirectives] = useState<Directive[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDirective, setEditingDirective] = useState<Directive | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [directivesRes, categoriesRes, sectorsData] = await Promise.all([
        apiFetch('/api/brain'),
        apiFetch('/api/brain/categories'),
        supabase.from('sectors').select('id, name').order('name'),
      ])
      setDirectives(directivesRes.directives || [])
      setCategories(categoriesRes.categories || [])
      setSectors((sectorsData.data as Sector[]) || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggle = async (id: string) => {
    try {
      const res = await apiFetch(`/api/brain/${id}/toggle`, { method: 'PATCH' })
      setDirectives((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_active: res.directive.is_active } : d))
      )
    } catch (err) {
      console.error('Erro ao alternar diretriz:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/brain/${id}`, { method: 'DELETE' })
      setDirectives((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      console.error('Erro ao remover diretriz:', err)
    }
  }

  const handleSave = async (data: DirectiveFormData) => {
    setSaving(true)
    try {
      if (editingDirective) {
        const res = await apiFetch(`/api/brain/${editingDirective.id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
        setDirectives((prev) =>
          prev.map((d) => (d.id === editingDirective.id ? res.directive : d))
        )
      } else {
        const res = await apiFetch('/api/brain', {
          method: 'POST',
          body: JSON.stringify(data),
        })
        setDirectives((prev) => [res.directive, ...prev])
      }
      setDialogOpen(false)
      setEditingDirective(null)
    } catch (err) {
      console.error('Erro ao salvar diretriz:', err)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (directive: Directive) => {
    setEditingDirective(directive)
    setDialogOpen(true)
  }

  const openCreate = () => {
    setEditingDirective(null)
    setDialogOpen(true)
  }

  // Filtered directives
  const filtered = directives.filter((d) => {
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  // Group by category
  const grouped = filtered.reduce<Record<string, Directive[]>>((acc, d) => {
    if (!acc[d.category]) acc[d.category] = []
    acc[d.category].push(d)
    return acc
  }, {})

  const activeCount = directives.filter((d) => d.is_active).length
  const totalCount = directives.length

  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <Brain className="w-5 h-5 text-zinc-700" />
              Cerebro da Empresa
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Diretrizes estrategicas que guiam a inteligencia artificial da sua equipe
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 mr-4">
              <div className="text-right">
                <p className="text-2xl font-semibold text-zinc-900">{activeCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">Ativas</p>
              </div>
              <div className="w-px h-8 bg-zinc-200" />
              <div className="text-right">
                <p className="text-2xl font-semibold text-zinc-400">{totalCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">Total</p>
              </div>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Nova Diretriz
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-zinc-100 bg-white/50 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <Input
            placeholder="Buscar diretrizes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { if (v) setCategoryFilter(v) }}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue>
              {categoryFilter === 'all'
                ? 'Todas categorias'
                : categories.find((c) => c.id === categoryFilter)?.name || categoryFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todas categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id} className="text-xs">
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : totalCount === 0 ? (
          <EmptyState onCreateClick={openCreate} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-8 h-8 text-zinc-300 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Nenhuma diretriz encontrada</p>
            <p className="text-xs text-zinc-400 mt-1">
              Tente ajustar os filtros ou buscar por outro termo
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([, a], [, b]) => {
                const maxA = Math.max(...a.map((d) => d.priority))
                const maxB = Math.max(...b.map((d) => d.priority))
                return maxB - maxA
              })
              .map(([category, items]) => (
                <CategorySection
                  key={category}
                  category={category}
                  categories={categories}
                  directives={items}
                  sectors={sectors}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <DirectiveDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingDirective(null)
        }}
        directive={editingDirective}
        categories={categories}
        sectors={sectors}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}

// --- Empty State ---

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
        <BookOpen className="w-7 h-7 text-zinc-400" />
      </div>
      <h2 className="text-base font-semibold text-zinc-800">Defina o DNA da sua empresa</h2>
      <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
        As diretrizes que voce cadastrar aqui serao absorvidas pela IA e aplicadas em todas as
        interacoes com seus clientes. Pense nelas como os principios que guiam sua equipe.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-6 w-full text-left">
        {[
          { label: 'Identidade da Marca', desc: 'Tom de voz, missao, valores' },
          { label: 'Estrategia de Vendas', desc: 'Abordagem comercial, fechamento' },
          { label: 'Psicologia do Cliente', desc: 'Perfis, gatilhos, empatia' },
          { label: 'Mentalidade Financeira', desc: 'Precificacao, valor percebido' },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3 rounded-lg border border-zinc-200 bg-white"
          >
            <p className="text-xs font-medium text-zinc-700">{item.label}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>
      <Button onClick={onCreateClick} className="mt-6 gap-1.5" size="sm">
        <Plus className="w-3.5 h-3.5" />
        Criar primeira diretriz
      </Button>
    </div>
  )
}

// --- Category Section ---

function CategorySection({
  category,
  categories,
  directives,
  sectors,
  onToggle,
  onEdit,
  onDelete,
}: {
  category: string
  categories: Category[]
  directives: Directive[]
  sectors: Sector[]
  onToggle: (id: string) => void
  onEdit: (d: Directive) => void
  onDelete: (id: string) => void
}) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom
  const Icon = config.icon
  const catInfo = categories.find((c) => c.id === category)
  const sorted = [...directives].sort((a, b) => b.priority - a.priority)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center',
            `bg-${config.color}-50`
          )}
        >
          <Icon className={cn('w-3.5 h-3.5', `text-${config.color}-600`)} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">
            {catInfo?.name || category}
          </h3>
          {catInfo?.description && (
            <p className="text-[10px] text-zinc-400">{catInfo.description}</p>
          )}
        </div>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5">
          {directives.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {sorted.map((directive) => (
          <DirectiveCard
            key={directive.id}
            directive={directive}
            sectors={sectors}
            config={config}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// --- Directive Card ---

function DirectiveCard({
  directive,
  sectors,
  onToggle,
  onEdit,
  onDelete,
}: {
  directive: Directive
  sectors: Sector[]
  config: { icon: React.ElementType; color: string }
  onToggle: (id: string) => void
  onEdit: (d: Directive) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const appliedSectors = directive.applies_to_sectors?.length
    ? sectors.filter((s) => directive.applies_to_sectors.includes(s.id))
    : []

  return (
    <Card
      className={cn(
        'border-zinc-200 shadow-none transition-all duration-150',
        !directive.is_active && 'opacity-50',
        expanded && 'shadow-sm'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-zinc-300">
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div
                className="flex-1 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
              >
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-zinc-800">{directive.title}</h4>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1.5 font-normal text-zinc-400 border-zinc-200"
                  >
                    P{directive.priority}
                  </Badge>
                </div>
                {directive.description && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                    {directive.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {appliedSectors.length > 0 ? (
                  <div className="flex gap-1">
                    {appliedSectors.map((s) => (
                      <Badge
                        key={s.id}
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-4 px-1.5 text-zinc-400"
                  >
                    Todos setores
                  </Badge>
                )}

                <Switch
                  checked={directive.is_active}
                  onCheckedChange={() => onToggle(directive.id)}
                  className="scale-75"
                />

                <button
                  onClick={() => onEdit(directive)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(directive.id)}
                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {expanded && (
              <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                    Conteudo da diretriz
                  </p>
                  <p className="text-xs text-zinc-600 whitespace-pre-wrap leading-relaxed">
                    {directive.content}
                  </p>
                </div>
                {directive.source_reference && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                      Fonte / Referencia
                    </p>
                    <p className="text-xs text-zinc-500 italic">
                      {directive.source_reference}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Directive Dialog (Create/Edit) ---

interface DirectiveFormData {
  category: string
  title: string
  description?: string
  content: string
  source_reference?: string
  priority?: number
  applies_to_sectors?: string[]
}

function DirectiveDialog({
  open,
  onOpenChange,
  directive,
  categories,
  sectors,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  directive: Directive | null
  categories: Category[]
  sectors: Sector[]
  onSave: (data: DirectiveFormData) => void
  saving: boolean
}) {
  const [form, setForm] = useState<DirectiveFormData>({
    category: 'brand_identity',
    title: '',
    content: '',
    description: '',
    source_reference: '',
    priority: 5,
    applies_to_sectors: [],
  })

  useEffect(() => {
    if (directive) {
      setForm({
        category: directive.category,
        title: directive.title,
        content: directive.content,
        description: directive.description || '',
        source_reference: directive.source_reference || '',
        priority: directive.priority,
        applies_to_sectors: directive.applies_to_sectors || [],
      })
    } else {
      setForm({
        category: 'brand_identity',
        title: '',
        content: '',
        description: '',
        source_reference: '',
        priority: 5,
        applies_to_sectors: [],
      })
    }
  }, [directive, open])

  const isValid = form.category && form.title.trim() && form.content.trim()

  const toggleSector = (sectorId: string) => {
    setForm((prev) => ({
      ...prev,
      applies_to_sectors: prev.applies_to_sectors?.includes(sectorId)
        ? prev.applies_to_sectors.filter((id) => id !== sectorId)
        : [...(prev.applies_to_sectors || []), sectorId],
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {directive ? 'Editar Diretriz' : 'Nova Diretriz'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Select
              value={form.category}
              onValueChange={(v) => { if (v) setForm((p) => ({ ...p, category: v })) }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => {
                  const cfg = CATEGORY_CONFIG[cat.id] || CATEGORY_CONFIG.custom
                  const CatIcon = cfg.icon
                  return (
                    <SelectItem key={cat.id} value={cat.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <CatIcon className={cn('w-3.5 h-3.5', `text-${cfg.color}-500`)} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Titulo</Label>
            <Input
              placeholder="Ex: Abordagem consultiva de vendas"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Descricao (opcional)</Label>
            <Input
              placeholder="Breve resumo da diretriz"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <Label className="text-xs">Conteudo da diretriz</Label>
            <Textarea
              placeholder="Descreva detalhadamente a diretriz que a IA deve seguir..."
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={5}
              className="text-sm resize-none"
            />
          </div>

          {/* Source Reference */}
          <div className="space-y-1.5">
            <Label className="text-xs">Fonte / Referencia (opcional)</Label>
            <Input
              placeholder="Ex: Como Fazer Amigos e Influenciar Pessoas — Dale Carnegie"
              value={form.source_reference}
              onChange={(e) => setForm((p) => ({ ...p, source_reference: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          {/* Priority + Sectors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade (1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.priority}
                onChange={(e) =>
                  setForm((p) => ({ ...p, priority: parseInt(e.target.value) || 5 }))
                }
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aplica-se a</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sectors.length === 0 ? (
                  <span className="text-xs text-zinc-400">Nenhum setor cadastrado</span>
                ) : (
                  sectors.map((s) => {
                    const selected = form.applies_to_sectors?.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSector(s.id)}
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full border transition-colors',
                          selected
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                        )}
                      >
                        {s.name}
                      </button>
                    )
                  })
                )}
              </div>
              {(form.applies_to_sectors?.length ?? 0) === 0 && sectors.length > 0 && (
                <p className="text-[10px] text-zinc-400">
                  Nenhum selecionado = aplica a todos
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(form)}
              disabled={!isValid || saving}
              className="text-xs gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {directive ? 'Salvar alteracoes' : 'Criar diretriz'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default BrainPage
