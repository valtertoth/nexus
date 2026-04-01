import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfileStore, useActiveProfile } from '@/stores/profileStore'
import type { Profile } from '@/stores/profileStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
// Sector selection uses button grid instead of Select
import { Zap, Plus, Pencil, Trash2, Shield, Headset, DollarSign, ShoppingBag } from 'lucide-react'

interface Sector {
  id: string
  name: string
  color: string
}

const ROLE_CONFIG = {
  vendedor: { label: 'Vendedor', icon: ShoppingBag, description: 'Atendimento comercial' },
  financeiro: { label: 'Financeiro', icon: DollarSign, description: 'Cobranças e pagamentos' },
  suporte: { label: 'Suporte', icon: Headset, description: 'Suporte técnico e dúvidas' },
  admin: { label: 'Administrador', icon: Shield, description: 'Acesso completo' },
} as const

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

export default function ProfileSelector() {
  const navigate = useNavigate()
  const { profiles, addProfile, updateProfile, removeProfile, setActiveProfile } = useProfileStore()
  const activeProfile = useActiveProfile()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState<Profile['role']>('vendedor')
  const [formSectorId, setFormSectorId] = useState<string>('')
  const [formColor, setFormColor] = useState(AVATAR_COLORS[0])

  // If profile already selected, redirect
  useEffect(() => {
    if (activeProfile) {
      navigate('/', { replace: true })
    }
  }, [activeProfile, navigate])

  // Hydrate profiles from Supabase if localStorage is empty
  useEffect(() => {
    async function hydrateFromSupabase() {
      if (profiles.length > 0) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: dbUsers } = await supabase
        .from('users')
        .select('id, name, role, sector_id, sectors(id, name)')
        .eq('id', user.id)

      if (!dbUsers || dbUsers.length === 0) return

      for (const dbUser of dbUsers) {
        const roleMap: Record<string, Profile['role']> = {
          owner: 'admin', admin: 'admin', vendedor: 'vendedor',
          financeiro: 'financeiro', suporte: 'suporte', seller: 'vendedor',
        }
        const sector = dbUser.sectors as { id: string; name: string } | null
        addProfile({
          id: dbUser.id,
          name: dbUser.name || user.email || 'Usuário',
          role: roleMap[dbUser.role] || 'vendedor',
          sectorId: sector?.id || null,
          sectorName: sector?.name || null,
          avatarColor: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
        })
      }
    }
    hydrateFromSupabase()
  }, [profiles.length, addProfile])

  // Load sectors
  useEffect(() => {
    async function loadSectors() {
      const { data } = await supabase
        .from('sectors')
        .select('id, name, color')
        .order('name')
      if (data) setSectors(data)
    }
    loadSectors()
  }, [])

  function seedTestProfiles() {
    const sectorMap: Record<string, { id: string; name: string }> = {}
    for (const s of sectors) {
      sectorMap[s.name.toLowerCase()] = { id: s.id, name: s.name }
    }

    const testProfiles: Profile[] = [
      {
        id: crypto.randomUUID(),
        name: 'Valter',
        role: 'admin',
        sectorId: null,
        sectorName: null,
        avatarColor: '#3b82f6',
      },
      {
        id: crypto.randomUUID(),
        name: 'Carlos',
        role: 'vendedor',
        sectorId: sectorMap['vendas']?.id || null,
        sectorName: sectorMap['vendas']?.name || null,
        avatarColor: '#10b981',
      },
      {
        id: crypto.randomUUID(),
        name: 'Ana',
        role: 'suporte',
        sectorId: sectorMap['suporte']?.id || null,
        sectorName: sectorMap['suporte']?.name || null,
        avatarColor: '#f59e0b',
      },
      {
        id: crypto.randomUUID(),
        name: 'Julia',
        role: 'financeiro',
        sectorId: sectorMap['financeiro']?.id || null,
        sectorName: sectorMap['financeiro']?.name || null,
        avatarColor: '#ec4899',
      },
    ]

    for (const p of testProfiles) {
      addProfile(p)
    }
  }

  function openCreateDialog() {
    setEditingProfile(null)
    setFormName('')
    setFormRole('vendedor')
    setFormSectorId(sectors[0]?.id || '')
    setFormColor(AVATAR_COLORS[profiles.length % AVATAR_COLORS.length])
    setDialogOpen(true)
  }

  function openEditDialog(profile: Profile) {
    setEditingProfile(profile)
    setFormName(profile.name)
    setFormRole(profile.role)
    setFormSectorId(profile.sectorId || '')
    setFormColor(profile.avatarColor)
    setDialogOpen(true)
  }

  function handleSave() {
    if (!formName.trim()) return

    const sector = formRole === 'admin'
      ? null
      : sectors.find((s) => s.id === formSectorId)

    if (editingProfile) {
      updateProfile(editingProfile.id, {
        name: formName.trim(),
        role: formRole,
        sectorId: formRole === 'admin' ? null : (sector?.id || null),
        sectorName: formRole === 'admin' ? null : (sector?.name || null),
        avatarColor: formColor,
      })
    } else {
      const newProfile: Profile = {
        id: crypto.randomUUID(),
        name: formName.trim(),
        role: formRole,
        sectorId: formRole === 'admin' ? null : (sector?.id || null),
        sectorName: formRole === 'admin' ? null : (sector?.name || null),
        avatarColor: formColor,
      }
      addProfile(newProfile)
    }

    setDialogOpen(false)
  }

  function handleSelect(profileId: string) {
    setActiveProfile(profileId)
    navigate('/', { replace: true })
  }

  function handleDelete(id: string) {
    removeProfile(id)
    setDeleteConfirm(null)
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-900">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-zinc-900">
            Nexus
          </span>
        </div>

        <p className="text-center text-zinc-500 text-sm mb-8">
          Quem está atendendo?
        </p>

        {/* Profiles Grid */}
        {profiles.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {profiles.map((profile) => {
              const RoleIcon = ROLE_CONFIG[profile.role].icon
              return (
                <div
                  key={profile.id}
                  className="group relative"
                >
                  <button
                    onClick={() => handleSelect(profile.id)}
                    className="w-full flex flex-col items-center gap-3 p-6 rounded-xl border border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-md transition-all duration-150 cursor-pointer"
                  >
                    {/* Avatar */}
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-semibold shadow-sm"
                      style={{ backgroundColor: profile.avatarColor }}
                    >
                      {getInitials(profile.name)}
                    </div>

                    {/* Info */}
                    <div className="text-center">
                      <p className="font-medium text-zinc-900 text-sm">
                        {profile.name}
                      </p>
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        <RoleIcon className="w-3 h-3 text-zinc-400" />
                        <span className="text-xs text-zinc-500">
                          {ROLE_CONFIG[profile.role].label}
                        </span>
                      </div>
                      {profile.sectorName && (
                        <span className="text-[11px] text-zinc-400 mt-0.5 block">
                          {profile.sectorName}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Edit/Delete buttons */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditDialog(profile) }}
                      className="p-1 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(profile.id) }}
                      className="p-1 rounded-md bg-white border border-zinc-200 hover:bg-red-50 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Delete confirmation */}
                  {deleteConfirm === profile.id && (
                    <div className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center gap-2 border border-red-200">
                      <p className="text-xs text-zinc-600">Remover perfil?</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(profile.id)}>
                          Sim
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>
                          Não
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add new profile card */}
            <button
              onClick={openCreateDialog}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-150 cursor-pointer min-h-[160px]"
            >
              <Plus className="w-8 h-8 text-zinc-300" />
              <span className="text-sm text-zinc-400">Novo perfil</span>
            </button>
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 mb-1">
              Crie seu primeiro perfil
            </h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
              Cada perfil representa uma pessoa ou função no atendimento.
              Você pode criar quantos precisar.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Criar perfil
              </Button>
              {sectors.length > 0 && (
                <Button variant="outline" onClick={seedTestProfiles}>
                  Carregar perfis de teste
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-zinc-400 mt-4">
          Nexus — Atendimento inteligente via WhatsApp
        </p>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Editar perfil' : 'Novo perfil'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                placeholder="Ex: João, Maria..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Função</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(ROLE_CONFIG) as Profile['role'][]).map((role) => {
                  const config = ROLE_CONFIG[role]
                  const Icon = config.icon
                  const isSelected = formRole === role
                  return (
                    <button
                      key={role}
                      onClick={() => setFormRole(role)}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className={`text-[11px] ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                          {config.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sector (only if not admin) */}
            {formRole !== 'admin' && sectors.length > 0 && (
              <div className="space-y-2">
                <Label>Setor</Label>
                <div className="grid grid-cols-3 gap-2">
                  {sectors.map((sector) => {
                    const isSelected = formSectorId === sector.id
                    return (
                      <button
                        key={sector.id}
                        type="button"
                        onClick={() => setFormSectorId(sector.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          isSelected
                            ? 'border-zinc-900 bg-zinc-900 text-white'
                            : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                        }`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sector.color }}
                        />
                        {sector.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Avatar Color */}
            <div className="space-y-2">
              <Label>Cor do avatar</Label>
              <div className="flex gap-2">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormColor(color)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      formColor === color
                        ? 'ring-2 ring-offset-2 ring-zinc-900 scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formName.trim()}>
              {editingProfile ? 'Salvar' : 'Criar perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
