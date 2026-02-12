# Reliable Mail

**A transactional email API that guarantees exactly-once delivery, retry handling, and zero duplicates.**

Reliable Mail is a production-grade email service that handles idempotent email sending with automatic retries, append-only billing accounting, and provider abstraction (Resend/SendGrid).

## Quick Start

### Live Demo
API is live at **tbd** — contact for early access.

### Run Locally

**Prerequisites:**
- Docker & Docker Compose
- Node.js 18+
- A Resend API key (free tier available)

**Steps:**

```bash
# Clone and setup
git clone https://github.com/momo1326/reliable-mail.git
cd reliable-mail

# Set environment variables
cp .env.example .env
# Edit .env and add your RESEND_API_KEY

# Start services
docker-compose up -d

# Build TypeScript
npm install
npm run build

# Verify API is running
curl http://localhost:3000/health
```

The API runs on `http://localhost:3000`.

---

## Core Guarantees

✅ **Idempotency** — Same `idempotency_key` always returns the same email ID, never duplicates  
✅ **Async Retries** — Failed emails automatically retry with exponential backoff (up to 5 attempts)  
✅ **Append-Only Billing** — Usage counted only after Resend accepts the email  
✅ **API Key Auth** — Bearer token authentication with bcrypt-hashed keys  
✅ **Exactly-Once Intent** — Database transactions prevent double-sends  

For detailed guarantees, see [CORE_GUARANTEES.md](./CORE_GUARANTEES.md).

---

## Example Usage

### Send an Email

```bash
curl -X POST http://localhost:3000/emails/send \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "order-receipt-12345",
    "to": "customer@example.com",
    "from": "noreply@yourcompany.com",
    "subject": "Order Confirmation",
    "html": "<h1>Your order is confirmed</h1>",
    "text": "Your order is confirmed"
  }'
```

**Response (202 Accepted):**
```json
{
  "id": 42
}
```

### Resend Same Email (Idempotent)

```bash
curl -X POST http://localhost:3000/emails/send \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "order-receipt-12345",
    ...
}'
```

Returns the **same email ID**, not a duplicate.

---

## Environment Variables

See `.env.example` for all required variables:

```bash
RESEND_API_KEY=          # Transactional email provider
POSTGRES_USER=mail
POSTGRES_PASSWORD=mail
POSTGRES_DB=mail
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

---

## Architecture

```
POST /emails/send
    ↓
[Phase 1: Pre-check usage]
    ↓ (if under limit)
[Insert email, enqueue worker, return 202]
    ↓
[BullMQ Worker claims job]
    ↓
[Send via Resend]
    ↓ (if success)
[Phase 2: Append to email_usage, mark sent]
```

- **API**: Express.js with TypeScript
- **Database**: PostgreSQL (accounts, api_keys, emails, email_usage)
- **Queue**: BullMQ (Redis-backed)
- **Provider**: Resend (transactional email)
- **Auth**: API key + bcrypt

---

## Testing

Run the test suite:

```bash
npm test
```

Tests verify:
- ✅ POST /emails/send returns 202
- ✅ Idempotent requests return same email ID
- ✅ Over-limit requests rejected with 429

---

## Project Status

🚀 **MVP ready** — Core functionality complete  
🔄 **In development** — Rate limiting, metrics endpoints  

---

## License

MIT