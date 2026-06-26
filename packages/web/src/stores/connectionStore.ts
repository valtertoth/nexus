import { create } from 'zustand'

interface ConnectionState {
  browserOnline: boolean
  realtimeConnected: boolean
  serverConnected: boolean
  setBrowserOnline: (online: boolean) => void
  setRealtimeConnected: (connected: boolean) => void
  setServerConnected: (connected: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  realtimeConnected: true,
  serverConnected: true,
  setBrowserOnline: (online) => set({ browserOnline: online }),
  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),
  setServerConnected: (connected) => set({ serverConnected: connected }),
}))
