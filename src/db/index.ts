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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle database connection:", err);
});

/**
 * Initialize database schema on startup
 * Reads schema.sql and executes it
 */
export async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    await pool.query(schema);
    console.log("✅ Database schema initialized");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    throw err;
  }
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDatabase() {
  await pool.end();
}

export const db = pool;