# Core Guarantees

This document explains the core safety and reliability guarantees of Reliable Mail.

## 1. Idempotency

**What it means:** The same `idempotency_key` always produces the same result, never duplicates.

**How it works:**
- Every email request must include a unique `idempotency_key` per account.
- If you send the same request twice with the same key, you get the same email ID.
- The database enforces uniqueness: `UNIQUE(account_id, idempotency_key)`.

**Example:**
```bash
# First request
curl ... -d '{"idempotency_key": "order-123", ...}'
# Response: {"id": 42}

# Retry with same key
curl ... -d '{"idempotency_key": "order-123", ...}'
# Response: {"id": 42}  ← Same ID, not a new email
```

**Why it matters:**
- Prevents accidental duplicates if your retry logic fires twice.
- Gives you confidence to retry without fear of sending multiple emails.

---

## 2. Append-Only Billing Accounting

**What it means:** You are only charged for emails that the provider (Resend/SendGrid) actually accepts.

**How it works:**
- When you call `POST /emails/send`, the email is inserted into the database with status `pending`.
- **No usage is incremented yet.**
- A worker picks up the email and sends it to Resend.
- **Only after Resend returns success** do we insert a record into `email_usage`.
- The `email_usage` table is append-only and immutable (used for billing disputes).

**Example flow:**
```
1. POST /emails/send → email inserted, status='pending'
2. BullMQ worker picks up email
3. Send to Resend → SUCCESS (2xx + message_id)
4. INSERT into email_usage (now you're billed)
5. UPDATE email status='sent'
```

**If Resend fails:**
- Worker retries up to 5 times
- Each retry is NOT a new charge
- If all retries fail, status='failed', no charge

**Why it matters:**
- You pay only for emails that succeed.
- Prevents billing for failures or retries.
- Append-only design enables dispute resolution and refunds.

---

## 3. Exactly-Once Intent (No Duplicates in Provider)

**What it means:** We never send the same email twice to your provider, even if the system crashes mid-transaction.

**How it works:**
- Email insert (via idempotency) + BullMQ job + Resend send + usage accounting all happen atomically.
- If the worker crashes after Resend accepts but before we insert `email_usage`, the retry is idempotent: `ON CONFLICT (email_id) DO NOTHING`.
- This prevents double charges and double sends.

**Scenario:**
```
Worker sends to Resend → Resend returns 200 OK
Worker crashes before inserting email_usage
→ Retry occurs
→ ON CONFLICT DO NOTHING prevents double insert
→ Resend has a dedup key (our message_id), prevents duplicate send
```

**Why it matters:**
- Your customer doesn't get two emails.
- You don't get charged twice.
- System is resilient to crashes and network partitions.

---

## 4. Automatic Retries with Exponential Backoff

**What it means:** If Resend is temporarily down, we retry automatically.

**How it works:**
- BullMQ is configured with `attempts: 5`.
- Each retry uses exponential backoff: 2s, 4s, 8s, 16s, 32s.
- After 5 failed attempts, the email is marked `status='failed'` and an error is logged.

**Why it matters:**
- Transient failures (network blips) are handled automatically.
- You don't need custom retry logic in your application.
- Reduces operational burden.

---

## 5. API Key Authentication

**What it means:** Only authorized API keys can send emails.

**How it works:**
- All requests to `POST /emails/send` require a `Bearer sk_live_...` token.
- Keys are bcrypt-hashed in the database (we never store plaintext).
- On each request, we loop over active keys and compare with bcrypt (optimizable with prefixes later).
- Failed auth returns `401 Unauthorized`.

**Why it matters:**
- Your customer data is safe.
- Unauthorized users can't send emails on your account.
- API keys are properly secured (never plaintext).

---

## 6. Usage Limits & Hard Caps

**What it means:** Each account has a monthly email limit (default 1,000).

**How it works:**
- **Phase 1 (Pre-check):** Before inserting, we count successful emails from `email_usage` for the current month.
- If count >= limit, we reject with `429 Too Many Requests`.
- If under limit, we insert the email and enqueue the worker.
- **Phase 2 (Final):** Only when Resend succeeds do we increment the usage counter.

**Edge case (burst overshoot):**
- If 5 concurrent requests all pass pre-check and all send successfully, you may go 5x over limit.
- This is acceptable for MVP: "Hard caps enforced best-effort."
- In production, you'd add Redis atomic counters for strict enforcement.

**Why it matters:**
- Prevents runaway charges.
- Gives customers predictability on their monthly spend.
- Allows you to upsell higher tiers.

---

## 7. Provider Abstraction

**What it means:** You can swap Resend ↔ SendGrid without changing core logic.

**How it works:**
- The provider adapter is isolated in `src/workers/emailWorker.ts`.
- Only the `send()` call changes; retries, idempotency, and billing remain the same.
- Drop-in swap: replace `Resend` with `SGMail`, adjust the response parsing.

**Why it matters:**
- You're not locked into one provider.
- Easy to evaluate or migrate providers.
- If one provider has an outage, you can switch quickly.

---

## Summary

| Guarantee | How Enforced | Impact |
|-----------|--------------|--------|
| Idempotency | DB unique constraint | No accidental duplicates |
| Append-only billing | Separate `email_usage` table | Pay for success only |
| Exactly-once intent | Atomic transactions | No double-sends to provider |
| Automatic retries | BullMQ config | Handles transient failures |
| API key auth | Bcrypt comparison | Secure API access |
| Usage limits | Pre-check + final accounting | Cost control |
| Provider abstraction | Isolated adapter | Easy to swap providers |

---

## What This Means for Your Business

✅ **Customer Trust**: Idempotency + append-only billing = no surprise charges  
✅ **Operational Simplicity**: Retries happen automatically, no manual intervention  
✅ **Financial Safety**: Billing is accurate and auditable  
✅ **Flexibility**: Swap providers without rewriting code  

These guarantees are the foundation of a production-grade email service. They separate "works on my machine" from "safe to charge customers."
