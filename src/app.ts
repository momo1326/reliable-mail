declare global {
  namespace Express {
    interface Request {
      account?: {
        accountId: string;
        apiKeyId: string;
        rateLimit: number;
      };
    }
  }
}

import express from "express";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import emailRoutes from "./routes/emails.js";
import accountRoutes from "./routes/accounts.js";

const app = express();
app.use(express.json());

app.use("/accounts", accountRoutes);
app.use("/emails", apiKeyAuth, emailRoutes);

export default app;