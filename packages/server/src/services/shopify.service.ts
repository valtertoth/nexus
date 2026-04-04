import { supabaseAdmin } from '../lib/supabase.js'
import { generateProductEmbeddings } from './visual-search.service.js'

interface ShopifyGraphQLProduct {
  id: string
  title: string
  descriptionHtml: string
  handle: string
  productType: string
  vendor: string
  tags: string[]
  featuredImage?: { url: string }
  images: {
    edges: Array<{ node: { url: string; altText?: string } }>
  }
  metafields: {
    edges: Array<{ node: { namespace: string; key: string; value: string; type: string } }>
  }
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
            descriptionHtml
            handle
            productType
            vendor
            tags
            featuredImage { url }
            images(first: 10) {
              edges {
                node { url altText }
              }
            }
            metafields(first: 50) {
              edges {
                node { namespace key value type }
              }
            }
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

        // Collect all image URLs
        const images = product.images?.edges?.map((e) => e.node.url) || []

        // Parse metafields into flat key-value map
        // Resolve file_reference GIDs to actual URLs
        const metafields: Record<string, string> = {}
        const fileGidsToResolve: Array<{ metaKey: string; gids: string[] }> = []

        for (const edge of product.metafields?.edges || []) {
          const { namespace, key, value, type } = edge.node
          const metaKey = `${namespace}.${key}`

          if (type === 'file_reference' && value.startsWith('gid://')) {
            fileGidsToResolve.push({ metaKey, gids: [value] })
          } else if (type === 'list.file_reference') {
            try {
              const gids = JSON.parse(value)
              if (Array.isArray(gids) && gids.length > 0) {
                fileGidsToResolve.push({ metaKey, gids })
              }
            } catch { /* not JSON */ }
          } else if (type === 'list.metaobject_reference') {
            // Skip metaobject references (GIDs that can't be resolved to simple values)
            metafields[metaKey] = value
          } else {
            metafields[metaKey] = value
          }
        }

        // Resolve file GIDs to URLs in batch
        if (fileGidsToResolve.length > 0) {
          const allGids = fileGidsToResolve.flatMap(f => f.gids)
          const nodesQuery = `{
            nodes(ids: ${JSON.stringify(allGids)}) {
              ... on MediaImage { id image { url } }
              ... on GenericFile { id url }
            }
          }`
          try {
            const nodesResp = await fetch(graphqlUrl, {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': org.shopify_access_token,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query: nodesQuery }),
            })
            const nodesResult = await nodesResp.json()
            const resolvedMap: Record<string, string> = {}
            for (const node of nodesResult.data?.nodes || []) {
              if (!node) continue
              const url = node.image?.url || node.url
              if (url && node.id) resolvedMap[node.id] = url
            }

            for (const { metaKey, gids } of fileGidsToResolve) {
              const urls = gids.map(g => resolvedMap[g]).filter(Boolean)
              if (urls.length === 1) {
                metafields[metaKey] = urls[0]
              } else if (urls.length > 1) {
                metafields[metaKey] = JSON.stringify(urls)
              }
            }
          } catch (resolveErr) {
            console.error(`[Shopify] Failed to resolve file GIDs for ${product.title}:`, resolveErr)
            // Still save the raw GID values as fallback
            for (const { metaKey, gids } of fileGidsToResolve) {
              metafields[metaKey] = gids.length === 1 ? gids[0] : JSON.stringify(gids)
            }
          }
        }

        // Strip HTML tags from description for plain text
        const description = product.descriptionHtml
          ? product.descriptionHtml.replace(/<[^>]*>/g, '').trim()
          : null

        await supabaseAdmin
          .from('shopify_products')
          .upsert(
            {
              org_id: orgId,
              shopify_id: shopifyId,
              title: product.title,
              description,
              image_url: product.featuredImage?.url || null,
              images,
              cost_price: costPrice,
              sale_price: salePrice,
              variants,
              metafields,
              tags: product.tags || [],
              handle: product.handle || null,
              product_type: product.productType || null,
              vendor: product.vendor || null,
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

  // Generate embeddings for visual search (only if enabled for this org — costs nothing if disabled)
  setImmediate(() => {
    generateProductEmbeddings(orgId).catch((err) =>
      console.error('[Shopify] Product embedding generation failed:', err)
    )
  })

  return { synced, errors }
}

// Use wildcard — columns may or may not exist depending on migration state
const PRODUCT_SELECT = '*'

/**
 * Search products in local cache by title.
 */
export async function searchProducts(
  orgId: string,
  query: string,
  limit = 20
) {
  const { data, error } = await supabaseAdmin
    .from('shopify_products')
    .select(PRODUCT_SELECT)
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
export async function listProducts(orgId: string, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from('shopify_products')
    .select(PRODUCT_SELECT)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('title')
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Get a single product by ID.
 */
export async function getProduct(orgId: string, productId: string) {
  const { data, error } = await supabaseAdmin
    .from('shopify_products')
    .select(PRODUCT_SELECT)
    .eq('org_id', orgId)
    .eq('id', productId)
    .single()

  if (error) throw error
  return data
}
