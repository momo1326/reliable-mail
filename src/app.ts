/**
 * Express Application Setup
 * 
 * Middleware stack:
 * 1. Request logging
 * 2. JSON parser
 * 3. Health check (no auth)
 * 4. Account routes (registration no auth, others auth required)
 * 5. Email routes (auth + rate limiting required)
 * 6. Error handler
 */

import express, { Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { rateLimit } from "./middleware/rateLimit.js";
import emailRoutes from "./routes/emails.js";
import accountRoutes from "./routes/accounts.js";

declare global {
  namespace Express {
    interface Request {
      account?: {
        accountId: number;
        apiKeyId: number;
        rateLimit: number;
      };
    }
  }
}

const app = express();

// Middleware: JSON parser
app.use(express.json());

// Middleware: Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check (no auth required)
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Account routes
 * - POST /accounts/register (no auth)
 * - GET /accounts/me (auth required)
 * - GET /accounts/usage (auth required)
 * - DELETE /accounts/api-keys/:keyId (auth required)
 */
app.use("/accounts", accountRoutes);

/**
 * Email routes — requires API key auth + rate limiting
 */
app.use("/emails", apiKeyAuth, rateLimit, emailRoutes);

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * Error handler (must be last)
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[ERROR]", err);

  if (err.status === 401) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (err.status === 429) {
    return res.status(429).json({ error: "Rate limited" });
  }

  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

export default app;