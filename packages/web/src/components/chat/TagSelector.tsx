import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tag, X, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useAllTags,
  type TagDefinition,
  type ConversationTag,
  type TagSuggestion,
} from '@/hooks/useConversationTags'

const DIMENSION_CONFIG: Record<string, { label: string; required: boolean }> = {
  service_type: { label: 'Tipo de Atendimento', required: false },
  lead_quality: { label: 'Qualidade do Lead', required: false },
  loss_reason: { label: 'Motivo da Perda', required: false },
  win_reason: { label: 'Motivo do Fechamento', required: false },
}

const ACCOUNTABILITY_COLORS: Record<string, string> = {
  marketing: 'bg-blue-50 border-blue-200 text-blue-700',
  sales: 'bg-orange-50 border-orange-200 text-orange-700',
  market: 'bg-zinc-50 border-zinc-200 text-zinc-600',
  neutral: 'bg-zinc-50 border-zinc-200 text-zinc-600',
}

interface TagSelectorProps {
  /** Currently applied tags */
  appliedTags: ConversationTag[]
  /** AI-suggested tags (shown as suggestions) */
  suggestions?: TagSuggestion[]
  /** Outcome context — hides irrelevant dimensions */
  outcome?: 'converted' | 'lost' | 'problem' | null
  onAdd: (slug: string) => Promise<void>
  onRemove: (slug: string) => void
  compact?: boolean
}

export function TagSelector({
  appliedTags,
  suggestions = [],
  outcome,
  onAdd,
  onRemove,
  compact = false,
}: TagSelectorProps) {
  const { byDimension, loading } = useAllTags()
  const [expanded, setExpanded] = useState(!compact)
  const [adding, setAdding] = useState<string | null>(null)

  if (loading) return null

  // Filter dimensions based on outcome context
  const visibleDimensions = Object.entries(byDimension).filter(([dim]) => {
    if (dim === 'win_reason' && outcome !== 'converted') return false
    if (dim === 'loss_reason' && outcome === 'converted') return false
    return true
  })

  const appliedSlugs = new Set(appliedTags.map((t) => t.tag_slug))
  const suggestedSlugs = new Set(suggestions.map((s) => s.slug))

  const handleAdd = async (slug: string) => {
    setAdding(slug)
    await onAdd(slug)
    setAdding(null)
  }

  return (
    <div className="space-y-3">
      {/* Applied tags */}
      {appliedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {appliedTags.map((tag) => (
            <AppliedTagBadge key={tag.tag_slug} tag={tag} onRemove={() => onRemove(tag.tag_slug)} />
          ))}
        </div>
      )}

      {/* AI suggestions (not yet applied) */}
      {suggestions.filter((s) => !appliedSlugs.has(s.slug)).length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
            Sugestões da IA
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions
              .filter((s) => !appliedSlugs.has(s.slug))
              .map((s) => (
                <button
                  key={s.slug}
                  onClick={() => handleAdd(s.slug)}
                  disabled={adding === s.slug}
                  title={s.reasoning}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border-2 border-dashed',
                    'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors',
                    adding === s.slug && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="text-amber-400">✦</span>
                  {s.label}
                  <span className="text-amber-400 text-[9px]">{Math.round(s.confidence * 100)}%</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Tag picker */}
      {compact && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <Tag className="w-3 h-3" />
          Adicionar tags
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      )}

      {expanded && (
        <div className="space-y-3">
          {visibleDimensions.map(([dim, dimTags]) => {
            const config = DIMENSION_CONFIG[dim]
            const available = dimTags.filter((t) => !appliedSlugs.has(t.slug))
            if (available.length === 0) return null

            return (
              <div key={dim}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
                  {config?.label || dim}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {available.map((tag) => (
                    <TagOption
                      key={tag.slug}
                      tag={tag}
                      isSuggested={suggestedSlugs.has(tag.slug)}
                      isAdding={adding === tag.slug}
                      onAdd={() => handleAdd(tag.slug)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AppliedTagBadge({
  tag,
  onRemove,
}: {
  tag: ConversationTag
  onRemove: () => void
}) {
  const accountabilityClass = ACCOUNTABILITY_COLORS[tag.accountability || 'neutral']

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium',
        accountabilityClass
      )}
    >
      {tag.tagged_by_ai && <span className="opacity-60">✦</span>}
      {tag.tag_label}
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}

function TagOption({
  tag,
  isSuggested,
  isAdding,
  onAdd,
}: {
  tag: TagDefinition
  isSuggested: boolean
  isAdding: boolean
  onAdd: () => void
}) {
  const accountabilityClass = ACCOUNTABILITY_COLORS[tag.accountability || 'neutral']

  return (
    <button
      onClick={onAdd}
      disabled={isAdding}
      className={cn(
        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all',
        isSuggested
          ? 'border-dashed border-2 ' + accountabilityClass
          : 'border bg-white text-zinc-600 hover:bg-zinc-50 border-zinc-200',
        isAdding && 'opacity-50 cursor-not-allowed'
      )}
    >
      {tag.emoji && <span>{tag.emoji}</span>}
      {tag.label}
    </button>
  )
}

/**
 * Compact inline tag display (for conversation list items)
 */
export function ConversationTagsDisplay({ tags }: { tags: ConversationTag[] }) {
  if (tags.length === 0) return null
  const visible = tags.slice(0, 3)
  const rest = tags.length - 3

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visible.map((tag) => (
        <span
          key={tag.tag_slug}
          className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500"
        >
          {'emoji' in tag && (tag as Record<string, unknown>).emoji ? `${(tag as Record<string, unknown>).emoji} ` : ''}
          {tag.tag_label}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[9px] text-zinc-400">+{rest}</span>
      )}
    </div>
  )
}
