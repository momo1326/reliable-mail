/**
 * Email Routes — POST /emails/send
 * 
 * Handles sending emails with idempotency, usage enforcement, and async processing.
 * 
 * Guarantees:
 * - Idempotency: Same idempotency_key never creates duplicate emails
 * - Hard limit: Rejects if account exceeds monthly limit
 * - Async: Returns 202 immediately, email sent in background
 * - Usage accounting: Only charged after provider accepts (Phase 2 in worker)
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { enqueueEmail } from "../workers/emailWorker.js";

const router = Router();

/**
 * POST /emails/send
 * Queue an email for sending
 * 
 * Request body:
 * {
 *   "idempotency_key": "order-123",
 *   "to": "user@example.com",
 *   "from": "noreply@yourapp.com",
 *   "subject": "Your Order",
 *   "html": "<h1>Order confirmed</h1>",
 *   "text": "Order confirmed"
 * }
 * 
 * Response: 202 Accepted
 * {
 *   "id": 42
 * }
 */
router.post("/send", async (req, res) => {
  const { idempotency_key, to, from, subject, html, text } = req.body;
  const accountId = (req as any).account.accountId;

  // Validate required fields
  if (!idempotency_key || !to || !from || !subject) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["idempotency_key", "to", "from", "subject"],
    });
  }

  // Validate email format (simple)
  if (!to.includes("@") || !from.includes("@")) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    // Phase 1: Pre-check usage
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
      return res.status(401).json({ error: "Account not found" });
    }

    const sent = parseInt(usageResult.rows[0].sent);
    const limit = accountResult.rows[0].monthly_limit;

    if (sent >= limit) {
      const resetDate = new Date();
      resetDate.setMonth(resetDate.getMonth() + 1, 1);
      return res.status(429).json({
        error: "Monthly limit exceeded",
        reset_date: resetDate.toISOString().split("T")[0],
        sent,
        limit,
      });
    }

    // Phase 2: Insert email intent (idempotent)
    const result = await db.query(
      `
      INSERT INTO emails
      (account_id, idempotency_key, to_email, from_email, subject, html, text, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id
      `,
      [accountId, idempotency_key, to, from, subject, html || "", text || ""]
    );

    const emailId = result.rows[0].id;

    // Phase 3: Enqueue worker (fire and forget)
    try {
      await enqueueEmail(emailId);
    } catch (queueErr) {
      console.error("Failed to enqueue email:", queueErr);
      // Still return 202; email is in DB and can be retried
    }

    return res.status(202).json({ id: emailId });
  } catch (err: any) {
    // Idempotency: if duplicate key, return existing email ID
    if (err.code === "23505") {
      const existing = await db.query(
        `SELECT id FROM emails WHERE account_id=$1 AND idempotency_key=$2`,
        [accountId, idempotency_key]
      );
      if (existing.rows.length > 0) {
        return res.status(200).json({ id: existing.rows[0].id });
      }
    }

    console.error("Email send error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
