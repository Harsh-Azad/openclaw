import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.js";
import { subscriptionRouter } from "./routes/subscription.js";
import { taxApiRouter } from "./routes/tax-api.js";
import { pluginsRouter } from "./routes/plugins.js";
import { enterpriseRouter } from "./routes/enterprise.js";
import { uploadRouter } from "./routes/upload.js";
import { apiKeysRouter, apiKeyAuthMiddleware } from "./routes/api-keys.js";
import { ragRouter } from "./routes/rag.js";
import { pluginRegistry } from "./plugins/plugin-registry.js";
import { createTransferPricingPlugin } from "./plugins/sample-transfer-pricing-plugin.js";
import { authMiddleware } from "./middleware/auth.js";
import { subscriptionMiddleware } from "./middleware/subscription.js";
import { createAuditMiddleware } from "./enterprise/audit-log.js";
import { tenantRouter, tenantMiddleware, initMultiTenantTables } from "./enterprise/multi-tenant.js";
import { ssoRouter, initSSOTables } from "./enterprise/sso.js";
import { auditExportRouter } from "./enterprise/audit-export.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "jarvis-tax-assistant",
    version: "1.0.0",
    license: "AGPL-3.0 / Commercial",
  });
});

// API key auth (before JWT middleware, allows both auth methods)
app.use("/api/v1", apiKeyAuthMiddleware);

// Audit middleware for enterprise compliance
app.use("/api/v1", createAuditMiddleware());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/subscription", authMiddleware, subscriptionRouter);
app.use("/api/v1/tax", authMiddleware, subscriptionMiddleware, taxApiRouter);
app.use("/api/v1/plugins", authMiddleware, pluginsRouter);
app.use("/api/v1/enterprise", authMiddleware, enterpriseRouter);
app.use("/api/v1/upload", authMiddleware, uploadRouter);
app.use("/api/v1/api-keys", authMiddleware, apiKeysRouter);
app.use("/api/v1/rag", authMiddleware, ragRouter);
app.use("/api/v1/tenant", authMiddleware, tenantMiddleware(), tenantRouter);
app.use("/api/v1/sso", ssoRouter);
app.use("/api/v1/audit", authMiddleware, tenantMiddleware(), auditExportRouter);

// Serve frontend -- resolve from project root (cloud/)
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[Jarvis Cloud Error]", err.message);
    res.status(500).json({ error: "Internal server error" });
  },
);

async function startServer() {
  // Initialize enterprise tables
  try {
    await initMultiTenantTables();
    await initSSOTables();
  } catch (err) {
    console.warn("[Jarvis Cloud] Enterprise table init warning:", err);
  }

  // Register built-in plugins
  try {
    const tpPlugin = createTransferPricingPlugin();
    await pluginRegistry.register(tpPlugin);
    await pluginRegistry.initializeAll({
      userId: "system",
      tier: "enterprise",
      config: {},
      logger: {
        info: (msg: string) => console.log(`[Plugin] ${msg}`),
        warn: (msg: string) => console.warn(`[Plugin] ${msg}`),
        error: (msg: string) => console.error(`[Plugin] ${msg}`),
        debug: (msg: string) => {},
      },
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        list: async () => [],
      },
      events: {
        emit: () => {},
        on: () => {},
        off: () => {},
      },
    });
    console.log(`[Jarvis Cloud] Plugins loaded: ${pluginRegistry.getPlugins().length}`);
  } catch (err) {
    console.warn("[Jarvis Cloud] Plugin initialization warning:", err);
  }

  app.listen(PORT, () => {
    console.log(`[Jarvis Cloud] Server running on port ${PORT}`);
    console.log(`[Jarvis Cloud] License: AGPL-3.0 / Commercial`);
    console.log(`[Jarvis Cloud] API: http://localhost:${PORT}/api/health`);
  });
}

startServer();

export default app;
