import { type Request, type Response, type NextFunction } from "express";

/**
 * Rate-limit middleware. Prefers a SHARED store (Upstash Redis REST) so limits
 * hold across instances; falls back to in-memory and fails OPEN if Upstash is
 * unreachable (a Redis blip never takes the bot down). Set UPSTASH_REDIS_REST_URL
 * + _TOKEN to enable the distributed path.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const upstashEnabled = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

type Outcome = { ok: boolean; retryAfter?: number };

const buckets = new Map<string, { count: number; reset: number }>();
function memoryLimit(key: string, limit: number, windowMs: number): Outcome {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  b.count += 1;
  return { ok: true };
}

async function upstashLimit(key: string, limit: number, windowMs: number): Promise<Outcome> {
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const k = `rl:${key}`;
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["SET", k, "0", "EX", String(ttlSec), "NX"],
      ["INCR", k],
      ["TTL", k],
    ]),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result?: number | string | null }>;
  const count = Number(data?.[1]?.result ?? 0);
  const ttl = Number(data?.[2]?.result ?? ttlSec);
  if (count > limit) return { ok: false, retryAfter: ttl > 0 ? ttl : ttlSec };
  return { ok: true };
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0]!.trim();
  return req.ip || "unknown";
}

/** Build an Express rate-limit middleware. */
export function rateLimit(opts: { keyPrefix: string; limit: number; windowMs: number }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${opts.keyPrefix}:${clientIp(req)}`;
    let outcome: Outcome;
    if (upstashEnabled) {
      try {
        outcome = await upstashLimit(key, opts.limit, opts.windowMs);
      } catch {
        outcome = memoryLimit(key, opts.limit, opts.windowMs);
      }
    } else {
      outcome = memoryLimit(key, opts.limit, opts.windowMs);
    }
    if (!outcome.ok) {
      res.setHeader("Retry-After", String(outcome.retryAfter ?? 60));
      res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
      return;
    }
    next();
  };
}
