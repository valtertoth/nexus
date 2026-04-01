import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'

const GRAPH_API_URL = 'https://graph.facebook.com/v22.0'

type AuthVars = { Variables: { userId: string; orgId: string } }

const whatsappConnection = new Hono<AuthVars>()

// All routes require auth + rate limiting
whatsappConnection.use('*', authMiddleware)
whatsappConnection.use('*', apiRateLimit)

// GET /api/whatsapp/status -- Check Cloud API connection status
whatsappConnection.get('/status', async (c) => {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID
  const accessToken = process.env.WA_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return c.json({
      status: 'disconnected',
      error: 'WhatsApp Cloud API não configurado (WA_PHONE_NUMBER_ID ou WA_ACCESS_TOKEN ausente)',
    })
  }

  try {
    const response = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,platform_type`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!response.ok) {
      const error = await response.json()
      return c.json({
        status: 'error',
        error: `Cloud API error: ${JSON.stringify(error)}`,
      })
    }

    const data = await response.json() as Record<string, unknown>

    return c.json({
      status: 'connected',
      phoneNumber: data.display_phone_number,
      profileName: data.verified_name,
      qualityRating: data.quality_rating,
      platformType: data.platform_type,
      phoneNumberId,
    })
  } catch (err) {
    return c.json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Erro ao verificar status',
    })
  }
})

// POST /api/whatsapp/send-test -- Send a test message via Cloud API
whatsappConnection.post('/send-test', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{ to: string; text: string }>()

  if (!body.to || !body.text) {
    return c.json({ error: 'to e text sao obrigatorios' }, 400)
  }

  const { sendTextMessage } = await import('../services/whatsapp.service.js')

  try {
    const result = await sendTextMessage(orgId, body.to, body.text)
    const messageId = result.messages?.[0]?.id
    return c.json({ ok: true, messageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar'
    return c.json({ error: message }, 500)
  }
})

// POST /api/whatsapp/test-connection -- Test WA credentials from DB (server-side)
whatsappConnection.post('/test-connection', async (c) => {
  const orgId = c.get('orgId')

  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('wa_phone_number_id, wa_access_token_encrypted')
      .eq('id', orgId)
      .single()

    if (!org?.wa_phone_number_id || !org?.wa_access_token_encrypted) {
      return c.json({ status: 'error', error: 'Credenciais WhatsApp nao configuradas' }, 400)
    }

    const { data: accessToken } = await supabaseAdmin.rpc('decrypt_wa_token', {
      encrypted: org.wa_access_token_encrypted,
    })

    if (!accessToken) {
      return c.json({ status: 'error', error: 'Falha ao descriptografar token' }, 500)
    }

    const response = await fetch(
      `${GRAPH_API_URL}/${org.wa_phone_number_id}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!response.ok) {
      const error = await response.json()
      return c.json({ status: 'error', error: `Meta API error: ${JSON.stringify(error)}` })
    }

    const data = await response.json() as Record<string, unknown>
    return c.json({
      status: 'connected',
      phoneNumber: data.display_phone_number,
      profileName: data.verified_name,
    })
  } catch (err) {
    return c.json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Erro ao testar conexao',
    }, 500)
  }
})

export default whatsappConnection
