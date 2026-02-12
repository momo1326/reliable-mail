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
      error: "API key missing"
    });
  }

  const rawKey = header.replace("Bearer ", "").trim();

  // Fast reject
  if (!rawKey.startsWith("sk_live_")) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  // Fetch candidate keys (prefix optimization later)
  const keys = await db.query(
    `SELECT * FROM api_keys WHERE is_active = true`
  );

  for (const key of keys.rows) {
    const match = await bcrypt.compare(rawKey, key.key_hash);
    if (match) {
      // Attach tenant context
      req.account = {
        accountId: key.account_id,
        apiKeyId: key.id,
        rateLimit: key.rate_limit_per_minute
      };
      return next();
    }
  }

  return res.status(401).json({ error: "Invalid API key" });
}