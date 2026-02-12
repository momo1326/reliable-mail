/**
 * Server Entry Point
 * 
 * Initialization sequence:
 * 1. Load config from env
 * 2. Initialize database + schema
 * 3. Initialize rate limiter (Redis)
 * 4. Start Express server
 * 5. Setup graceful shutdown
 */

import app from "./app.js";
import { initializeDatabase, closeDatabase } from "./db/index.js";
import { initializeRateLimiter } from "./middleware/rateLimit.js";
import { config } from "./config/env.js";

async function start() {
  try {
    console.log("🚀 Reliable Mail starting...");

    // Step 1: Initialize database
    console.log("📦 Initializing database...");
    await initializeDatabase();

    // Step 2: Initialize rate limiter
    console.log("⚡ Initializing rate limiter...");
    await initializeRateLimiter();

    // Step 3: Start server
    const server = app.listen(config.PORT, () => {
      console.log(`\n✅ API running on http://localhost:${config.PORT}`);
      console.log(`📝 Environment: ${config.NODE_ENV}`);
      console.log(`🔑 Redis: ${config.REDIS_HOST}:${config.REDIS_PORT}`);
      console.log(`💾 Database: ${config.POSTGRES_HOST}:${config.POSTGRES_PORT}`);
      console.log(`\nReady to receive requests...\n`);
    });

    // Step 4: Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      server.close(async () => {
        await closeDatabase();
        console.log("✅ Server stopped");
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error("❌ Forced shutdown after 10s timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();