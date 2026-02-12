/**
 * API Key Authentication Middleware
 * 
 * Validates Bearer tokens and attaches account context to requests.
 * 
 * Validation flow:
 * 1. Extract Authorization header
 * 2. Ensure it starts with "Bearer sk_live_" (fast reject)
 * 3. Fetch all active API keys from database
 * 4. Bcrypt-compare raw key against each key_hash
 * 5. Attach account context (accountId, apiKeyId, rateLimit)
 * 
 * TODO: Optimize with key prefix indexing + Redis cache
 * Current O(n) complexity is fine for MVP (<100 customers).
 * Production optimization: store key_prefix, query by prefix, cache in Redis.
 */

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "API key missing",
      hint: "Use: Authorization: Bearer sk_live_xxx",
    });
  }

  const rawKey = header.replace("Bearer ", "").trim();

  // Fast reject: key must start with sk_live_
  if (!rawKey.startsWith("sk_live_")) {
    return res.status(401).json({ error: "Invalid API key format" });
  }

  // Fetch candidate keys (O(n) for now, optimize later)
  try {
    const keysResult = await db.query(
      `SELECT id, account_id, key_hash, rate_limit_per_minute FROM api_keys WHERE is_active = true`
    );

    for (const keyRecord of keysResult.rows) {
      const match = await bcrypt.compare(rawKey, keyRecord.key_hash);
      if (match) {
        // Attach account context
        (req as any).account = {
          accountId: keyRecord.account_id,
          apiKeyId: keyRecord.id,
          rateLimit: keyRecord.rate_limit_per_minute,
        };
        return next();
      }
    }

    return res.status(401).json({ error: "Invalid API key" });
  } catch (err) {
    console.error("API key auth error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}