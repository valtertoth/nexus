// ============================================
// AI Engine Types
// ============================================

import type { AiMode } from './database.js'

export type { AiMode }

export interface AiSuggestion {
  text: string
  sources: AiSuggestionSource[]
  model: string
  tokens: {
    prompt: number
    completion: number
    total: number
  }
  latencyMs: number
}

export interface AiSuggestionSource {
  documentName: string
  chunkId: string
  similarity: number
  page?: number
  content: string
}

export interface RagSearchResult {
  id: string
  documentId: string
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export interface SectorPromptConfig {
  sectorId: string
  sectorName: string
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
}

export interface AiGenerateRequest {
  conversationId: string
  latestMessage: string
  sectorId: string
  orgId: string
}

export interface AiGenerateResponse {
  suggestion: string
  sources: AiSuggestionSource[]
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  latencyMs: number
}

export interface EmbeddingRequest {
  text: string
  model?: string
}

export interface ChunkingOptions {
  maxTokens?: number
  overlap?: number
}
