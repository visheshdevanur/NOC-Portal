// @ts-nocheck — Deno runtime, not checked by project tsc
/**
 * Shared utilities for Supabase Edge Functions.
 * Import in Edge Functions via: import { ... } from '../_shared/utils.ts'
 */

// ─── Structured Logging ───

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  level: LogLevel
  fn: string
  action: string
  userId?: string
  duration?: number
  error?: string
  meta?: Record<string, unknown>
}

export function log(entry: LogEntry) {
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  }
  switch (entry.level) {
    case 'ERROR':
      console.error(JSON.stringify(payload))
      break
    case 'WARN':
      console.warn(JSON.stringify(payload))
      break
    default:
      console.log(JSON.stringify(payload))
  }
}

// ─── Request Timer ───

export function startTimer(): () => number {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

// ─── In-Memory Rate Limiter ───

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

export function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs }
  }

  if (entry.count >= maxRequests) {
    const resetMs = windowMs - (now - entry.windowStart)
    return { allowed: false, remaining: 0, resetMs }
  }

  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetMs: windowMs - (now - entry.windowStart),
  }
}

// ─── CORS Helper ───
//
// ALLOWED_ORIGIN env var controls which origins are permitted.
// Supports comma-separated values for multiple domains:
//   ALLOWED_ORIGIN=https://noc-portal-self.vercel.app,https://mitmysore.in
// If unset or '*', all origins are allowed (dev mode).
// The request origin is reflected back when matched — required by CORS spec.

export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedEnv = Deno.env.get('ALLOWED_ORIGIN') || '*'

  let resolvedOrigin: string
  if (allowedEnv === '*') {
    resolvedOrigin = '*'
  } else {
    const allowedList = allowedEnv.split(',').map((o: string) => o.trim())
    if (requestOrigin && allowedList.includes(requestOrigin)) {
      resolvedOrigin = requestOrigin  // exact match — reflect back (required by spec)
    } else {
      resolvedOrigin = allowedList[0] // fallback to primary origin
    }
  }

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    ...(resolvedOrigin !== '*' ? { 'Vary': 'Origin' } : {}),
  }
}

/**
 * Validates the request Origin against the ALLOWED_ORIGIN list.
 * Returns a 403 Response (WITH CORS headers) if not allowed, or null if OK.
 * Webhooks (no Origin header) and unset ALLOWED_ORIGIN are always allowed.
 */
export function validateOrigin(req: Request): Response | null {
  const allowedEnv = Deno.env.get('ALLOWED_ORIGIN')

  // Not configured or wildcard — allow all (dev mode or open access)
  if (!allowedEnv || allowedEnv === '*') return null

  const requestOrigin = req.headers.get('Origin')

  // Webhooks and server-to-server calls have no Origin — allow them
  if (!requestOrigin) return null

  const allowedList = allowedEnv.split(',').map((o: string) => o.trim())

  if (allowedList.includes(requestOrigin)) return null  // origin is in the allowed list

  // Origin not allowed — return 403 WITH CORS headers so browser can read the error
  return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
    status: 403,
    headers: {
      ...getCorsHeaders(requestOrigin),
      'Content-Type': 'application/json',
    },
  })
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
  requestOrigin?: string
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(requestOrigin),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

// ─── Input Sanitization ───

/** Strip HTML tags and limit string length */
export function sanitize(input: string, maxLength = 1000): string {
  return input
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength)
}

/** Validate UUID format */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
