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

// --- Fail-fast environment validation ---

// Required vars: server MUST NOT start without these
const requiredVars = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'WA_WEBHOOK_VERIFY_TOKEN',
  'WA_APP_SECRET',
] as const

// At least one of these must be set (supports both naming conventions)
const supabaseUrlVar = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
if (!supabaseUrlVar) {
  console.error('[Env] FATAL: Neither SUPABASE_URL nor VITE_SUPABASE_URL is set')
}

// Optional vars with defaults (applied here so the rest of the app can rely on them)
const optionalDefaults: Record<string, string> = {
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:5173',
  NODE_ENV: 'development',
}

for (const [key, defaultValue] of Object.entries(optionalDefaults)) {
  if (!process.env[key]) {
    process.env[key] = defaultValue
  }
}

// AI keys: warn but don't crash (some features just won't work)
const aiKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

// Collect ALL missing required vars before throwing
const missing: string[] = []

if (!supabaseUrlVar) {
  missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
}

for (const key of requiredVars) {
  if (!process.env[key]) {
    missing.push(key)
  }
}

// Log full status report
console.log('[Env] === Environment Check ===')

// Log Supabase URL status
if (supabaseUrlVar) {
  const preview = `${supabaseUrlVar.slice(0, 8)}...${supabaseUrlVar.slice(-4)}`
  console.log(`[Env] OK  SUPABASE_URL — ${preview}`)
} else {
  console.error('[Env] MISSING  SUPABASE_URL or VITE_SUPABASE_URL')
}

for (const key of requiredVars) {
  const val = process.env[key]
  if (!val) {
    console.error(`[Env] MISSING  ${key}`)
  } else {
    const preview = `${val.slice(0, 8)}...${val.slice(-4)}`
    console.log(`[Env] OK  ${key} — ${preview}`)
  }
}

for (const key of aiKeys) {
  const val = process.env[key]
  if (!val) {
    console.warn(`[Env] WARN  ${key} — not set (AI features that depend on this will be disabled)`)
  } else {
    const preview = `${val.slice(0, 8)}...${val.slice(-4)}`
    console.log(`[Env] OK  ${key} — ${preview}`)
  }
}

console.log(`[Env] FRONTEND_URL (CORS origin): ${process.env.FRONTEND_URL}`)
console.log('[Env] ===========================')

// Fail fast: throw with ALL missing vars listed
if (missing.length > 0) {
  throw new Error(
    `[Env] FATAL: Missing required environment variables:\n  - ${missing.join('\n  - ')}\n` +
    'Server cannot start without these. Check your .env.local or deployment config.'
  )
}
