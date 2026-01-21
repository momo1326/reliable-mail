import { Queue, Worker, Job } from "bullmq";
import { Resend } from "resend";
import { db } from "../db/index.js";

const resend = new Resend(process.env.RESEND_API_KEY!);

export const emailQueue = new Queue("emails", {
  connection: { host: "redis", port: 6379 }
});

export async function enqueueEmail(emailId: number) {
  await emailQueue.add(
    "send-email",
    { emailId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 }
    }
  );
}

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