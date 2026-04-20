// =============================================================================
// rate-limit.ts
//
// Lightweight in-memory per-key rate limiter. Intended for endpoints that
// need cheap per-IP throttling to blunt abuse (e.g. /api/payfast/notify)
// where a DB-backed limiter would add more overhead than it saves.
//
// SCALE CAVEAT: this is process-local. If the app scales to multiple
// containers, each container has its own counter and the effective limit
// is N × MAX per IP. That's fine for the current single-container deploy;
// switch to Redis / Postgres if we grow past that.
//
// Each key carries a rolling window of timestamps. When a request arrives:
//   - Strip timestamps older than windowMs
//   - If the remaining count >= max, deny
//   - Otherwise push the current timestamp and allow
//
// Server-only. Do not import from client components.
// =============================================================================

interface RateLimitConfig {
  /** Max requests permitted in the rolling window. */
  max: number
  /** Window size in milliseconds. */
  windowMs: number
  /**
   * How often (in ms) to sweep stale buckets out of the Map to stop it
   * growing unboundedly. Defaults to 5 minutes.
   */
  sweepIntervalMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Requests remaining in the current window (0 when denied). */
  remaining: number
  /** Seconds until the client can retry (0 when allowed). */
  retryAfterSeconds: number
}

interface Bucket {
  timestamps: number[]
  lastTouched: number
}

/**
 * Create a per-key rate limiter. The returned `check` function takes a
 * string key (usually an IP address) and returns whether the request is
 * allowed plus retry metadata.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { max, windowMs } = config
  const sweepIntervalMs = config.sweepIntervalMs ?? 5 * 60 * 1000

  const buckets = new Map<string, Bucket>()
  let lastSweep = Date.now()

  function sweepIfDue(now: number) {
    if (now - lastSweep < sweepIntervalMs) return
    lastSweep = now
    const cutoff = now - windowMs
    for (const [key, bucket] of buckets) {
      // Remove any bucket whose last entry has fully expired.
      if (bucket.lastTouched < cutoff) buckets.delete(key)
    }
  }

  return function check(key: string): RateLimitResult {
    const now = Date.now()
    sweepIfDue(now)

    const cutoff = now - windowMs
    const bucket = buckets.get(key) ?? { timestamps: [], lastTouched: now }

    // Trim expired entries.
    while (bucket.timestamps.length > 0 && bucket.timestamps[0] < cutoff) {
      bucket.timestamps.shift()
    }

    if (bucket.timestamps.length >= max) {
      const oldest = bucket.timestamps[0]
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      }
    }

    bucket.timestamps.push(now)
    bucket.lastTouched = now
    buckets.set(key, bucket)

    return {
      allowed: true,
      remaining: max - bucket.timestamps.length,
      retryAfterSeconds: 0,
    }
  }
}

/** Helper: parse the caller IP from standard proxy headers. */
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}
