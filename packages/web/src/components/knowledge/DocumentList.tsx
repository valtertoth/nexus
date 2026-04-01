import { useEffect, useState, useCallback } from 'react'
import { FileText, FileSpreadsheet, File, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import type { KnowledgeDocument } from '@nexus/shared'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface DocumentListProps {
  orgId: string
  sectorId: string
  refreshTrigger?: number
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return FileSpreadsheet
  }
  return FileText
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentList({ orgId, sectorId, refreshTrigger }: DocumentListProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('org_id', orgId)
      .eq('sector_id', sectorId)
      .order('created_at', { ascending: false })

    setDocuments((data || []) as KnowledgeDocument[])
    setLoading(false)
  }, [orgId, sectorId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments, refreshTrigger])

  // Realtime subscription for status updates
  useEffect(() => {
    const channel = supabase
      .channel(`knowledge_${sectorId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'knowledge_documents',
          filter: `sector_id=eq.${sectorId}`,
        },
        (payload) => {
          const updated = payload.new as KnowledgeDocument
          setDocuments((prev) =>
            prev.map((d) => (d.id === updated.id ? updated : d))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sectorId])

  const handleDelete = useCallback(async (documentId: string) => {
    setActionLoading(documentId)
    try {
      const headers = getAuthHeaders()

      const res = await fetch(`${API_BASE}/api/knowledge/documents/${documentId}`, {
        method: 'DELETE',
        headers,
      })

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== documentId))
      }
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleReprocess = useCallback(async (documentId: string) => {
    setActionLoading(documentId)
    try {
      const headers = getAuthHeaders()

      await fetch(`${API_BASE}/api/knowledge/documents/${documentId}/reprocess`, {
        method: 'POST',
        headers,
      })

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId ? { ...d, status: 'processing' as const, chunks_count: 0 } : d
        )
      )
    } finally {
      setActionLoading(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <FileText className="h-5 w-5 text-zinc-400" />
        </div>
        <p className="mt-3 text-sm font-medium text-zinc-900">Nenhum documento</p>
        <p className="mt-1 text-xs text-zinc-500">
          Faça upload de documentos para treinar a IA deste setor.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const Icon = getFileIcon(doc.mime_type)
        const isActioning = actionLoading === doc.id

        return (
          <div
            key={doc.id}
            className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:bg-zinc-50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100">
              <Icon className="h-4 w-4 text-zinc-500" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">
                {doc.filename}
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{formatSize(doc.file_size)}</span>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(doc.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="shrink-0">
              {doc.status === 'pending' && (
                <Badge variant="outline" className="text-zinc-500 border-zinc-300">
                  Pendente
                </Badge>
              )}
              {doc.status === 'processing' && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Processando
                </Badge>
              )}
              {doc.status === 'ready' && (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                  {doc.chunks_count} chunks
                </Badge>
              )}
              {doc.status === 'error' && (
                <Badge variant="destructive" className="text-xs">
                  Erro
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isActioning}
                onClick={() => handleReprocess(doc.id)}
                aria-label="Reprocessar documento"
              >
                {isActioning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={isActioning}
                onClick={() => handleDelete(doc.id)}
                aria-label="Excluir documento"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
