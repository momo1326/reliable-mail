/**
 * Usage Service
 * 
 * Handles all billing and usage-related queries.
 * All operations are idempotent and append-only safe.
 */

import { db } from "../db/index.js";

/**
 * Get current month usage for an account (non-billable query)
 */
export async function getCurrentMonthUsage(accountId: number) {
  const result = await db.query(
    `
    SELECT COUNT(*) as sent FROM email_usage
    WHERE account_id = $1 AND month = date_trunc('month', now())::date
    `,
    [accountId]
  );
  return parseInt(result.rows[0].sent) || 0;
}

/**
 * Get account limit
 */
export async function getAccountLimit(accountId: number) {
  const result = await db.query(
    `SELECT monthly_limit FROM accounts WHERE id = $1`,
    [accountId]
  );
  return result.rows[0]?.monthly_limit || 0;
}

/**
 * Check if account is over limit
 */
export async function isOverLimit(accountId: number) {
  const usage = await getCurrentMonthUsage(accountId);
  const limit = await getAccountLimit(accountId);
  return usage >= limit;
}

/**
 * Get remaining quota
 */
export async function getRemainingQuota(accountId: number) {
  const usage = await getCurrentMonthUsage(accountId);
  const limit = await getAccountLimit(accountId);
  return Math.max(0, limit - usage);
}

/**
 * Record a successful send (called by worker after Resend/SendGrid success)
 * Idempotent: ON CONFLICT DO NOTHING prevents double-billing
 */
export async function recordSuccessfulSend(accountId: number, emailId: number) {
  const billingMonth = new Date();
  billingMonth.setDate(1); // First day of month

  await db.query(
    `
    INSERT INTO email_usage (account_id, email_id, month)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    `,
    [accountId, emailId, billingMonth.toISOString().split("T")[0]]
  );
}

/**
 * Get usage stats for period
 */
export async function getUsageStats(accountId: number, month?: Date) {
  const targetMonth = month || new Date();
  targetMonth.setDate(1);
  const monthStr = targetMonth.toISOString().split("T")[0];

  const result = await db.query(
    `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN eu.created_at > now() - interval '24 hours' THEN 1 END) as last_24h
    FROM email_usage eu
    WHERE eu.account_id = $1 AND eu.month = $2
    `,
    [accountId, monthStr]
  );

  return {
    total: parseInt(result.rows[0].total) || 0,
    last_24h: parseInt(result.rows[0].last_24h) || 0,
  };
}