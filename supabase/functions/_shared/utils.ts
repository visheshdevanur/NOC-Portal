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
// Simple sliding window rate limiter for Edge Functions.
// Note: Each Edge Function instance has its own memory, so this limits
// per-instance, not globally. For global rate limiting, use Redis or DB.

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
    // New window
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

/**
 * Returns CORS headers. In production, ALLOWED_ORIGIN must be set
 * in Supabase Dashboard → Edge Function Secrets.
 * If not set, defaults to '*' for local development only.
 */
export function getCorsHeaders(): Record<string, string> {
  const origin = Deno.env.get('ALLOWED_ORIGIN') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * Validates the request Origin header against ALLOWED_ORIGIN.
 * Returns a 403 Response if the origin is not allowed, or null if OK.
 * 
 * Webhooks (no Origin header) and local dev (ALLOWED_ORIGIN not set) are allowed through.
 * 
 * IMPORTANT: Set ALLOWED_ORIGIN in Supabase Dashboard → Settings → Edge Functions → Secrets
 * Example: ALLOWED_ORIGIN=https://your-domain.vercel.app
 */
export function validateOrigin(req: Request): Response | null {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN')
  
  // If ALLOWED_ORIGIN is not configured, allow all (dev mode)
  if (!allowedOrigin) return null
  
  const requestOrigin = req.headers.get('Origin')
  
  // Webhooks and server-to-server calls don't have Origin headers — allow them
  if (!requestOrigin) return null
  
  // Check if origin matches
  if (requestOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  return null
}

export function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(), 'Content-Type': 'application/json', ...extraHeaders },
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
