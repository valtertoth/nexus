import { supabaseAdmin } from '../lib/supabase.js'

interface ClaimedWebhook {
  id: string
  wa_message_id: string | null
  payload: unknown
  attempts: number
}

/**
 * Recover pending/failed webhook payloads (and inline rows abandoned by a crash).
 * Rows are claimed atomically by claim_webhook_batch (FOR UPDATE SKIP LOCKED),
 * so a payload is never handed to two workers at once, and 'processing' rows
 * still owned by a live inline handler (younger than 10 minutes) are left alone.
 */
export async function recoverPendingWebhooks(
  processFn: (payload: unknown) => Promise<void>
): Promise<void> {
  try {
    const { data: claimed, error } = await supabaseAdmin.rpc('claim_webhook_batch', {
      p_limit: 100,
    })

    if (error) {
      console.error('[Recovery] Failed to claim webhook batch:', error.message)
      return
    }

    const batch = (claimed ?? []) as ClaimedWebhook[]

    if (batch.length === 0) {
      console.log('[Recovery] No pending webhooks to recover')
      return
    }

    console.log(`[Recovery] Claimed ${batch.length} webhook(s) to recover`)

    for (const item of batch) {
      try {
        await processFn(item.payload)

        // Mark as completed
        await supabaseAdmin
          .from('webhook_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id)

        console.log(`[Recovery] Successfully recovered webhook ${item.id} (msg: ${item.wa_message_id})`)
      } catch (err) {
        // attempts was already incremented by claim_webhook_batch
        const backoffMs = Math.min(30_000 * Math.pow(2, item.attempts), 300_000)
        const nextRetry = new Date(Date.now() + backoffMs)

        await supabaseAdmin
          .from('webhook_queue')
          .update({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            next_retry_at: nextRetry.toISOString(),
          })
          .eq('id', item.id)

        console.error(`[Recovery] Failed to recover webhook ${item.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[Recovery] Recovery process failed:', err)
  }
}

/**
 * Clean up terminal webhook queue entries older than 7 days:
 *   - 'completed' rows (kept 7 days for incident auditing)
 *   - 'failed' rows (dead-letters — retries are exhausted well before 7 days)
 */
export async function cleanupWebhookQueue(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: completedDeleted, error: completedError } = await supabaseAdmin
      .from('webhook_queue')
      .delete()
      .eq('status', 'completed')
      .lt('created_at', cutoff)
      .select('id')

    if (completedError) {
      console.error('[Recovery] Cleanup (completed) query failed:', completedError.message)
    }

    const { data: failedDeleted, error: failedError } = await supabaseAdmin
      .from('webhook_queue')
      .delete()
      .eq('status', 'failed')
      .lt('created_at', cutoff)
      .select('id')

    if (failedError) {
      console.error('[Recovery] Cleanup (failed) query failed:', failedError.message)
    }

    const completedCount = completedDeleted?.length ?? 0
    const failedCount = failedDeleted?.length ?? 0
    if (completedCount > 0 || failedCount > 0) {
      console.log(
        `[Recovery] Cleanup removed ${completedCount} completed + ${failedCount} failed webhook(s) older than 7d`
      )
    }
  } catch (err) {
    console.error('[Recovery] Cleanup failed:', err)
  }
}
