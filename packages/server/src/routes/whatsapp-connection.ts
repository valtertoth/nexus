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

// ─── WhatsApp Business Profile Management ───

interface BusinessProfileData {
  about?: string
  address?: string
  description?: string
  email?: string
  vertical?: string
  websites?: string[]
  profile_picture_url?: string
}

// GET /api/whatsapp/profile -- Fetch current WhatsApp Business Profile
whatsappConnection.get('/profile', async (c) => {
  const orgId = c.get('orgId')

  try {
    const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

    const response = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!response.ok) {
      const error = await response.json()
      return c.json({ error: `Meta API error: ${JSON.stringify(error)}` }, 502)
    }

    const result = await response.json() as { data?: BusinessProfileData[] }
    const profile = result.data?.[0] || {}

    return c.json({ profile })
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Erro ao buscar perfil',
    }, 500)
  }
})

// PUT /api/whatsapp/profile -- Update WhatsApp Business Profile (text fields)
whatsappConnection.put('/profile', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{
    about?: string
    address?: string
    description?: string
    email?: string
    vertical?: string
    websites?: string[]
  }>()

  try {
    const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

    // Build payload with only provided fields
    const payload: Record<string, unknown> = { messaging_product: 'whatsapp' }
    if (body.about !== undefined) payload.about = body.about
    if (body.address !== undefined) payload.address = body.address
    if (body.description !== undefined) payload.description = body.description
    if (body.email !== undefined) payload.email = body.email
    if (body.vertical !== undefined) payload.vertical = body.vertical
    if (body.websites !== undefined) payload.websites = body.websites

    const response = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}/whatsapp_business_profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return c.json({ error: `Meta API error: ${JSON.stringify(error)}` }, 502)
    }

    return c.json({ ok: true })
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Erro ao atualizar perfil',
    }, 500)
  }
})

// POST /api/whatsapp/profile/photo -- Upload profile picture
whatsappConnection.post('/profile/photo', async (c) => {
  const orgId = c.get('orgId')

  try {
    const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return c.json({ error: 'Nenhum arquivo enviado' }, 400)
    }

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return c.json({ error: 'Apenas JPEG e PNG são aceitos' }, 400)
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'Imagem deve ter no máximo 5MB' }, 400)
    }

    const fileBuffer = await file.arrayBuffer()

    // Step 1: Start resumable upload session
    const startUploadRes = await fetch(
      `${GRAPH_API_URL}/${process.env.WA_APP_ID || phoneNumberId}/uploads?file_length=${file.size}&file_type=${file.type}&access_token=${accessToken}`,
      { method: 'POST' }
    )

    if (!startUploadRes.ok) {
      // Fallback: try direct media upload approach
      const mediaForm = new FormData()
      mediaForm.append('messaging_product', 'whatsapp')
      mediaForm.append('file', new Blob([fileBuffer], { type: file.type }), file.name)
      mediaForm.append('type', file.type)

      const mediaRes = await fetch(
        `${GRAPH_API_URL}/${phoneNumberId}/media`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: mediaForm,
        }
      )

      if (!mediaRes.ok) {
        const error = await mediaRes.json()
        return c.json({ error: `Upload falhou: ${JSON.stringify(error)}` }, 502)
      }

      const mediaResult = await mediaRes.json() as { id: string }

      // Set as profile picture using media handle
      const profileRes = await fetch(
        `${GRAPH_API_URL}/${phoneNumberId}/whatsapp_business_profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            profile_picture_handle: mediaResult.id,
          }),
        }
      )

      if (!profileRes.ok) {
        const error = await profileRes.json()
        return c.json({ error: `Falha ao definir foto: ${JSON.stringify(error)}` }, 502)
      }

      return c.json({ ok: true })
    }

    // Resumable upload path
    const uploadSession = await startUploadRes.json() as { id: string }

    // Step 2: Upload the file data
    const uploadRes = await fetch(
      `${GRAPH_API_URL}/${uploadSession.id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          'file_offset': '0',
          'Content-Type': file.type,
        },
        body: fileBuffer,
      }
    )

    if (!uploadRes.ok) {
      const error = await uploadRes.json()
      return c.json({ error: `Upload falhou: ${JSON.stringify(error)}` }, 502)
    }

    const uploadResult = await uploadRes.json() as { h: string }

    // Step 3: Set as profile picture
    const profileRes = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}/whatsapp_business_profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          profile_picture_handle: uploadResult.h,
        }),
      }
    )

    if (!profileRes.ok) {
      const error = await profileRes.json()
      return c.json({ error: `Falha ao definir foto: ${JSON.stringify(error)}` }, 502)
    }

    return c.json({ ok: true })
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Erro ao enviar foto',
    }, 500)
  }
})

// DELETE /api/whatsapp/profile/photo -- Remove profile picture
whatsappConnection.delete('/profile/photo', async (c) => {
  const orgId = c.get('orgId')

  try {
    const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

    const response = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}/whatsapp_business_profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          profile_picture_handle: '',
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return c.json({ error: `Meta API error: ${JSON.stringify(error)}` }, 502)
    }

    return c.json({ ok: true })
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Erro ao remover foto',
    }, 500)
  }
})

// Helper: get org credentials (same logic as whatsapp.service.ts)
async function getOrgCredentials(orgId: string) {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('wa_phone_number_id, wa_access_token_encrypted')
    .eq('id', orgId)
    .single()

  if (data?.wa_phone_number_id && data?.wa_access_token_encrypted) {
    const { data: tokenData } = await supabaseAdmin.rpc('decrypt_wa_token', {
      encrypted: data.wa_access_token_encrypted,
    })
    if (tokenData) {
      return {
        phoneNumberId: data.wa_phone_number_id,
        accessToken: tokenData as string,
      }
    }
  }

  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID
  const accessToken = process.env.WA_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp não configurado. Salve suas credenciais primeiro.')
  }
  return { phoneNumberId, accessToken }
}

export default whatsappConnection
