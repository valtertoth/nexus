import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, Send, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface TemplateComponent {
  type: string
  text?: string
  format?: string
  buttons?: Array<{ type: string; text: string }>
}

interface MessageTemplate {
  name: string
  language: string
  status: string
  category: string
  id: string
  components: TemplateComponent[]
}

interface TemplatePickerProps {
  conversationId: string
  open: boolean
  onClose: () => void
}

// Conta placeholders {{1}}, {{2}}... no texto e devolve o maior índice
function countPlaceholders(text: string | undefined): number {
  if (!text) return 0
  let max = 0
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = parseInt(m[1], 10)
    if (n > max) max = n
  }
  return max
}

function componentText(tpl: MessageTemplate, type: string): string | undefined {
  return tpl.components.find((c) => c.type?.toUpperCase() === type)?.text
}

// Substitui os {{n}} por valores preenchidos, para o preview
function fillPreview(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = values[parseInt(n, 10) - 1]
    return v && v.trim() ? v : `{{${n}}}`
  })
}

export function TemplatePicker({ conversationId, open, onClose }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MessageTemplate | null>(null)
  const [headerVars, setHeaderVars] = useState<string[]>([])
  const [bodyVars, setBodyVars] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  // Carrega templates aprovados ao abrir (server cacheia 10min)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<{ templates: MessageTemplate[] }>('/api/templates')
      .then((res) => {
        if (cancelled) return
        setTemplates(res.templates || [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Erro ao listar templates')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setSelected(null)
      setHeaderVars([])
      setBodyVars([])
    }
  }, [open])

  const selectTemplate = useCallback((tpl: MessageTemplate) => {
    setSelected(tpl)
    setHeaderVars(Array(countPlaceholders(componentText(tpl, 'HEADER'))).fill(''))
    setBodyVars(Array(countPlaceholders(componentText(tpl, 'BODY'))).fill(''))
  }, [])

  const bodyText = selected ? componentText(selected, 'BODY') ?? '' : ''
  const headerText = selected ? componentText(selected, 'HEADER') ?? '' : ''
  const footerText = selected ? componentText(selected, 'FOOTER') ?? '' : ''

  const allFilled = useMemo(
    () => [...headerVars, ...bodyVars].every((v) => v.trim().length > 0),
    [headerVars, bodyVars]
  )

  const handleSend = useCallback(async () => {
    if (!selected) return
    if (!allFilled) {
      toast.error('Preencha todas as variáveis do template')
      return
    }

    // Monta components na ordem esperada pela Cloud API (header antes de body)
    const components: Array<Record<string, unknown>> = []
    if (headerVars.length > 0) {
      components.push({
        type: 'header',
        parameters: headerVars.map((text) => ({ type: 'text', text })),
      })
    }
    if (bodyVars.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyVars.map((text) => ({ type: 'text', text })),
      })
    }

    setSending(true)
    try {
      await api.post('/api/templates/send', {
        conversationId,
        templateName: selected.name,
        languageCode: selected.language,
        components: components.length > 0 ? components : undefined,
      })
      toast.success('Template enviado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar template')
    } finally {
      setSending(false)
    }
  }, [selected, allFilled, headerVars, bodyVars, conversationId, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-700 transition-colors"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {selected ? selected.name : 'Enviar template'}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? 'Preencha as variáveis e envie. Templates reabrem a conversa fora da janela de 24h.'
              : 'A janela de 24h expirou. Só templates aprovados podem ser enviados agora.'}
          </DialogDescription>
        </DialogHeader>

        {/* Lista de templates */}
        {!selected && (
          <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-500 py-6 text-center">{error}</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-400 py-6 text-center">
                Nenhum template aprovado disponível.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => selectTemplate(tpl)}
                    className="flex items-start gap-3 text-left rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 p-3 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{tpl.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-zinc-400 shrink-0">
                          {tpl.language}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {componentText(tpl, 'BODY') || tpl.category}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Formulário de variáveis + preview */}
        {selected && (
          <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {/* Preview */}
            <div className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-800 whitespace-pre-wrap break-words">
              {headerText && (
                <p className="font-semibold mb-1">{fillPreview(headerText, headerVars)}</p>
              )}
              <p>{fillPreview(bodyText, bodyVars)}</p>
              {footerText && <p className="text-xs text-zinc-400 mt-1">{footerText}</p>}
            </div>

            {headerVars.map((val, i) => (
              <div key={`h-${i}`} className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Cabeçalho — variável {i + 1}</label>
                <Input
                  value={val}
                  onChange={(e) => {
                    const next = [...headerVars]
                    next[i] = e.target.value
                    setHeaderVars(next)
                  }}
                  placeholder={`{{${i + 1}}}`}
                />
              </div>
            ))}

            {bodyVars.map((val, i) => (
              <div key={`b-${i}`} className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Variável {i + 1}</label>
                <Input
                  value={val}
                  onChange={(e) => {
                    const next = [...bodyVars]
                    next[i] = e.target.value
                    setBodyVars(next)
                  }}
                  placeholder={`{{${i + 1}}}`}
                />
              </div>
            ))}

            <Button onClick={handleSend} disabled={sending || !allFilled} className="mt-1">
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
