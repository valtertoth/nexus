// ============================================
// WhatsApp Cloud API Types
// ============================================

export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contacts'
  | 'sticker'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'order'
  | 'unknown'

export interface WebhookPayload {
  object: 'whatsapp_business_account'
  entry: WebhookEntry[]
}

export interface WebhookEntry {
  id: string
  changes: WebhookChange[]
}

export interface WebhookChange {
  value: WebhookValue
  field: 'messages'
}

export interface WebhookValue {
  messaging_product: 'whatsapp'
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WebhookContact[]
  messages?: WebhookMessage[]
  statuses?: WebhookStatus[]
}

export interface WebhookContact {
  profile: {
    name: string
  }
  wa_id: string
}

export interface WebhookMessage {
  from: string
  id: string
  timestamp: string
  type: MessageType
  text?: {
    body: string
  }
  image?: WebhookMedia
  audio?: WebhookMedia
  video?: WebhookMedia
  document?: WebhookMedia & {
    filename: string
  }
  sticker?: WebhookMedia
  location?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  contacts?: WebhookContactCard[]
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  reaction?: {
    message_id: string
    emoji: string
  }
  context?: {
    from: string
    id: string
  }
}

export interface WebhookMedia {
  id: string
  mime_type: string
  sha256: string
  caption?: string
}

export interface WebhookContactCard {
  name: {
    formatted_name: string
    first_name?: string
    last_name?: string
  }
  phones?: { phone: string; type: string }[]
  emails?: { email: string; type: string }[]
}

export interface WebhookStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: {
    code: number
    title: string
    message: string
  }[]
}

// Cloud API Send Types
export interface SendTextPayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'text'
  text: { body: string }
  context?: { message_id: string }
}

export interface SendMediaPayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'image' | 'audio' | 'video' | 'document'
  [key: string]: unknown
}

export interface SendTemplatePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components?: unknown[]
  }
}

export interface CloudApiResponse {
  messaging_product: 'whatsapp'
  contacts: { input: string; wa_id: string }[]
  messages: { id: string }[]
}
