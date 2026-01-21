"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const emails_1 = __importDefault(require("./routes/emails"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use("/accounts", accounts_1.default);
app.use("/emails", apiKeyAuth_1.apiKeyAuth, emails_1.default);
exports.default = app;
//# sourceMappingURL=app.js.map