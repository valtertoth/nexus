import { create } from 'zustand'

interface ConnectionState {
  browserOnline: boolean
  realtimeConnected: boolean
  setBrowserOnline: (online: boolean) => void
  setRealtimeConnected: (connected: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  realtimeConnected: true,
  setBrowserOnline: (online) => set({ browserOnline: online }),
  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),
}))
