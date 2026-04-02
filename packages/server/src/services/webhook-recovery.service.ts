import { supabaseAdmin } from '../lib/supabase.js'

/**
 * Recover pending/failed webhook payloads on server startup.
 * This catches any messages that were lost during server crashes or restarts.
 */
export async function recoverPendingWebhooks(
  processFn: (payload: unknown) => Promise<void>
): Promise<void> {
  try {
    const { data: pending, error } = await supabaseAdmin
      .from('webhook_queue')
      .select('*')
      .in('status', ['pending', 'processing', 'failed'])
      .lt('attempts', 5)
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('[Recovery] Failed to query webhook queue:', error.message)
      return
    }

    if (!pending || pending.length === 0) {
      console.log('[Recovery] No pending webhooks to recover')
      return
    }

    console.log(`[Recovery] Found ${pending.length} pending webhook(s) to recover`)

    for (const item of pending) {
      try {
        // Mark as processing
        await supabaseAdmin
          .from('webhook_queue')
          .update({
            status: 'processing',
            attempts: (item.attempts as number) + 1,
          })
          .eq('id', item.id)

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
        const attempts = (item.attempts as number) + 1
        const backoffMs = Math.min(30_000 * Math.pow(2, attempts), 300_000)
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
 * Clean up completed webhook queue entries older than 24 hours.
 */
export async function cleanupWebhookQueue(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin
      .from('webhook_queue')
      .delete()
      .eq('status', 'completed')
      .lt('created_at', cutoff)

    if (error) {
      console.error('[Recovery] Cleanup query failed:', error.message)
    }
  } catch (err) {
    console.error('[Recovery] Cleanup failed:', err)
  }
}
