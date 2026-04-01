import { supabaseAdmin } from '../lib/supabase.js'

interface ShopifyGraphQLProduct {
  id: string
  title: string
  featuredImage?: { url: string }
  variants: {
    edges: Array<{
      node: {
        id: string
        title: string
        price: string
        sku?: string
        inventoryItem?: {
          unitCost?: {
            amount: string
          }
        }
      }
    }>
  }
}

interface GraphQLResponse {
  data: {
    products: {
      edges: Array<{ node: ShopifyGraphQLProduct }>
      pageInfo: { hasNextPage: boolean; endCursor: string }
    }
  }
  errors?: Array<{ message: string }>
}

/**
 * Sync products from Shopify Admin GraphQL API into local cache.
 * Uses GraphQL to access inventoryItem.unitCost (actual cost),
 * which is NOT available via REST API products endpoint.
 */
export async function syncProducts(orgId: string): Promise<{ synced: number; errors: number }> {
  // Get Shopify credentials
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('shopify_domain, shopify_access_token')
    .eq('id', orgId)
    .single()

  if (!org?.shopify_domain || !org?.shopify_access_token) {
    throw new Error('Credenciais Shopify não configuradas')
  }

  const domain = org.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const graphqlUrl = `https://${domain}/admin/api/2024-01/graphql.json`

  let synced = 0
  let errors = 0
  let hasNextPage = true
  let cursor: string | null = null

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const query = `{
      products(first: 100, query: "status:active"${afterClause}) {
        edges {
          node {
            id
            title
            featuredImage { url }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': org.shopify_access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Shopify GraphQL error ${response.status}: ${text}`)
    }

    const result = await response.json() as GraphQLResponse

    if (result.errors?.length) {
      throw new Error(`Shopify GraphQL: ${result.errors[0].message}`)
    }

    const edges = result.data.products.edges
    hasNextPage = result.data.products.pageInfo.hasNextPage
    cursor = result.data.products.pageInfo.endCursor

    for (const { node: product } of edges) {
      try {
        const firstVariant = product.variants.edges[0]?.node

        // Cost price from inventoryItem.unitCost (actual cost)
        const costPrice = firstVariant?.inventoryItem?.unitCost?.amount
          ? parseFloat(firstVariant.inventoryItem.unitCost.amount)
          : 0

        // Sale price from variant.price
        const salePrice = firstVariant?.price
          ? parseFloat(firstVariant.price)
          : 0

        // Extract numeric ID from GraphQL global ID (gid://shopify/Product/123)
        const shopifyId = product.id.replace('gid://shopify/Product/', '')

        const variants = product.variants.edges.map((e) => ({
          id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
          title: e.node.title,
          price: parseFloat(e.node.price),
          cost: e.node.inventoryItem?.unitCost?.amount
            ? parseFloat(e.node.inventoryItem.unitCost.amount)
            : null,
          sku: e.node.sku || null,
        }))

        await supabaseAdmin
          .from('shopify_products')
          .upsert(
            {
              org_id: orgId,
              shopify_id: shopifyId,
              title: product.title,
              image_url: product.featuredImage?.url || null,
              cost_price: costPrice,
              sale_price: salePrice,
              variants,
              is_active: true,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,shopify_id' }
          )

        synced++
      } catch (err) {
        console.error(`[Shopify] Failed to sync product ${product.id}:`, err)
        errors++
      }
    }
  }

  console.log(`[Shopify] Synced ${synced} products, ${errors} errors for org ${orgId}`)
  return { synced, errors }
}

/**
 * Search products in local cache by title.
 */
export async function searchProducts(
  orgId: string,
  query: string,
  limit = 20
): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin
    .from('shopify_products')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('title', `%${query}%`)
    .order('title')
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Get all active products for an org.
 */
export async function listProducts(orgId: string, limit = 100): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin
    .from('shopify_products')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('title')
    .limit(limit)

  if (error) throw error
  return data || []
}
