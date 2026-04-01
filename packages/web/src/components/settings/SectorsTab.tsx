import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import type { Sector } from '@nexus/shared'
import { Loader2, Plus, Pencil, Trash2, Save, X, Layers } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

interface SectorForm {
  name: string
  description: string
  color: string
  system_prompt: string
  ai_model: string
  ai_temperature: number
}

const DEFAULT_FORM: SectorForm = {
  name: '',
  description: '',
  color: '#3b82f6',
  system_prompt: 'Você é um assistente de atendimento ao cliente. Seja cordial e objetivo.',
  ai_model: 'claude-sonnet-4-20250514',
  ai_temperature: 0.3,
}

const AI_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

export function SectorsTab() {
  const { profile } = useAuthContext()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<SectorForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  const orgId = profile?.org_id || ''

  const fetchSectors = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('sectors')
      .select('*')
      .eq('org_id', orgId)
      .order('name')

    setSectors((data || []) as Sector[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchSectors()
  }, [fetchSectors])

  const startCreate = () => {
    setForm(DEFAULT_FORM)
    setCreating(true)
    setEditingId(null)
  }

  const startEdit = (sector: Sector) => {
    setForm({
      name: sector.name,
      description: sector.description || '',
      color: sector.color,
      system_prompt: sector.system_prompt,
      ai_model: sector.ai_model,
      ai_temperature: sector.ai_temperature,
    })
    setEditingId(sector.id)
    setCreating(false)
  }

  const cancel = () => {
    setEditingId(null)
    setCreating(false)
    setForm(DEFAULT_FORM)
  }

  const handleSave = async () => {
    if (!orgId || !form.name.trim()) return
    setSaving(true)

    if (creating) {
      const { data } = await supabase
        .from('sectors')
        .insert({
          org_id: orgId,
          name: form.name,
          description: form.description || null,
          color: form.color,
          system_prompt: form.system_prompt,
          ai_model: form.ai_model,
          ai_temperature: form.ai_temperature,
        })
        .select()
        .single()

      if (data) {
        setSectors((prev) => [...prev, data as Sector])
      }
    } else if (editingId) {
      await supabase
        .from('sectors')
        .update({
          name: form.name,
          description: form.description || null,
          color: form.color,
          system_prompt: form.system_prompt,
          ai_model: form.ai_model,
          ai_temperature: form.ai_temperature,
        })
        .eq('id', editingId)

      setSectors((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? { ...s, ...form, description: form.description || null }
            : s
        )
      )
    }

    setSaving(false)
    cancel()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este setor?')) return

    await supabase.from('sectors').delete().eq('id', id)
    setSectors((prev) => prev.filter((s) => s.id !== id))
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-zinc-200 p-4">
            <Skeleton className="h-4 w-4 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
    )
  }

  const isEditing = creating || editingId !== null

  return (
    <div className="max-w-2xl space-y-6">
      {/* Sector List */}
      {!isEditing && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">{sectors.length} setores configurados</p>
            <Button size="sm" onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo setor
            </Button>
          </div>

          <div className="space-y-2">
            {sectors.map((sector) => (
              <Card key={sector.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: sector.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{sector.name}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {sector.description || sector.system_prompt.slice(0, 80) + '…'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(sector)}
                      aria-label="Editar setor"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(sector.id)}
                      aria-label="Excluir setor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {sectors.length === 0 && (
              <EmptyState
                icon={Layers}
                title="Nenhum setor criado"
                description="Crie setores para organizar atendimentos e personalizar a IA."
                action={{ label: 'Criar primeiro setor', onClick: startCreate }}
              />
            )}
          </div>
        </>
      )}

      {/* Create/Edit Form */}
      {isEditing && (
        <Card className="border-zinc-200 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {creating ? 'Novo setor' : 'Editar setor'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Vendas"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-12 cursor-pointer rounded border border-zinc-200"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição breve do setor"
              />
            </div>

            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={form.system_prompt}
                onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
                placeholder="Instruções para a IA quando atender neste setor..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modelo de IA</Label>
                <select
                  value={form.ai_model}
                  onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Temperatura ({form.ai_temperature})</Label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.ai_temperature}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ai_temperature: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-zinc-900"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>Preciso</span>
                  <span>Criativo</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} size="sm">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar
              </Button>
              <Button variant="outline" size="sm" onClick={cancel}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
