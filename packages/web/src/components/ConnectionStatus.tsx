import { useState, useEffect } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connectionStore'

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const realtimeConnected = useConnectionStore((s) => s.realtimeConnected)

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

  // Show realtime disconnection warning (browser online but WS down)
  if (online && !realtimeConnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-amber-500 text-white transition-all duration-300">
        <WifiOff className="w-3.5 h-3.5" />
        Reconectando ao servidor...
      </div>
    )
  }

  if (online && !showReconnected) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium transition-all duration-300',
        online
          ? 'bg-emerald-500 text-white'
          : 'bg-red-500 text-white'
      )}
    >
      {online ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          Conexão restabelecida
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          Sem conexão — tentando reconectar...
        </>
      )}
    </div>
  )
}
