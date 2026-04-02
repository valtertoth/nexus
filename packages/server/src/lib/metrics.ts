/**
 * Simple in-memory metrics for webhook processing observability.
 * These are exposed via the /health endpoint for monitoring.
 */

interface WebhookMetrics {
  totalReceived: number
  totalProcessed: number
  totalFailed: number
  totalDuplicates: number
  avgProcessingMs: number
  lastProcessedAt: string | null
  // Rolling window (last 100 processing times)
  recentProcessingTimes: number[]
}

interface MessageMetrics {
  totalSent: number
  totalFailed: number
  totalRetried: number
  lastSentAt: string | null
}

class MetricsCollector {
  private webhook: WebhookMetrics = {
    totalReceived: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalDuplicates: 0,
    avgProcessingMs: 0,
    lastProcessedAt: null,
    recentProcessingTimes: [],
  }

  private messages: MessageMetrics = {
    totalSent: 0,
    totalFailed: 0,
    totalRetried: 0,
    lastSentAt: null,
  }

  private startTime = Date.now()

  webhookReceived() {
    this.webhook.totalReceived++
  }

  webhookProcessed(durationMs: number) {
    this.webhook.totalProcessed++
    this.webhook.lastProcessedAt = new Date().toISOString()

    // Keep last 100 processing times for average calculation
    this.webhook.recentProcessingTimes.push(durationMs)
    if (this.webhook.recentProcessingTimes.length > 100) {
      this.webhook.recentProcessingTimes.shift()
    }

    const times = this.webhook.recentProcessingTimes
    this.webhook.avgProcessingMs = Math.round(
      times.reduce((a, b) => a + b, 0) / times.length
    )
  }

  webhookFailed() {
    this.webhook.totalFailed++
  }

  webhookDuplicate() {
    this.webhook.totalDuplicates++
  }

  messageSent() {
    this.messages.totalSent++
    this.messages.lastSentAt = new Date().toISOString()
  }

  messageFailed() {
    this.messages.totalFailed++
  }

  messageRetried() {
    this.messages.totalRetried++
  }

  getSnapshot() {
    return {
      uptime: Date.now() - this.startTime,
      webhook: { ...this.webhook, recentProcessingTimes: undefined },
      messages: { ...this.messages },
    }
  }
}

export const metrics = new MetricsCollector()
