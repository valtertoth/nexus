import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { getAuthHeaders } from '@/lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  phoneNumber: string | null
  profileName: string | null
  qrDataUrl: string | null
  lastError: string | null
}

export default function WhatsAppConnect() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected',
    phoneNumber: null,
    profileName: null,
    qrDataUrl: null,
    lastError: null,
  })
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_URL}/api/whatsapp/status`, { headers })
      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data)
      }
    } catch {
      // silently fail on status check
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleConnect = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_URL}/api/whatsapp/connect`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (data.error) {
        setConnectionStatus((prev) => ({ ...prev, lastError: data.error }))
      }
    } catch (err) {
      setConnectionStatus((prev) => ({
        ...prev,
        lastError: 'Erro ao iniciar conexao',
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      await fetch(`${API_URL}/api/whatsapp/disconnect`, {
        method: 'POST',
        headers,
      })
      setConnectionStatus({
        status: 'disconnected',
        phoneNumber: null,
        profileName: null,
        qrDataUrl: null,
        lastError: null,
      })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const statusLabels: Record<string, { text: string; color: string }> = {
    disconnected: { text: 'Desconectado', color: 'bg-zinc-500' },
    connecting: { text: 'Conectando...', color: 'bg-amber-500' },
    qr_ready: { text: 'Aguardando leitura do QR Code', color: 'bg-blue-500' },
    connected: { text: 'Conectado', color: 'bg-emerald-500' },
  }

  const currentLabel = statusLabels[connectionStatus.status] || statusLabels.disconnected

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            Conexao WhatsApp
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Conecte o WhatsApp ao Nexus via QR Code
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          {/* Status indicator */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-2.5 h-2.5 rounded-full ${currentLabel.color}`} />
            <span className="text-sm font-medium text-zinc-300">
              {currentLabel.text}
            </span>
          </div>

          {/* Connected state */}
          {connectionStatus.status === 'connected' && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Numero</span>
                  <span className="text-sm text-zinc-200 font-mono">
                    +{connectionStatus.phoneNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Perfil</span>
                  <span className="text-sm text-zinc-200">
                    {connectionStatus.profileName || '--'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 text-center">
                Mensagens recebidas aparecerao automaticamente na Inbox.
              </p>
              <Button
                onClick={handleDisconnect}
                disabled={loading}
                variant="outline"
                className="w-full border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
              >
                {loading ? 'Desconectando...' : 'Desconectar'}
              </Button>
            </div>
          )}

          {/* QR Code state */}
          {connectionStatus.status === 'qr_ready' && connectionStatus.qrDataUrl && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-white rounded-xl p-3">
                  <img
                    src={connectionStatus.qrDataUrl}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64"
                  />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-zinc-300">
                  Abra o WhatsApp no celular
                </p>
                <p className="text-xs text-zinc-500">
                  Configuracoes {'>'} Dispositivos vinculados {'>'} Vincular dispositivo
                </p>
                <p className="text-xs text-zinc-500">
                  Aponte a camera para o QR Code acima
                </p>
              </div>
            </div>
          )}

          {/* Disconnected state */}
          {connectionStatus.status === 'disconnected' && (
            <div className="space-y-4">
              {connectionStatus.lastError && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                  <p className="text-xs text-red-400">{connectionStatus.lastError}</p>
                </div>
              )}
              <Button
                onClick={handleConnect}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? 'Iniciando...' : 'Conectar WhatsApp'}
              </Button>
              <p className="text-xs text-zinc-500 text-center">
                Voce precisara escanear um QR Code com o WhatsApp do celular.
                O Nexus funcionara como um dispositivo vinculado.
              </p>
            </div>
          )}

          {/* Connecting state */}
          {connectionStatus.status === 'connecting' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Gerando QR Code...</p>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-600">
            Conexao via protocolo WhatsApp Web. Seu WhatsApp continua funcionando normalmente no celular.
          </p>
        </div>
      </div>
    </div>
  )
}
