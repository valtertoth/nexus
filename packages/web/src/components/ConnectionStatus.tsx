import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useConnectionStore } from '@/stores/connectionStore'

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const [showDisconnected, setShowDisconnected] = useState(false)
  const realtimeConnected = useConnectionStore((s) => s.realtimeConnected)
  const hasEverConnectedRef = useRef(false)
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track first successful connection and debounce disconnection display
  useEffect(() => {
    if (realtimeConnected) {
      hasEverConnectedRef.current = true
      // Clear any pending disconnect timer
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current)
        disconnectTimerRef.current = null
      }
      // If we were showing disconnected, show reconnected briefly
      if (showDisconnected) {
        setShowDisconnected(false)
        setShowReconnected(true)
        setTimeout(() => setShowReconnected(false), 3000)
      }
    } else if (hasEverConnectedRef.current && !disconnectTimerRef.current) {
      // Only show after 3s of sustained disconnection (avoid flickers)
      disconnectTimerRef.current = setTimeout(() => {
        setShowDisconnected(true)
        disconnectTimerRef.current = null
      }, 3000)
    }

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current)
      }
    }
  }, [realtimeConnected, showDisconnected])

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

  // Browser offline
  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-red-500 text-white transition-all duration-300">
        <WifiOff className="w-3.5 h-3.5" />
        Sem conexão — tentando reconectar...
      </div>
    )
  }

  // Realtime disconnected for >3s (after having connected at least once)
  if (showDisconnected) {
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
