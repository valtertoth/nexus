import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Profile {
  id: string
  name: string
  role: 'vendedor' | 'financeiro' | 'suporte' | 'admin'
  sectorId: string | null
  sectorName: string | null
  avatarColor: string
}

interface ProfileStore {
  profiles: Profile[]
  activeProfileId: string | null
  setActiveProfile: (id: string | null) => void
  addProfile: (profile: Profile) => void
  updateProfile: (id: string, data: Partial<Omit<Profile, 'id'>>) => void
  removeProfile: (id: string) => void
  clearActiveProfile: () => void
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      profiles: [],
      activeProfileId: null,

      setActiveProfile: (id) => set({ activeProfileId: id }),

      addProfile: (profile) =>
        set((state) => ({ profiles: [...state.profiles, profile] })),

      updateProfile: (id, data) =>
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        })),

      removeProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          activeProfileId:
            state.activeProfileId === id ? null : state.activeProfileId,
        })),

      clearActiveProfile: () => set({ activeProfileId: null }),
    }),
    {
      name: 'nexus-profiles',
    }
  )
)

export const useActiveProfile = () =>
  useProfileStore((s) =>
    s.profiles.find((p) => p.id === s.activeProfileId) ?? null
  )
