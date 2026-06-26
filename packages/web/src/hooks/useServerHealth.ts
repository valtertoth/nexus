import { useEffect, useRef } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { checkServerHealth } from '@/lib/api'

const PING_INTERVAL_MS = 30_000

export function useServerHealth() {
  const setServerConnected = useConnectionStore((s) => s.setServerConnected)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const check = async () => {
      const ok = await checkServerHealth()
      setServerConnected(ok)
    }

    // Ping immediately on mount
    void check()

    // Ping every 30 seconds
    intervalRef.current = setInterval(() => void check(), PING_INTERVAL_MS)

    // Ping immediately when browser comes back online
    const handleOnline = () => void check()
    window.addEventListener('online', handleOnline)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      window.removeEventListener('online', handleOnline)
    }
  }, [setServerConnected])
}
