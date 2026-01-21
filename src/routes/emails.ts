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

  try {
    const result = await db.query(
      `
      INSERT INTO emails
      (account_id, idempotency_key, to_email, subject, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id
      `,
      [accountId, idempotency_key, to, subject]
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