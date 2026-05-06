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

export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
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
