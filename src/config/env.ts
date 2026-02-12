/**
 * Environment Configuration
 * 
 * All configuration comes from environment variables.
 * See .env.example for required variables.
 */

export const config = {
  // Provider
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || "",

  // Database
  POSTGRES_USER: process.env.POSTGRES_USER || "mail",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "mail",
  POSTGRES_DB: process.env.POSTGRES_DB || "mail",
  POSTGRES_HOST: process.env.POSTGRES_HOST || "localhost",
  POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || "5432"),
  DATABASE_URL: process.env.DATABASE_URL || 
    `postgresql://${process.env.POSTGRES_USER || "mail"}:${process.env.POSTGRES_PASSWORD || "mail"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "mail"}`,

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || "redis",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379"),

  // Server
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000"),

  // Feature flags
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== "false",
};

// Validation
if (!config.RESEND_API_KEY && !config.SENDGRID_API_KEY) {
  console.warn("⚠️  WARNING: Neither RESEND_API_KEY nor SENDGRID_API_KEY is set. Email sending will fail.");
}