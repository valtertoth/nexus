import { useEffect, useState, useCallback } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { DocumentUploader } from '@/components/knowledge/DocumentUploader'
import { DocumentList } from '@/components/knowledge/DocumentList'
import type { Sector } from '@nexus/shared'
import { cn } from '@/lib/utils'

interface SectorStats {
  sectorId: string
  documentCount: number
  chunkCount: number
}

export default function Knowledge() {
  const { profile } = useAuthContext()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, SectorStats>>({})
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [loading, setLoading] = useState(true)

  const orgId = profile?.org_id || ''

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }

    async function load() {
      const { data } = await supabase
        .from('sectors')
        .select('*')
        .eq('org_id', orgId)
        .order('name')

      const sectorList = (data || []) as Sector[]
      setSectors(sectorList)

      if (sectorList.length > 0 && !selectedSectorId) {
        setSelectedSectorId(sectorList[0].id)
      }
      setLoading(false)
    }
    load()
  }, [orgId, selectedSectorId])

  useEffect(() => {
    if (!orgId || sectors.length === 0) return

    async function loadStats() {
      const newStats: Record<string, SectorStats> = {}

      for (const sector of sectors) {
        const { count: docCount } = await supabase
          .from('knowledge_documents')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('sector_id', sector.id)

        const { count: chunkCount } = await supabase
          .from('knowledge_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('sector_id', sector.id)

        newStats[sector.id] = {
          sectorId: sector.id,
          documentCount: docCount || 0,
          chunkCount: chunkCount || 0,
        }
      }

      setStats(newStats)
    }
    loadStats()
  }, [orgId, sectors, refreshTrigger])

  const handleUploadComplete = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const selectedSector = sectors.find((s) => s.id === selectedSectorId)
  const selectedStats = selectedSectorId ? stats[selectedSectorId] : null

  const totalDocs = Object.values(stats).reduce((sum, s) => sum + s.documentCount, 0)
  const totalChunks = Object.values(stats).reduce((sum, s) => sum + s.chunkCount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (sectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 max-w-sm mx-auto text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
          <Database className="h-5 w-5 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-800">Nenhum setor criado</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          A base de conhecimento e organizada por setor. Crie setores nas configuracoes
          para comecar a adicionar documentos que a IA usara para responder seus clientes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-zinc-700" />
              Base de Conhecimento
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Documentos, catalogos e referencias que a IA consulta para responder com precisao
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-semibold text-zinc-900">{totalDocs}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Documentos</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-right">
              <p className="text-2xl font-semibold text-zinc-400">{totalChunks}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Fragmentos</p>
            </div>
          </div>
        </div>

        {/* Sector Tabs */}
        <div className="mt-4 flex gap-1">
          {sectors.map((sector) => (
            <button
              key={sector.id}
              onClick={() => setSelectedSectorId(sector.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                selectedSectorId === sector.id
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              )}
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: sector.color }}
              />
              {sector.name}
              {stats[sector.id] && (
                <span
                  className={cn(
                    'ml-0.5 text-xs',
                    selectedSectorId === sector.id ? 'text-zinc-400' : 'text-zinc-400'
                  )}
                >
                  {stats[sector.id].documentCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {selectedSectorId && selectedSector && (
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <DocumentUploader
              orgId={orgId}
              sectorId={selectedSectorId}
              onUploadComplete={handleUploadComplete}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-800">
                  Documentos de {selectedSector.name}
                </h2>
                {selectedStats && selectedStats.documentCount > 0 && (
                  <span className="text-xs text-zinc-400">
                    {selectedStats.chunkCount} fragmentos indexados
                  </span>
                )}
              </div>
              <DocumentList
                orgId={orgId}
                sectorId={selectedSectorId}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
