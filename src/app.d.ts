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
declare const app: import("express-serve-static-core").Express;
export default app;
//# sourceMappingURL=app.d.ts.map