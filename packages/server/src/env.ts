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
      console.log(`[Env] ANTHROPIC_API_KEY present: ${!!process.env.ANTHROPIC_API_KEY}`)
    }
    break
  }
}
