import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { useProfileStore, useActiveProfile } from '@/stores/profileStore'
import { ChevronUp, LogOut, Users, Check } from 'lucide-react'

interface ProfileSwitcherProps {
  expanded: boolean
}

export function ProfileSwitcher({ expanded }: ProfileSwitcherProps) {
  const navigate = useNavigate()
  const { signOut } = useAuthContext()
  const activeProfile = useActiveProfile()
  const { profiles, setActiveProfile, clearActiveProfile } = useProfileStore()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  function handleSwitchProfile(id: string) {
    setActiveProfile(id)
    setOpen(false)
  }

  function handleManageProfiles() {
    clearActiveProfile()
    setOpen(false)
    navigate('/profile-select')
  }

  async function handleSignOut() {
    clearActiveProfile()
    setOpen(false)
    await signOut()
  }

  if (!activeProfile) return null

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ backgroundColor: activeProfile.avatarColor }}
        >
          {getInitials(activeProfile.name)}
        </div>

        {expanded && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-zinc-200 truncate">
                {activeProfile.name}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">
                {activeProfile.sectorName || 'Todos os setores'}
              </p>
            </div>
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </>
        )}
      </button>

      {/* Menu */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-50 py-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <p className="px-3 py-1.5 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
            Trocar perfil
          </p>

          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => handleSwitchProfile(profile.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                style={{ backgroundColor: profile.avatarColor }}
              >
                {getInitials(profile.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{profile.name}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {profile.sectorName || 'Todos os setores'}
                </p>
              </div>
              {profile.id === activeProfile.id && (
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              )}
            </button>
          ))}

          <div className="h-px bg-zinc-800 my-1" />

          <button
            onClick={handleManageProfiles}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 transition-colors text-left text-zinc-300 text-sm"
          >
            <Users className="w-4 h-4" />
            Gerenciar perfis
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 transition-colors text-left text-red-400 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
