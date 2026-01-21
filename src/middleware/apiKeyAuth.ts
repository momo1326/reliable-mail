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