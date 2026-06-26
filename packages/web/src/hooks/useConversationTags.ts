import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

export interface TagDefinition {
  id: string
  slug: string
  label: string
  dimension: 'service_type' | 'lead_quality' | 'loss_reason' | 'win_reason'
  accountability: 'marketing' | 'sales' | 'market' | 'neutral' | null
  color: string
  emoji: string | null
  sort_order: number
}

export interface ConversationTag {
  id: string
  conversation_id: string
  tag_slug: string
  tag_label: string
  dimension: string
  accountability: string | null
  tagged_by: string | null
  tagged_by_ai: boolean
  ai_confidence: number | null
  created_at: string
}

export interface TagSuggestion {
  slug: string
  label: string
  dimension: string
  accountability: string | null
  confidence: number
  reasoning: string
}

// Cache tag definitions globally (they rarely change)
let cachedTags: TagDefinition[] | null = null

export async function fetchAllTags(): Promise<TagDefinition[]> {
  if (cachedTags) return cachedTags
  try {
    const data = await api.get<{ tags: TagDefinition[] }>('/api/tags')
    cachedTags = data.tags
    return data.tags
  } catch {
    return []
  }
}

export function invalidateTagCache() {
  cachedTags = null
}

export function useAllTags() {
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllTags()
      .then(setTags)
      .finally(() => setLoading(false))
  }, [])

  const byDimension = tags.reduce<Record<string, TagDefinition[]>>((acc, tag) => {
    if (!acc[tag.dimension]) acc[tag.dimension] = []
    acc[tag.dimension].push(tag)
    return acc
  }, {})

  return { tags, byDimension, loading }
}

export function useConversationTags(conversationId: string | null) {
  const [appliedTags, setAppliedTags] = useState<ConversationTag[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTags = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    try {
      const data = await api.get<{ tags: ConversationTag[] }>(`/api/tags/conversation/${conversationId}`)
      setAppliedTags(data.tags)
    } catch {
      // silently fail on fetch — keep previous tags
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const addTag = useCallback(
    async (tagSlug: string) => {
      if (!conversationId) return
      try {
        await api.post(`/api/tags/conversation/${conversationId}`, { tag_slug: tagSlug })
        await fetchTags()
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Erro ao adicionar tag'
        toast.error(message)
      }
    },
    [conversationId, fetchTags]
  )

  const removeTag = useCallback(
    async (tagSlug: string) => {
      if (!conversationId) return
      try {
        await api.delete(`/api/tags/conversation/${conversationId}/${tagSlug}`)
        setAppliedTags((prev) => prev.filter((t) => t.tag_slug !== tagSlug))
      } catch {
        // silently fail — tag stays in list
      }
    },
    [conversationId]
  )

  const fetchSuggestions = useCallback(
    async (outcome: string): Promise<TagSuggestion[]> => {
      if (!conversationId) return []
      try {
        const data = await api.post<{ suggestions: TagSuggestion[] }>(
          `/api/tags/conversation/${conversationId}/suggest`,
          { outcome },
        )
        return data.suggestions || []
      } catch {
        return []
      }
    },
    [conversationId]
  )

  return {
    appliedTags,
    loading,
    addTag,
    removeTag,
    fetchSuggestions,
    refetch: fetchTags,
  }
}
