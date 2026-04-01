import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Try multiple paths to find .env.local
const paths = [
  resolve(process.cwd(), '.env.local'),
  resolve(__dirname, '../../../.env.local'),
]

for (const envPath of paths) {
  const result = dotenv.config({ path: envPath, override: true })
  if (!result.error) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Env] Loaded from: ${envPath}`)
      console.log(`[Env] Keys loaded: ${Object.keys(result.parsed || {}).join(', ')}`)
    }
    break
  }
}

// Always log env var status on startup (critical for diagnosing Railway issues)
const requiredVars = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'WA_WEBHOOK_VERIFY_TOKEN',
  'WA_APP_SECRET',
  'FRONTEND_URL',
] as const

console.log('[Env] === Environment Check ===')
for (const key of requiredVars) {
  const val = process.env[key]
  if (!val) {
    console.error(`[Env] ❌ ${key} — MISSING`)
  } else {
    const preview = `${val.slice(0, 8)}...${val.slice(-4)}`
    console.log(`[Env] ✓ ${key} — ${preview}`)
  }
}
console.log('[Env] ===========================')
console.log(`[Env] FRONTEND_URL (CORS origin): ${process.env.FRONTEND_URL || 'NOT SET — defaulting to http://localhost:5173'}`)
