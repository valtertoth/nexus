import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { usePresence } from '@/hooks/usePresence'
import { getInitials } from '@nexus/shared'
import type { User, Sector, UserRole } from '@nexus/shared'
import { Loader2, UserPlus, Shield, ShieldCheck, UserCog } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Proprietário',
  admin: 'Admin',
  agent: 'Atendente',
}

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  owner: Shield,
  admin: ShieldCheck,
  agent: UserCog,
}

export function TeamTab() {
  const { profile } = useAuthContext()
  const { isUserOnline } = usePresence()
  const [members, setMembers] = useState<User[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [loading, setLoading] = useState(true)

  const orgId = profile?.org_id || ''

  const fetchMembers = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }

    const [membersRes, sectorsRes] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('org_id', orgId)
        .order('role', { ascending: true }),
      supabase
        .from('sectors')
        .select('*')
        .eq('org_id', orgId)
        .order('name'),
    ])

    setMembers((membersRes.data || []) as User[])
    setSectors((sectorsRes.data || []) as Sector[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return
    setInviting(true)

    // In MVP, we create the user record (they'll need to sign up separately)
    // A proper implementation would send an email invitation
    // For now, show a placeholder
    alert(`Convite enviado para ${inviteEmail}\n\n(Em produção, isso enviaria um email de convite)`)

    setInviteEmail('')
    setInviting(false)
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId)
      .eq('org_id', orgId)

    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
    )
  }

  const handleSectorChange = async (userId: string, sectorId: string | null) => {
    await supabase
      .from('users')
      .update({ sector_id: sectorId })
      .eq('id', userId)
      .eq('org_id', orgId)

    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, sector_id: sectorId } : m))
    )
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-[120px] w-full rounded-lg" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-100 px-4 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Invite */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Convidar membro</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@empresa.com"
              />
            </div>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} size="sm">
              {inviting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Convidar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team members */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Equipe ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => {
            const online = isUserOnline(member.id)
            const RoleIcon = ROLE_ICONS[member.role]
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-100 px-4 py-3"
              >
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-zinc-100 text-zinc-600 text-xs">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  {online && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{member.name}</p>
                  <p className="text-xs text-zinc-500">{member.email}</p>
                </div>

                {/* Sector select */}
                <select
                  value={member.sector_id || ''}
                  onChange={(e) =>
                    handleSectorChange(member.id, e.target.value || null)
                  }
                  className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
                >
                  <option value="">Sem setor</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {/* Role select */}
                {member.id !== profile?.id ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleRoleChange(member.id, e.target.value as UserRole)
                    }
                    className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
                  >
                    <option value="agent">Atendente</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <RoleIcon className="mr-1 h-3 w-3" />
                    {ROLE_LABELS[member.role]}
                  </Badge>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
