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
    account_id INTEGER REFERENCES accounts(id),
    key_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Emails table
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    idempotency_key VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    from_email VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    html TEXT,
    text TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    provider_message_id VARCHAR(255),
    sent_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, idempotency_key)
);

-- Email Usage table (append-only for billing)
CREATE TABLE IF NOT EXISTS email_usage (
    id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    email_id INTEGER NOT NULL REFERENCES emails(id),
    month DATE NOT NULL, -- first day of month
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email_id)
);