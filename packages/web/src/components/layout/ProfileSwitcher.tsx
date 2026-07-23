import { useState, useRef, useEffect } from 'react'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { ChevronUp, LogOut } from 'lucide-react'

interface ProfileSwitcherProps {
  expanded: boolean
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Dono',
  admin: 'Gerente',
  agent: 'Vendedor',
}

export function ProfileSwitcher({ expanded }: ProfileSwitcherProps) {
  const { profile, signOut } = useAuthContext()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
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

  async function handleSignOut() {
    setOpen(false)
    await signOut()
  }

  if (!profile) return null

  const displayName = profile.name || profile.email
  const roleLabel = ROLE_LABEL[profile.role] || 'Membro'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 bg-zinc-600 overflow-hidden">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitials(displayName)
          )}
        </div>

        {expanded && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-zinc-200 truncate">{displayName}</p>
              <p className="text-[11px] text-zinc-500 truncate">{roleLabel}</p>
            </div>
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-50 py-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-sm text-zinc-200 truncate">{displayName}</p>
            <p className="text-[11px] text-zinc-500 truncate">{profile.email}</p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 mt-1 hover:bg-zinc-800 transition-colors text-left text-red-400 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
