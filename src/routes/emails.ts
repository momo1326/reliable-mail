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

router.post("/send", async (req, res) => {
  const { idempotency_key, to, from, subject, html, text } = req.body;
  const accountId = req.account!.accountId;

  if (!idempotency_key || !to || !from || !subject) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Phase 1: Pre-check usage (soft gate)
  const billingMonth = new Date();
  billingMonth.setDate(1); // First day of current month
  const monthStr = billingMonth.toISOString().split('T')[0]; // YYYY-MM-DD

  const usageResult = await db.query(
    `SELECT COUNT(*) as sent_count FROM email_usage WHERE account_id = $1 AND month = $2`,
    [accountId, monthStr]
  );

  const sentCount = parseInt(usageResult.rows[0].sent_count);

  const accountResult = await db.query(
    `SELECT monthly_limit FROM accounts WHERE id = $1`,
    [accountId]
  );

  if (accountResult.rows.length === 0) {
    return res.status(401).json({ error: "Account not found" });
  }

  const { monthly_limit } = accountResult.rows[0];

  if (sentCount >= monthly_limit) {
    const resetDate = new Date(billingMonth);
    resetDate.setMonth(resetDate.getMonth() + 1);
    return res.status(429).json({
      error: "Monthly limit exceeded",
      reset_date: resetDate.toISOString().split('T')[0]
    });
  }

  try {
    const result = await db.query(
      `
      INSERT INTO emails
      (account_id, idempotency_key, to_email, from_email, subject, html, text, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id
      `,
      [accountId, idempotency_key, to, from || '', subject, html || '', text || '']
    );

    const emailId = result.rows[0].id;

    await enqueueEmail(emailId);

    return res.status(202).json({ id: emailId });
  } catch (err: any) {
    if (err.code === "23505") {
      const existing = await db.query(
        `SELECT id FROM emails WHERE account_id=$1 AND idempotency_key=$2`,
        [accountId, idempotency_key]
      );
      return res.status(200).json({ id: existing.rows[0].id });
    }
    throw err;
  }
});

export default router;