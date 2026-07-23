import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Users, UserPlus, Trash2, Loader2, Copy, Check } from 'lucide-react'

interface Member {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'agent'
  is_online: boolean | null
  last_seen_at: string | null
  created_at: string
}

const ROLE_LABEL: Record<Member['role'], string> = {
  owner: 'Proprietário',
  admin: 'Gerente',
  agent: 'Atendente',
}

const ROLE_VARIANT: Record<Member['role'], 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  agent: 'outline',
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function Team() {
  const { profile } = useAuthContext()
  const isOwner = profile?.role === 'owner'

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'agent'>('agent')
  const [inviting, setInviting] = useState(false)

  // Result dialog (temp password)
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadMembers() {
    try {
      const data = await api.get<{ members: Member[] }>('/api/team/members')
      setMembers(data.members)
    } catch {
      toast.error('Erro ao carregar a equipe.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await api.post<{ member: Member; tempPassword: string }>(
        '/api/team/invite',
        { email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole },
      )
      setMembers((prev) => [...prev, res.member])
      setInviteResult({ email: res.member.email, password: res.tempPassword })
      setInviteEmail('')
      setInviteName('')
      setInviteRole('agent')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao convidar membro.'
      toast.error(message)
    } finally {
      setInviting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/team/member/${deleteTarget.id}`)
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id))
      toast.success('Membro removido.')
      setDeleteTarget(null)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao remover membro.'
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  function copyPassword() {
    if (!inviteResult) return
    navigator.clipboard.writeText(inviteResult.password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-zinc-500" />
        <h1 className="text-xl font-semibold text-zinc-900">Equipe</h1>
      </div>

      {/* Invite form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Convidar membro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="pessoa@empresa.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nome (opcional)</Label>
              <Input
                id="invite-name"
                placeholder="Nome do membro"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'agent')}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Atendente</SelectItem>
                  <SelectItem value="admin">Gerente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Convidar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Membros ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {getInitials(m.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 truncate">{m.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{m.email}</p>
                  </div>
                  <Badge variant={ROLE_VARIANT[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                  {isOwner && m.id !== profile?.id && (
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50"
                      aria-label="Remover membro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Temp password dialog */}
      <Dialog open={!!inviteResult} onOpenChange={(o) => !o && setInviteResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Membro criado</DialogTitle>
            <DialogDescription>
              Envie estas credenciais para <strong>{inviteResult?.email}</strong>. Peça que troque a
              senha após o primeiro acesso. Esta senha não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteResult?.password || ''} className="font-mono text-sm" />
            <Button type="button" variant="outline" size="icon" onClick={copyPassword}>
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteResult(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover membro</DialogTitle>
            <DialogDescription>
              Remover <strong>{deleteTarget?.name}</strong> da equipe? O acesso será revogado
              imediatamente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
