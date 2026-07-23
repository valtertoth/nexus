import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { MessageCircle, CheckCircle2, Rocket } from 'lucide-react'

interface StepTestProps {
  onComplete: () => void
}

export function StepTest({ onComplete }: StepTestProps) {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('Ola! Esta e uma mensagem de teste da Central. Se voce recebeu, tudo esta funcionando! 🚀')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!phone.trim()) return
    setStatus('sending')
    setError('')

    try {
      await api.post('/api/whatsapp/send-test', {
        to: phone.replace(/\D/g, ''),
        text: message,
      })
      setStatus('sent')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro de conexao com o servidor')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
        <MessageCircle className="w-8 h-8 text-blue-500" />
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Enviar Mensagem Teste</h2>
      <p className="text-sm text-zinc-400 mb-8 text-center max-w-md">
        Verifique que tudo esta funcionando enviando uma mensagem de teste.
      </p>

      <div className="w-full max-w-md space-y-4">
        {status === 'sent' ? (
          /* Success state */
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-medium text-zinc-200">Mensagem enviada!</p>
              <p className="text-sm text-zinc-400 mt-1">Confira no WhatsApp do numero +{phone.replace(/\D/g, '')}</p>
            </div>
            <Button onClick={onComplete} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Rocket className="w-4 h-4" />
              Concluir e comecar a usar
            </Button>
          </div>
        ) : (
          /* Input state */
          <>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Numero WhatsApp (com DDD)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5511999999999"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
              />
              <p className="text-[11px] text-zinc-600 mt-1">Codigo do pais + DDD + numero, sem espacos</p>
            </div>

            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Mensagem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={onComplete} variant="outline" className="flex-1 border-zinc-700 text-zinc-400 hover:text-zinc-200">
                Pular
              </Button>
              <Button onClick={handleSend} disabled={!phone.trim() || status === 'sending'} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                {status === 'sending' ? 'Enviando...' : 'Enviar teste'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
