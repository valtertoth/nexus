import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/supabase'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

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

function apiFetch(path: string, options?: RequestInit) {
  const headers = getAuthHeaders()
  return fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers || {}),
    },
  })
}

// Cache tag definitions globally (they rarely change)
let cachedTags: TagDefinition[] | null = null

export async function fetchAllTags(): Promise<TagDefinition[]> {
  if (cachedTags) return cachedTags
  const res = await apiFetch('/api/tags')
  if (!res.ok) return []
  const data = await res.json()
  cachedTags = data.tags
  return data.tags
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
      const res = await apiFetch(`/api/tags/conversation/${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setAppliedTags(data.tags)
      }
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
      const res = await apiFetch(`/api/tags/conversation/${conversationId}`, {
        method: 'POST',
        body: JSON.stringify({ tag_slug: tagSlug }),
      })
      if (res.ok) {
        await fetchTags()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Erro ao adicionar tag')
      }
    },
    [conversationId, fetchTags]
  )

  const removeTag = useCallback(
    async (tagSlug: string) => {
      if (!conversationId) return
      const res = await apiFetch(`/api/tags/conversation/${conversationId}/${tagSlug}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setAppliedTags((prev) => prev.filter((t) => t.tag_slug !== tagSlug))
      }
    },
    [conversationId]
  )

  const fetchSuggestions = useCallback(
    async (outcome: string): Promise<TagSuggestion[]> => {
      if (!conversationId) return []
      const res = await apiFetch(`/api/tags/conversation/${conversationId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.suggestions || []
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
