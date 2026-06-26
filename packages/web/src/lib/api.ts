import { toast } from 'sonner'
import { getAuthHeaders } from './supabase'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const API_BASE = import.meta.env.VITE_API_URL || ''

const DEFAULT_TIMEOUT = 15_000
const DEFAULT_RETRY_DELAY = 1_000
const DEFAULT_GET_RETRIES = 3
const DEFAULT_MUTATION_RETRIES = 0
const HEALTH_TIMEOUT = 5_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiFetchOptions {
  method?: string
  body?: unknown
  timeout?: number
  retries?: number
  retryDelay?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  skipAuth?: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body: unknown

  constructor(message: string, status: number, statusText: string, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRetryable(status: number): boolean {
  return status >= 500
}

function jitter(base: number): number {
  return base + Math.random() * base * 0.3
}

function resolveRetries(method: string, explicit: number | undefined): number {
  if (explicit !== undefined) return explicit
  return method === 'GET' ? DEFAULT_GET_RETRIES : DEFAULT_MUTATION_RETRIES
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    timeout = DEFAULT_TIMEOUT,
    retryDelay = DEFAULT_RETRY_DELAY,
    signal: externalSignal,
    headers: extraHeaders,
    skipAuth = false,
  } = options

  const maxRetries = resolveRetries(method, options.retries)

  const url = `${API_BASE}${path}`

  const authHeaders = skipAuth ? { 'Content-Type': 'application/json' } : getAuthHeaders()

  const baseHeaders: Record<string, string> = {
    ...authHeaders,
    ...extraHeaders,
  }

  const fetchInit: RequestInit = {
    method,
    headers: baseHeaders,
  }

  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      fetchInit.body = body
      delete baseHeaders['Content-Type']
    } else {
      fetchInit.body = JSON.stringify(body)
    }
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Combine external signal with per-request timeout
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout)

    let combinedSignal: AbortSignal
    if (externalSignal) {
      // If either signal aborts, the request should abort
      const linked = new AbortController()
      const onExternalAbort = () => linked.abort()
      const onTimeoutAbort = () => linked.abort()
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true })
      combinedSignal = linked.signal
    } else {
      combinedSignal = timeoutController.signal
    }

    try {
      const response = await fetch(url, { ...fetchInit, signal: combinedSignal })

      clearTimeout(timeoutId)

      // 204 No Content — return undefined as T
      if (response.status === 204) {
        return undefined as T
      }

      // Success range
      if (response.ok) {
        const data: T = await response.json()
        return data
      }

      // 4xx — never retry, throw immediately
      if (response.status >= 400 && response.status < 500) {
        let errorBody: unknown = null
        try {
          errorBody = await response.json()
        } catch {
          // body might not be JSON
        }
        const message =
          (errorBody && typeof errorBody === 'object' && 'error' in errorBody
            ? String((errorBody as Record<string, unknown>).error)
            : null) ??
          (errorBody && typeof errorBody === 'object' && 'message' in errorBody
            ? String((errorBody as Record<string, unknown>).message)
            : null) ??
          `Request failed: ${response.status} ${response.statusText}`

        throw new ApiError(message, response.status, response.statusText, errorBody)
      }

      // 5xx — retryable
      if (isRetryable(response.status)) {
        let errorBody: unknown = null
        try {
          errorBody = await response.json()
        } catch {
          // ignore
        }
        lastError = new ApiError(
          `Server error: ${response.status} ${response.statusText}`,
          response.status,
          response.statusText,
          errorBody,
        )

        if (attempt < maxRetries) {
          const delay = jitter(retryDelay * Math.pow(2, attempt))
          console.warn(
            `[api] Retry ${attempt + 1}/${maxRetries} for ${method} ${path} after ${Math.round(delay)}ms (${response.status})`,
          )
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)

      // Already an ApiError (from 4xx/5xx handling above) — re-throw
      if (err instanceof ApiError) {
        throw err
      }

      // Abort / timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new ApiError('Request aborted', 0, 'Aborted', null)
        }
        lastError = new ApiError('Request timeout', 0, 'Timeout', null)
      } else {
        // Network error (offline, DNS failure, etc.)
        lastError = err
      }

      if (attempt < maxRetries) {
        const delay = jitter(retryDelay * Math.pow(2, attempt))
        console.warn(
          `[api] Retry ${attempt + 1}/${maxRetries} for ${method} ${path} after ${Math.round(delay)}ms (network error)`,
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
    }
  }

  // All retries exhausted — notify and throw
  const errorMessage =
    lastError instanceof ApiError
      ? lastError.message
      : lastError instanceof Error
        ? lastError.message
        : 'Erro de conexao com o servidor'

  toast.error('Erro de rede', {
    description: errorMessage,
  })

  if (lastError instanceof ApiError) {
    throw lastError
  }

  throw new ApiError(
    errorMessage,
    0,
    'NetworkError',
    null,
  )
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const api = {
  get<T>(path: string, opts?: ApiFetchOptions): Promise<T> {
    return apiFetch<T>(path, { ...opts, method: 'GET' })
  },

  post<T>(path: string, body?: unknown, opts?: ApiFetchOptions): Promise<T> {
    return apiFetch<T>(path, { ...opts, method: 'POST', body })
  },

  put<T>(path: string, body?: unknown, opts?: ApiFetchOptions): Promise<T> {
    return apiFetch<T>(path, { ...opts, method: 'PUT', body })
  },

  patch<T>(path: string, body?: unknown, opts?: ApiFetchOptions): Promise<T> {
    return apiFetch<T>(path, { ...opts, method: 'PATCH', body })
  },

  delete<T>(path: string, opts?: ApiFetchOptions): Promise<T> {
    return apiFetch<T>(path, { ...opts, method: 'DELETE' })
  },
}

// ---------------------------------------------------------------------------
// Streaming (SSE) — returns raw Response for .getReader()
// ---------------------------------------------------------------------------

export async function apiStream(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const url = `${API_BASE}${path}`
  const authHeaders = getAuthHeaders()

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!response.ok) {
    let errorBody: unknown = null
    try { errorBody = await response.json() } catch { /* */ }
    throw new ApiError(
      `Stream request failed: ${response.status}`,
      response.status,
      response.statusText,
      errorBody,
    )
  }

  return response
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkServerHealth(): Promise<boolean> {
  try {
    await apiFetch<{ status: string }>('/health', {
      timeout: HEALTH_TIMEOUT,
      retries: 0,
      skipAuth: true,
    })
    return true
  } catch {
    return false
  }
}
