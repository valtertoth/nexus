import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * Analyze an image using Claude Vision.
 *
 * Returns a structured description for AI context:
 * - What's in the image (product, object, environment)
 * - Product characteristics (type, color, material, style)
 * - Detected customer intent (interest, comparison, question)
 *
 * This is NOT shown to the seller — it feeds the AI copilot context.
 */
export async function analyzeImage(
  buffer: Buffer,
  mimeType: string,
  caption?: string
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Vision] ANTHROPIC_API_KEY not configured, skipping')
    return null
  }

  const baseMime = mimeType.split(';')[0].trim()

  if (!SUPPORTED_IMAGE_TYPES.has(baseMime)) {
    console.warn(`[Vision] Unsupported image type: ${mimeType}`)
    return null
  }

  try {
    const base64 = buffer.toString('base64')

    const userContent: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: baseMime as ImageMediaType,
          data: base64,
        },
      },
      {
        type: 'text',
        text: caption
          ? `O cliente enviou esta imagem com a legenda: "${caption}". Analise a imagem.`
          : 'O cliente enviou esta imagem. Analise a imagem.',
      },
    ]

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: userContent }],
      system: `Voce e um assistente de vendas analisando imagens enviadas por clientes via WhatsApp.
Descreva a imagem de forma concisa e util para o vendedor, focando em:
1. O que e o objeto/produto (tipo, categoria)
2. Caracteristicas visiveis (cor, material, estilo, tamanho aproximado)
3. Possivel intencao do cliente (quer comprar similar, pedir orcamento, tirar duvida)

Responda em 1-2 frases objetivas em portugues. Nao use emojis. Nao cumprimente.
Exemplo: "Sofa retratil 3 lugares em tecido suede cinza, estilo contemporaneo. Cliente provavelmente busca produto similar ou orcamento."`,
    })

    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.Messages.TextBlock).text)
      .join('')
      .trim()

    if (!text) {
      console.log('[Vision] Empty analysis result')
      return null
    }

    console.log(`[Vision] Success: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`)
    return text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Vision] Claude Vision failed:', msg)
    return null
  }
}
