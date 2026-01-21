"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const db_1 = require("../db");
async function apiKeyAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "API key missing"
        });
    }
    const rawKey = header.replace("Bearer ", "").trim();
    // Fast reject
    if (!rawKey.startsWith("sk_live_")) {
        return res.status(401).json({ error: "Invalid API key" });
    }
    // Fetch candidate keys (prefix optimization later)
    const keys = await db_1.db.query(`SELECT * FROM api_keys WHERE is_active = true`);
    for (const key of keys.rows) {
        const match = await bcrypt_1.default.compare(rawKey, key.key_hash);
        if (match) {
            // Attach tenant context
            req.account = {
                accountId: key.account_id,
                apiKeyId: key.id,
                rateLimit: key.rate_limit_per_minute
            };
            return next();
        }
    }
    return res.status(401).json({ error: "Invalid API key" });
}
//# sourceMappingURL=apiKeyAuth.js.map