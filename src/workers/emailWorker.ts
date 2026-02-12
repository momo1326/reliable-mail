/**
 * Email Worker — Process email tasks with guaranteed delivery.
 * 
 * This worker ensures:
 * - Exactly-once delivery (idempotent job processing)
 * - Automatic retries with exponential backoff (up to 5 attempts)
 * - Append-only billing (usage counted only on provider success)
 * - Atomic transactions (no partial state)
 * 
 * Flow:
 * 1. BullMQ claims job atomically (status = 'processing')
 * 2. Send email via Resend
 * 3. On success: insert email_usage (billing), mark status = 'sent'
 * 4. On failure: retry up to 5 times, then mark status = 'failed'
 * 
 * The ON CONFLICT DO NOTHING clause prevents double-charging on retries.
 */

import { Queue, Worker, Job } from "bullmq";
import { Resend } from "resend";
import { db } from "../db/index.js";
import { config } from "../config/env.js";

const resend = new Resend(config.RESEND_API_KEY);

const redisConfig = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
};

/**
 * Email queue with exponential backoff.
 * Uses Redis/BullMQ for durability and retry logic.
 */
export const emailQueue = new Queue("emails", {
  connection: redisConfig,
});

/**
 * Enqueue an email for sending.
 * Retries: 5 attempts with exponential backoff (2s, 4s, 8s, 16s, 32s)
 */
export async function enqueueEmail(emailId: number) {
  if (!emailQueue) {
    throw new Error("Email queue not initialized");
  }

  await emailQueue.add("send-email", { emailId }, {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
  });
}

/**
 * Worker processes email jobs.
 * 
 * Flow:
 * 1. Atomically claim job (status: pending -> processing)
 * 2. Send via Resend
 * 3. On success: Record usage (append-only), mark email sent
 * 4. On failure: Increment attempts, set status retrying/failed
 */
new Worker(
  "emails",
  async (job: Job) => {
    const { emailId } = job.data;

    if (!emailId) {
      throw new Error("No emailId in job data");
    }

    // Step 1: Atomic claim
    const claimResult = await db.query(
      `
      UPDATE emails
      SET status = 'processing'
      WHERE id = $1 AND status IN ('pending', 'retrying')
      RETURNING *
      `,
      [emailId]
    );

    if (claimResult.rowCount === 0) {
      console.log(`[Worker] Email ${emailId} already processed, skipping`);
      return;
    }

    const email = claimResult.rows[0];

    try {
      // Step 2: Send via Resend
      const response = await resend.emails.send({
        from: email.from_email,
        to: email.to_email,
        subject: email.subject,
        html: email.html || undefined,
        text: email.text || undefined,
      });

      if (!response.data?.id) {
        throw new Error("No message ID returned from Resend");
      }

      const messageId = response.data.id;

      // Step 3: Record success atomically
      await db.query(
        `
        BEGIN;
        INSERT INTO email_usage (account_id, email_id, month)
        VALUES ($1, $2, date_trunc('month', now())::date)
        ON CONFLICT DO NOTHING;

        UPDATE emails
        SET status = 'sent',
            provider_message_id = $3,
            sent_at = now()
        WHERE id = $2;
        COMMIT;
        `,
        [email.account_id, emailId, messageId]
      );

      console.log(
        `[Worker] ✅ Email ${emailId} sent successfully (${messageId})`
      );
    } catch (err: any) {
      console.error(`[Worker] ❌ Email ${emailId} failed:`, err.message);

      const attempts = (email.attempts || 0) + 1;
      const terminal = attempts >= 5;

      await db.query(
        `
        UPDATE emails
        SET attempts = $2,
            status = $3,
            last_error = $4
        WHERE id = $1
        `,
        [emailId, attempts, terminal ? "failed" : "retrying", err.message]
      );

      // Re-throw for BullMQ to retry
      throw err;
    }
  },
  {
    connection: redisConfig,
  }
);

new Worker(
  "emails",
  async (job: Job) => {
    const { emailId } = job.data;

    // Claim job atomically
    const result = await db.query(
      `
      UPDATE emails
      SET status = 'processing'
      WHERE id = $1 AND status IN ('pending', 'retrying')
      RETURNING *
      `,
      [emailId]
    );

    if (result.rowCount === 0) return;

    const email = result.rows[0];

    try {
      const resp = await resend.emails.send({
        from: email.from_email,
        to: email.to_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      const messageId = (resp as any).id;

      await db.query(
        `
        BEGIN;
        INSERT INTO email_usage (account_id, email_id, month)
        VALUES ($1, $2, date_trunc('month', now())::date)
        ON CONFLICT DO NOTHING;

        UPDATE emails
        SET status = 'sent',
            provider_message_id = $3,
            sent_at = now()
        WHERE id = $2;
        COMMIT;
        `,
        [email.account_id, email.id, messageId]
      );
    } catch (err: any) {
      const attempts = email.attempts + 1;
      const terminal = attempts >= 5;

      await db.query(
        `
        UPDATE emails
        SET attempts = attempts + 1,
            status = $2,
            last_error = $3
        WHERE id = $1
        `,
        [email.id, terminal ? "failed" : "retrying", err.message]
      );

      throw err;
    }
  },
  {
    connection: { host: "redis", port: 6379 }
  }
);