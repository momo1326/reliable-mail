"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    user: process.env.POSTGRES_USER || "mail",
    password: process.env.POSTGRES_PASSWORD || "mail",
    database: process.env.POSTGRES_DB || "mail",
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
});
exports.db = {
    query: (text, params) => pool.query(text, params),
};
//# sourceMappingURL=index.js.map