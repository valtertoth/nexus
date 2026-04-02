import { HTTPException } from 'hono/http-exception'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate that a value is a non-empty string. Throws 400 if invalid.
 */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HTTPException(400, {
      message: `${name} is required and must be a non-empty string`,
    })
  }
  return value.trim()
}

/**
 * Validate that a value is a valid UUID v4. Throws 400 if invalid.
 */
export function requireUUID(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new HTTPException(400, {
      message: `${name} must be a valid UUID`,
    })
  }
  return value
}

/**
 * Return trimmed string or undefined if value is falsy/not a string.
 */
export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }
  return value.trim()
}

/**
 * Validate that a value is one of the allowed options. Throws 400 if invalid.
 */
export function requireOneOf<T>(value: unknown, options: T[], name: string): T {
  if (!options.includes(value as T)) {
    throw new HTTPException(400, {
      message: `${name} must be one of: ${options.join(', ')}`,
    })
  }
  return value as T
}
