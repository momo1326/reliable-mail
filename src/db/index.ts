/**
 * Database Connection Pool
 * 
 * Manages PostgreSQL connections and exposes db.query() for all database operations.
 * Schema includes:
 * - accounts: billing and metadata
 * - api_keys: authentication (bcrypt-hashed)
 * - emails: email records with status tracking
 * - email_usage: append-only billing ledger (safe for audits and refunds)
 */

import { Pool } from "pg";

const pool = new Pool({
  user: process.env.POSTGRES_USER || "mail",
  password: process.env.POSTGRES_PASSWORD || "mail",
  database: process.env.POSTGRES_DB || "mail",
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};