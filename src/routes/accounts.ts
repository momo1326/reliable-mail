/**
 * Account Routes
 * 
 * Endpoints:
 * - POST /accounts/register — Create new account + API key (no auth required)
 * - GET /accounts/me — Get authenticated account info
 * - GET /accounts/usage — Get current month usage
 * - DELETE /accounts/api-keys/:keyId — Revoke an API key
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";

const router = Router();

/**
 * POST /accounts/register
 * Create a new account and first API key
 * No auth required (bootstrapping)
 */
router.post("/register", async (req, res) => {
  const { account_name, monthly_limit, webhook_url } = req.body;

  if (!account_name || account_name.length < 3) {
    return res.status(400).json({ error: "account_name required (min 3 chars)" });
  }

  if (webhook_url) {
    try {
      const parsed = new URL(webhook_url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).json({ error: "webhook_url must be http or https" });
      }
    } catch {
      return res.status(400).json({ error: "Invalid webhook_url" });
    }
  }

  try {
    const accountResult = await db.query(
      `INSERT INTO accounts (name, monthly_limit, webhook_url) VALUES ($1, $2, $3) RETURNING id`,
      [account_name, monthly_limit || 1000, webhook_url || null]
    );

    const accountId = accountResult.rows[0].id;

    // Generate API key
    const rawKey = `sk_live_${Math.random().toString(36).substring(2, 32)}`;
    const keyHash = await bcrypt.hash(rawKey, 10);

    await db.query(
      `INSERT INTO api_keys (account_id, key_hash) VALUES ($1, $2)`,
      [accountId, keyHash]
    );

    res.status(201).json({
      account_id: accountId,
      account_name,
      api_key: rawKey,
      warning: "🔐 Save your API key now. You won't be able to see it again.",
    });
  } catch (err) {
    console.error("Account registration error:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * GET /accounts/me
 * Get authenticated account info
 */
router.get("/me", apiKeyAuth, async (req, res) => {
  const accountId = (req as any).account.accountId;

  try {
    const result = await db.query(
      `SELECT id, name, monthly_limit, created_at FROM accounts WHERE id = $1`,
      [accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get account error:", err);
    res.status(500).json({ error: "Failed to get account" });
  }
});

/**
 * GET /accounts/usage
 * Get current month email usage and quota
 */
router.get("/usage", apiKeyAuth, async (req, res) => {
  const accountId = (req as any).account.accountId;

  try {
    const usageResult = await db.query(
      `
      SELECT COUNT(*) as sent FROM email_usage
      WHERE account_id = $1 AND month = date_trunc('month', now())::date
      `,
      [accountId]
    );

    const accountResult = await db.query(
      `SELECT monthly_limit FROM accounts WHERE id = $1`,
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const sent = parseInt(usageResult.rows[0].sent);
    const limit = accountResult.rows[0].monthly_limit;
    const remaining = Math.max(0, limit - sent);

    // Calculate reset date (first day of next month)
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    res.json({
      sent,
      limit,
      remaining,
      usage_percent: Math.round((sent / limit) * 100),
      reset_date: resetDate.toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("Get usage error:", err);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

/**
 * DELETE /accounts/api-keys/:keyId
 * Revoke an API key
 */
router.delete("/api-keys/:keyId", apiKeyAuth, async (req, res) => {
  const accountId = (req as any).account.accountId;
  const keyId = req.params.keyId;

  try {
    const result = await db.query(
      `UPDATE api_keys SET is_active = false WHERE id = $1 AND account_id = $2 RETURNING id`,
      [keyId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({ success: true, message: "API key revoked" });
  } catch (err) {
    console.error("Revoke key error:", err);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

export default router;