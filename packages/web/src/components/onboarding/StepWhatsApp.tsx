import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { CheckCircle2 } from 'lucide-react'

interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  phoneNumber: string | null
  profileName: string | null
  qrDataUrl: string | null
  lastError: string | null
}

interface StepWhatsAppProps {
  onComplete: () => void
}

export function StepWhatsApp({ onComplete }: StepWhatsAppProps) {
  const [conn, setConn] = useState<ConnectionStatus>({
    status: 'disconnected', phoneNumber: null, profileName: null, qrDataUrl: null, lastError: null,
  })
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<ConnectionStatus>('/api/whatsapp/status')
      setConn(data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Auto-advance when connected
  useEffect(() => {
    if (conn.status === 'connected') {
      const timer = setTimeout(onComplete, 1500)
      return () => clearTimeout(timer)
    }
  }, [conn.status, onComplete])

  const handleConnect = async () => {
    setLoading(true)
    try {
      const data = await api.post<{ error?: string }>('/api/whatsapp/connect')
      if (data.error) setConn((p) => ({ ...p, lastError: data.error ?? null }))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao iniciar conexao'
      setConn((p) => ({ ...p, lastError: message }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fillRule="evenodd"/>
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Conectar WhatsApp</h2>
      <p className="text-sm text-zinc-400 mb-8 text-center max-w-md">
        Vincule o WhatsApp do seu negocio a Central escaneando o QR Code.
      </p>

      <div className="w-full max-w-sm">
        {/* Connected */}
        {conn.status === 'connected' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Conectado!</p>
              <p className="text-xs text-zinc-500 font-mono mt-1">+{conn.phoneNumber}</p>
            </div>
            <p className="text-xs text-zinc-500">Avancando automaticamente...</p>
          </div>
        )}

        {/* QR Code */}
        {conn.status === 'qr_ready' && conn.qrDataUrl && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="bg-white rounded-xl p-3">
                <img src={conn.qrDataUrl} alt="QR Code" className="w-56 h-56" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm text-zinc-300">Abra o WhatsApp no celular</p>
              <p className="text-xs text-zinc-500">Configuracoes &gt; Dispositivos vinculados &gt; Vincular</p>
            </div>
          </div>
        )}

        {/* Disconnected */}
        {conn.status === 'disconnected' && (
          <div className="space-y-4">
            {conn.lastError && (
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                <p className="text-xs text-red-400">{conn.lastError}</p>
              </div>
            )}
            <Button onClick={handleConnect} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? 'Iniciando...' : 'Gerar QR Code'}
            </Button>
          </div>
        )}

        {/* Connecting */}
        {conn.status === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">Gerando QR Code...</p>
          </div>
        )}
      </div>
    </div>
  )
}
