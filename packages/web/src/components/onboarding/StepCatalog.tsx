import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { Upload, FileText, CheckCircle2, X } from 'lucide-react'

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
]

const ACCEPT_STRING = '.pdf,.docx,.xlsx,.csv,.txt,.md'

interface UploadedFile {
  name: string
  status: 'uploading' | 'done' | 'error'
}

interface StepCatalogProps {
  onComplete: () => void
}

export function StepCatalog({ onComplete }: StepCatalogProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const uploadFile = useCallback(async (file: File) => {
    setFiles((prev) => [...prev, { name: file.name, status: 'uploading' }])

    try {
      const formData = new FormData()
      formData.append('file', file)

      await api.post('/api/knowledge/upload', formData)
      setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: 'done' } : f))
    } catch {
      setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: 'error' } : f))
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => ACCEPTED_TYPES.includes(f.type))
    droppedFiles.forEach(uploadFile)
  }, [uploadFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    selected.forEach(uploadFile)
  }, [uploadFile])

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-6">
        <FileText className="w-8 h-8 text-violet-500" />
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Importar Catalogo</h2>
      <p className="text-sm text-zinc-400 mb-8 text-center max-w-md">
        Envie seus documentos de produtos para a IA consultar durante as conversas.
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            isDragging ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-700 hover:border-zinc-600'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-300">Arraste arquivos aqui</p>
          <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, XLSX, CSV, TXT</p>
          <input
            id="file-input"
            type="file"
            accept={ACCEPT_STRING}
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                <span className="text-sm text-zinc-300 truncate flex-1">{f.name}</span>
                {f.status === 'uploading' && (
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin shrink-0" />
                )}
                {f.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                {f.status === 'error' && (
                  <button onClick={() => removeFile(f.name)} className="text-red-400 hover:text-red-300">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={onComplete} variant="outline" className="flex-1 border-zinc-700 text-zinc-400 hover:text-zinc-200">
            Pular por agora
          </Button>
          {files.some((f) => f.status === 'done') && (
            <Button onClick={onComplete} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
              Continuar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
