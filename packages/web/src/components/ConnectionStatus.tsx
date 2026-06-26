import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, ServerOff } from 'lucide-react'
import { useConnectionStore } from '@/stores/connectionStore'

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const [showRealtimeDisconnected, setShowRealtimeDisconnected] = useState(false)
  const [showServerDisconnected, setShowServerDisconnected] = useState(false)
  const realtimeConnected = useConnectionStore((s) => s.realtimeConnected)
  const serverConnected = useConnectionStore((s) => s.serverConnected)
  const hasEverRealtimeConnectedRef = useRef(false)
  const hasEverServerConnectedRef = useRef(false)
  const realtimeDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track realtime connection and debounce disconnection display
  useEffect(() => {
    if (realtimeConnected) {
      hasEverRealtimeConnectedRef.current = true
      if (realtimeDisconnectTimerRef.current) {
        clearTimeout(realtimeDisconnectTimerRef.current)
        realtimeDisconnectTimerRef.current = null
      }
      if (showRealtimeDisconnected) {
        setShowRealtimeDisconnected(false)
        // Only show reconnected if server is also connected
        if (serverConnected) {
          setShowReconnected(true)
          setTimeout(() => setShowReconnected(false), 3000)
        }
      }
    } else if (hasEverRealtimeConnectedRef.current && !realtimeDisconnectTimerRef.current) {
      realtimeDisconnectTimerRef.current = setTimeout(() => {
        setShowRealtimeDisconnected(true)
        realtimeDisconnectTimerRef.current = null
      }, 3000)
    }

    return () => {
      if (realtimeDisconnectTimerRef.current) {
        clearTimeout(realtimeDisconnectTimerRef.current)
      }
    }
  }, [realtimeConnected, showRealtimeDisconnected, serverConnected])

  // Track server connection and debounce disconnection display
  useEffect(() => {
    if (serverConnected) {
      hasEverServerConnectedRef.current = true
      if (serverDisconnectTimerRef.current) {
        clearTimeout(serverDisconnectTimerRef.current)
        serverDisconnectTimerRef.current = null
      }
      if (showServerDisconnected) {
        setShowServerDisconnected(false)
        // Only show reconnected if realtime is also connected
        if (realtimeConnected) {
          setShowReconnected(true)
          setTimeout(() => setShowReconnected(false), 3000)
        }
      }
    } else if (hasEverServerConnectedRef.current && !serverDisconnectTimerRef.current) {
      serverDisconnectTimerRef.current = setTimeout(() => {
        setShowServerDisconnected(true)
        serverDisconnectTimerRef.current = null
      }, 3000)
    }

    return () => {
      if (serverDisconnectTimerRef.current) {
        clearTimeout(serverDisconnectTimerRef.current)
      }
    }
  }, [serverConnected, showServerDisconnected, realtimeConnected])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setShowReconnected(true)
      setTimeout(() => setShowReconnected(false), 3000)
    }
    const handleOffline = () => {
      setOnline(false)
      setShowReconnected(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Browser offline (highest priority)
  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-red-500 text-white transition-all duration-300">
        <WifiOff className="w-3.5 h-3.5" />
        Sem conexão — tentando reconectar...
      </div>
    )
  }

  // Server disconnected (red — takes priority over realtime)
  if (showServerDisconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-red-500 text-white transition-all duration-300">
        <ServerOff className="w-3.5 h-3.5" />
        Servidor indisponível — tentando reconectar...
      </div>
    )
  }

  // Realtime disconnected for >3s (amber — server is up but realtime dropped)
  if (showRealtimeDisconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-amber-500 text-white transition-all duration-300">
        <WifiOff className="w-3.5 h-3.5" />
        Reconectando ao servidor...
      </div>
    )
  }

  // Just reconnected (auto-hides after 3s)
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-emerald-500 text-white transition-all duration-300">
        <Wifi className="w-3.5 h-3.5" />
        Conexão restabelecida
      </div>
    )
  }

  return null
}
