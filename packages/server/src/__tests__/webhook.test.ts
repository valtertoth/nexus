import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'

// Mock supabase before importing services (avoids env var check)
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {},
}))

import {
  parseWebhookPayload,
  validateWebhookSignature,
  isServiceWindowActive,
} from '../services/whatsapp.service.js'
import type { WebhookPayload } from '@nexus/shared'

// --- Signature Validation ---

describe('validateWebhookSignature', () => {
  const appSecret = 'test_app_secret_123'

  it('should return true for valid signature', () => {
    const body = '{"test": "data"}'
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex')
    const signature = `sha256=${expectedHash}`

    expect(validateWebhookSignature(body, signature, appSecret)).toBe(true)
  })

  it('should return false for invalid signature', () => {
    const body = '{"test": "data"}'
    expect(validateWebhookSignature(body, 'sha256=invalid', appSecret)).toBe(false)
  })

  it('should return false for missing signature', () => {
    expect(validateWebhookSignature('body', undefined, appSecret)).toBe(false)
  })

  it('should return false for tampered body', () => {
    const originalBody = '{"test": "data"}'
    const hash = crypto
      .createHmac('sha256', appSecret)
      .update(originalBody)
      .digest('hex')
    const tamperedBody = '{"test": "tampered"}'

    expect(validateWebhookSignature(tamperedBody, `sha256=${hash}`, appSecret)).toBe(false)
  })
})

// --- Payload Parsing ---

describe('parseWebhookPayload', () => {
  function makePayload(value: Record<string, unknown>): WebhookPayload {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry_1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '5511999000000',
                  phone_number_id: 'phone_123',
                },
                ...value,
              },
              field: 'messages',
            },
          ],
        },
      ],
    }
  }

  it('should parse a text message', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'Maria Silva' }, wa_id: '5511999001001' }],
      messages: [
        {
          from: '5511999001001',
          id: 'wamid.abc123',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Olá, bom dia!' },
        },
      ],
    })

    const result = parseWebhookPayload(payload)

    expect(result.phoneNumberId).toBe('phone_123')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      from: '5511999001001',
      profileName: 'Maria Silva',
      messageId: 'wamid.abc123',
      type: 'text',
      text: 'Olá, bom dia!',
    })
  })

  it('should parse an image message with caption', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'João' }, wa_id: '5511999002002' }],
      messages: [
        {
          from: '5511999002002',
          id: 'wamid.img456',
          timestamp: '1700000000',
          type: 'image',
          image: {
            id: 'media_789',
            mime_type: 'image/jpeg',
            sha256: 'abc',
            caption: 'Foto do produto',
          },
        },
      ],
    })

    const result = parseWebhookPayload(payload)
    const msg = result.messages[0]

    expect(msg.type).toBe('image')
    expect(msg.mediaId).toBe('media_789')
    expect(msg.mediaMimeType).toBe('image/jpeg')
    expect(msg.caption).toBe('Foto do produto')
  })

  it('should parse a document message', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'Ana' }, wa_id: '5511999003003' }],
      messages: [
        {
          from: '5511999003003',
          id: 'wamid.doc789',
          timestamp: '1700000000',
          type: 'document',
          document: {
            id: 'media_doc_1',
            mime_type: 'application/pdf',
            sha256: 'def',
            filename: 'contrato.pdf',
          },
        },
      ],
    })

    const result = parseWebhookPayload(payload)
    const msg = result.messages[0]

    expect(msg.type).toBe('document')
    expect(msg.mediaId).toBe('media_doc_1')
    expect(msg.mediaFilename).toBe('contrato.pdf')
  })

  it('should parse a location message', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'Carlos' }, wa_id: '5511999004004' }],
      messages: [
        {
          from: '5511999004004',
          id: 'wamid.loc001',
          timestamp: '1700000000',
          type: 'location',
          location: {
            latitude: -23.5505,
            longitude: -46.6333,
            name: 'São Paulo',
            address: 'Praça da Sé',
          },
        },
      ],
    })

    const result = parseWebhookPayload(payload)
    const msg = result.messages[0]

    expect(msg.type).toBe('location')
    expect(msg.location).toMatchObject({
      latitude: -23.5505,
      longitude: -46.6333,
      name: 'São Paulo',
    })
  })

  it('should parse a reply message with context', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'Fernanda' }, wa_id: '5511999005005' }],
      messages: [
        {
          from: '5511999005005',
          id: 'wamid.reply001',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Sim, concordo!' },
          context: { from: '5511999000000', id: 'wamid.original001' },
        },
      ],
    })

    const result = parseWebhookPayload(payload)
    const msg = result.messages[0]

    expect(msg.isReply).toBe(true)
    expect(msg.replyToId).toBe('wamid.original001')
  })

  it('should parse status updates', () => {
    const payload = makePayload({
      statuses: [
        {
          id: 'wamid.sent001',
          status: 'delivered',
          timestamp: '1700000000',
          recipient_id: '5511999001001',
        },
        {
          id: 'wamid.sent002',
          status: 'read',
          timestamp: '1700000001',
          recipient_id: '5511999002002',
        },
      ],
    })

    const result = parseWebhookPayload(payload)

    expect(result.statuses).toHaveLength(2)
    expect(result.statuses[0]).toMatchObject({
      messageId: 'wamid.sent001',
      status: 'delivered',
    })
    expect(result.statuses[1]).toMatchObject({
      messageId: 'wamid.sent002',
      status: 'read',
    })
  })

  it('should parse failed status with error info', () => {
    const payload = makePayload({
      statuses: [
        {
          id: 'wamid.fail001',
          status: 'failed',
          timestamp: '1700000000',
          recipient_id: '5511999001001',
          errors: [{ code: 131047, title: 'Error', message: 'Re-engagement message' }],
        },
      ],
    })

    const result = parseWebhookPayload(payload)

    expect(result.statuses[0].status).toBe('failed')
    expect(result.statuses[0].errorCode).toBe(131047)
    expect(result.statuses[0].errorMessage).toBe('Re-engagement message')
  })

  it('should handle empty payload gracefully', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [],
    }

    const result = parseWebhookPayload(payload)

    expect(result.messages).toHaveLength(0)
    expect(result.statuses).toHaveLength(0)
    expect(result.phoneNumberId).toBeNull()
  })

  it('should handle mixed messages and statuses', () => {
    const payload = makePayload({
      contacts: [{ profile: { name: 'Test' }, wa_id: '5511999001001' }],
      messages: [
        {
          from: '5511999001001',
          id: 'wamid.msg001',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Hello' },
        },
      ],
      statuses: [
        {
          id: 'wamid.st001',
          status: 'sent',
          timestamp: '1700000000',
          recipient_id: '5511999002002',
        },
      ],
    })

    const result = parseWebhookPayload(payload)

    expect(result.messages).toHaveLength(1)
    expect(result.statuses).toHaveLength(1)
  })
})

// --- Service Window ---

describe('isServiceWindowActive', () => {
  it('should return true for future date', () => {
    const future = new Date(Date.now() + 3600000).toISOString()
    expect(isServiceWindowActive(future)).toBe(true)
  })

  it('should return false for past date', () => {
    const past = new Date(Date.now() - 3600000).toISOString()
    expect(isServiceWindowActive(past)).toBe(false)
  })

  it('should return false for null', () => {
    expect(isServiceWindowActive(null)).toBe(false)
  })
})
