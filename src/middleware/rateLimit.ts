/**
 * Rate Limiting Middleware
 * 
 * Enforces per-account, per-minute rate limits using Redis.
 * Prevents abuse by limiting email sends per minute.
 * 
 * Rate limit is per account (from api_keys.rate_limit_per_minute, default 100).
 */

import { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { config } from "../config/env.js";

let redis: any = null;

/**
 * Initialize Redis connection for rate limiting
 */
export async function initializeRateLimiter() {
  redis = createClient({
    socket: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
    },
  });

  await redis.connect();
  console.log("✅ Rate limiter connected to Redis");
  return redis;
}

/**
 * Rate limit middleware
 * Tracks requests per account per minute
 */
export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!config.ENABLE_RATE_LIMITING) {
    return next();
  }

  if (!redis) {
    console.warn("⚠️  Rate limiter not initialized, skipping");
    return next();
  }

  const accountId = (req as any).account?.accountId;
  if (!accountId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const limit = (req as any).account?.rateLimit || 100;
    const key = `ratelimit:${accountId}`;
    const current = await redis.incr(key);

    // Set expiry on first request
    if (current === 1) {
      await redis.expire(key, 60);
    }

    res.set("X-RateLimit-Limit", limit.toString());
    res.set("X-RateLimit-Remaining", Math.max(0, limit - current).toString());

    if (current > limit) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retry_after_seconds: 60,
      });
    }

    next();
  } catch (err) {
    console.error("Rate limiter error:", err);
    // Fail open: allow request if Redis is down
    next();
  }
}