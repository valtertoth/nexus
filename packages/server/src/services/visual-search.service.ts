import { supabaseAdmin } from '../lib/supabase.js'
import { generateEmbedding, generateEmbeddings } from './embedding.service.js'

interface ProductMatch {
  id: string
  shopifyId: string
  title: string
  imageUrl: string | null
  costPrice: number
  salePrice: number
  similarity: number
  variants: Array<{ id: string; title: string; price: number; sku: string | null }>
}

/**
 * Check if visual search is enabled for an organization.
 */
export async function isVisualSearchEnabled(orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('visual_search_enabled')
    .eq('id', orgId)
    .single()

  return data?.visual_search_enabled === true
}

/**
 * Search for visually similar products using the image description.
 *
 * Flow:
 * 1. Takes the Claude Vision text description of the customer's image
 * 2. Generates a text embedding from the description
 * 3. Searches the product embeddings using vector similarity
 * 4. Returns ranked product matches
 *
 * Cost: ~$0.00002 per search (OpenAI embedding only — Vision is already called)
 */
export async function searchProductsByImage(
  imageDescription: string,
  orgId: string,
  threshold = 0.5,
  limit = 5
): Promise<ProductMatch[]> {
  if (!imageDescription) return []

  try {
    // Generate embedding for the image description
    const queryEmbedding = await generateEmbedding(imageDescription)

    // Vector similarity search against product embeddings
    const { data, error } = await supabaseAdmin.rpc('match_products_by_embedding', {
      query_embedding: JSON.stringify(queryEmbedding),
      p_org_id: orgId,
      match_threshold: threshold,
      match_count: limit,
    })

    if (error) {
      console.error('[VisualSearch] RPC error:', error.message)
      return []
    }

    if (!data || data.length === 0) return []

    const matches: ProductMatch[] = data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      shopifyId: row.shopify_id as string,
      title: row.title as string,
      imageUrl: row.image_url as string | null,
      costPrice: Number(row.cost_price) || 0,
      salePrice: Number(row.sale_price) || 0,
      similarity: Number(row.similarity) || 0,
      variants: Array.isArray(row.variants) ? row.variants as ProductMatch['variants'] : [],
    }))

    console.log(`[VisualSearch] Found ${matches.length} matches for org ${orgId} (best: ${matches[0]?.title} at ${(matches[0]?.similarity * 100).toFixed(0)}%)`)

    return matches
  } catch (err) {
    console.error('[VisualSearch] Search failed:', err)
    return []
  }
}

/**
 * Generate and store embeddings for all products that don't have one yet.
 * Called after Shopify product sync.
 *
 * Each product gets a rich text embedding from:
 * title + description + tags + variant names
 *
 * Cost: ~$0.00002 per product (OpenAI text-embedding-3-small)
 */
export async function generateProductEmbeddings(orgId: string): Promise<{ updated: number; errors: number }> {
  // Only run if visual search is enabled
  const enabled = await isVisualSearchEnabled(orgId)
  if (!enabled) {
    console.log('[VisualSearch] Visual search disabled for org, skipping embeddings')
    return { updated: 0, errors: 0 }
  }

  // Fetch products without embeddings
  const { data: products, error } = await supabaseAdmin
    .from('shopify_products')
    .select('id, title, description, tags, variants')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('embedding', null)
    .limit(200)

  if (error || !products || products.length === 0) {
    return { updated: 0, errors: 0 }
  }

  console.log(`[VisualSearch] Generating embeddings for ${products.length} products`)

  // Build rich text descriptions for embedding
  const texts = products.map((p) => buildProductText(p))

  let updated = 0
  let errors = 0

  try {
    // Batch generate embeddings
    const embeddings = await generateEmbeddings(texts)

    // Update each product with its embedding
    for (let i = 0; i < products.length; i++) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('shopify_products')
          .update({ embedding: JSON.stringify(embeddings[i]) })
          .eq('id', products[i].id)

        if (updateError) {
          console.error(`[VisualSearch] Failed to save embedding for ${products[i].title}:`, updateError.message)
          errors++
        } else {
          updated++
        }
      } catch {
        errors++
      }
    }
  } catch (err) {
    console.error('[VisualSearch] Batch embedding generation failed:', err)
    errors = products.length
  }

  console.log(`[VisualSearch] Embeddings: ${updated} updated, ${errors} errors`)
  return { updated, errors }
}

/**
 * Regenerate embedding for a single product (e.g., after title/description change).
 */
export async function updateProductEmbedding(productId: string): Promise<void> {
  const { data: product } = await supabaseAdmin
    .from('shopify_products')
    .select('id, title, description, tags, variants, org_id')
    .eq('id', productId)
    .single()

  if (!product) return

  const enabled = await isVisualSearchEnabled(product.org_id)
  if (!enabled) return

  const text = buildProductText(product)
  const embedding = await generateEmbedding(text)

  await supabaseAdmin
    .from('shopify_products')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', productId)
}

/**
 * Build a rich text description of a product for embedding.
 * Combines title, description, tags, and variant names into a
 * semantically rich string that captures the product's essence.
 */
function buildProductText(product: {
  title: string
  description?: string | null
  tags?: string[] | null
  variants?: unknown
}): string {
  const parts: string[] = [product.title]

  if (product.description) {
    // Truncate long descriptions
    const desc = product.description.length > 500
      ? product.description.substring(0, 500)
      : product.description
    parts.push(desc)
  }

  if (product.tags && product.tags.length > 0) {
    parts.push(`Categorias: ${product.tags.join(', ')}`)
  }

  // Add variant names (e.g., "Cinza / Grande", "Marrom / Médio")
  if (Array.isArray(product.variants)) {
    const variantNames = (product.variants as Array<{ title: string }>)
      .map((v) => v.title)
      .filter((t) => t && t !== 'Default Title')
    if (variantNames.length > 0) {
      parts.push(`Variantes: ${variantNames.join(', ')}`)
    }
  }

  return parts.join('. ')
}

/**
 * Format product matches as context for the AI copilot.
 */
export function formatProductMatchesForAI(matches: ProductMatch[]): string {
  if (matches.length === 0) return ''

  const lines = matches.map((m, i) => {
    const similarity = (m.similarity * 100).toFixed(0)
    const price = m.salePrice > 0 ? `R$ ${m.salePrice.toFixed(2)}` : 'preco sob consulta'
    return `${i + 1}. ${m.title} — ${price} (${similarity}% similar)`
  })

  return `PRODUTOS SIMILARES ENCONTRADOS NO CATALOGO:
${lines.join('\n')}

INSTRUCAO: Mencione os produtos encontrados na sua resposta. Se a similaridade for alta (>80%), apresente o produto com confianca. Se for media (50-80%), sugira como opcao que pode interessar.`
}
