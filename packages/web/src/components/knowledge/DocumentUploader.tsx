import { useCallback, useState, useRef } from 'react'
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface FileUpload {
  file: File
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error'
  progress: number
  error?: string
}

interface DocumentUploaderProps {
  orgId: string
  sectorId: string
  onUploadComplete?: () => void
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.xls,.csv,.txt,.md'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function DocumentUploader({ orgId, sectorId, onUploadComplete }: DocumentUploaderProps) {
  const [files, setFiles] = useState<FileUpload[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const toAdd: FileUpload[] = []
    for (const file of Array.from(newFiles)) {
      if (file.size > MAX_SIZE) {
        toAdd.push({ file, status: 'error', progress: 0, error: 'Arquivo excede 10MB' })
        continue
      }
      toAdd.push({ file, status: 'pending', progress: 0 })
    }
    setFiles((prev) => [...prev, ...toAdd])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const uploadAll = useCallback(async () => {
    const headers = getAuthHeaders()
    const token = headers.Authorization?.replace('Bearer ', '')
    if (!token) return

    for (let i = 0; i < files.length; i++) {
      const upload = files[i]
      if (upload.status !== 'pending') continue

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' as const, progress: 20 } : f))
      )

      try {
        // 1. Upload to Supabase Storage
        const storagePath = `${orgId}/${sectorId}/${Date.now()}_${upload.file.name}`
        const { error: uploadError } = await supabase.storage
          .from('knowledge')
          .upload(storagePath, upload.file, {
            contentType: upload.file.type,
            upsert: false,
          })

        if (uploadError) throw new Error(uploadError.message)

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, progress: 50 } : f))
        )

        // 2. Create document record
        const { data: doc, error: insertError } = await supabase
          .from('knowledge_documents')
          .insert({
            org_id: orgId,
            sector_id: sectorId,
            filename: upload.file.name,
            file_path: storagePath,
            file_size: upload.file.size,
            mime_type: upload.file.type,
            status: 'pending',
          })
          .select('id')
          .single()

        if (insertError) throw new Error(insertError.message)

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'processing' as const, progress: 75 } : f))
        )

        // 3. Trigger ingestion
        await fetch(`${API_BASE}/api/knowledge/process`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ documentId: doc.id }),
        })

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done' as const, progress: 100 } : f))
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro no upload'
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error' as const, error: message } : f
          )
        )
      }
    }

    onUploadComplete?.()
  }, [files, orgId, sectorId, onUploadComplete])

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const hasFiles = files.length > 0

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-all cursor-pointer',
          isDragOver
            ? 'border-zinc-900 bg-zinc-50 scale-[1.01]'
            : 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50'
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            isDragOver ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
          )}
        >
          <Upload className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-900">
            {isDragOver ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            PDF, DOCX, XLSX, CSV, TXT — máximo 10MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
          className="hidden"
        />
      </div>

      {/* File List */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((upload, i) => (
            <div
              key={`${upload.file.name}-${i}`}
              className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {upload.file.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{(upload.file.size / 1024).toFixed(0)} KB</span>
                  {upload.status === 'uploading' && <span>Enviando...</span>}
                  {upload.status === 'processing' && <span>Processando...</span>}
                  {upload.status === 'done' && (
                    <span className="text-emerald-600">Enviado</span>
                  )}
                  {upload.status === 'error' && (
                    <span className="text-red-500">{upload.error}</span>
                  )}
                </div>
                {(upload.status === 'uploading' || upload.status === 'processing') && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="shrink-0">
                {upload.status === 'pending' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(i)
                    }}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {(upload.status === 'uploading' || upload.status === 'processing') && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                )}
                {upload.status === 'done' && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                {upload.status === 'error' && (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
              </div>
            </div>
          ))}

          {/* Upload Button */}
          {pendingCount > 0 && (
            <Button onClick={uploadAll} size="sm" className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              Enviar {pendingCount} {pendingCount === 1 ? 'arquivo' : 'arquivos'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
