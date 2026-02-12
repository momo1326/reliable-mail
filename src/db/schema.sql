-- Database schema for reliable-mail

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    monthly_limit INTEGER DEFAULT 1000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Emails table
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html TEXT,
    text TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    provider_message_id VARCHAR(255),
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, idempotency_key)
);

-- Email Usage table (append-only for billing)
CREATE TABLE IF NOT EXISTS email_usage (
    id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emails_account_status ON emails(account_id, status);
CREATE INDEX IF NOT EXISTS idx_emails_account_idempotency ON emails(account_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_email_usage_account_month ON email_usage(account_id, month);
CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_email_usage_created_at ON email_usage(created_at);