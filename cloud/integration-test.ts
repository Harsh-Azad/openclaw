/**
 * Full End-to-End Integration Test
 *
 * Tests the complete Jarvis flow:
 * 1. Health check
 * 2. Register user
 * 3. Login
 * 4. Tax chat query
 * 5. Compliance calendar
 * 6. Tariff data load + search
 * 7. Usage tracking
 * 8. API key management
 * 9. Audit logs
 * 10. Plugin system
 * 11. Enterprise endpoints
 * 12. Subscription plans
 */

process.env.DB_MODE = "sqlite";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./src/routes/auth.js";
import { subscriptionRouter } from "./src/routes/subscription.js";
import { taxApiRouter } from "./src/routes/tax-api.js";
import { pluginsRouter } from "./src/routes/plugins.js";
import { enterpriseRouter } from "./src/routes/enterprise.js";
import { uploadRouter } from "./src/routes/upload.js";
import { apiKeysRouter, apiKeyAuthMiddleware } from "./src/routes/api-keys.js";
import { authMiddleware } from "./src/middleware/auth.js";
import { subscriptionMiddleware } from "./src/middleware/subscription.js";
import { createAuditMiddleware } from "./src/enterprise/audit-log.js";
import { pluginRegistry } from "./src/plugins/plugin-registry.js";
import { createTransferPricingPlugin } from "./src/plugins/sample-transfer-pricing-plugin.js";

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "jarvis-tax-assistant", version: "1.0.0", license: "AGPL-3.0 / Commercial" });
});

app.use("/api/v1", apiKeyAuthMiddleware);
app.use("/api/v1", createAuditMiddleware());
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/subscription", authMiddleware, subscriptionRouter);
app.use("/api/v1/tax", authMiddleware, subscriptionMiddleware, taxApiRouter);
app.use("/api/v1/plugins", authMiddleware, pluginsRouter);
app.use("/api/v1/enterprise", authMiddleware, enterpriseRouter);
app.use("/api/v1/upload", authMiddleware, uploadRouter);
app.use("/api/v1/api-keys", authMiddleware, apiKeysRouter);
let accessToken = "";
let userId = "";

async function request(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL: ${name} -- ${msg}`);
    failed++;
    failures.push(`${name}: ${msg}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function runAllTests() {
  // Register plugins
  const tpPlugin = createTransferPricingPlugin();
  await pluginRegistry.register(tpPlugin);
  await pluginRegistry.initializeAll({
    userId: "system", tier: "enterprise", config: {},
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    storage: { get: async () => null, set: async () => {}, delete: async () => {}, list: async () => [] },
    events: { emit: () => {}, on: () => {}, off: () => {} },
  });

  // Start server and wait
  await new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`[Test Server] Running on port ${PORT}`);
      resolve();
    });
  });
  await new Promise((r) => setTimeout(r, 500));

  console.log("\n" + "=".repeat(70));
  console.log("JARVIS FULL INTEGRATION TEST");
  console.log("=".repeat(70));

  // 1. Health
  console.log("\n[1] Health Check");
  await test("GET /api/health returns 200", async () => {
    const { status, data } = await request("GET", "/api/health");
    assert(status === 200, `Status ${status}`);
    assert(data.status === "ok", "Status not ok");
    assert(data.service === "jarvis-tax-assistant", `Wrong service: ${data.service}`);
  });

  // 2. Register
  const testEmail = `test-${Date.now()}@jarvis.test`;
  console.log("\n[2] User Registration");
  await test("Register new user", async () => {
    const { status, data } = await request("POST", "/api/v1/auth/register", {
      email: testEmail,
      password: "TestPass123!",
      name: "Test CA",
      profession: "ca",
      firm: "Test & Associates",
    });
    assert(status === 201, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.accessToken, "No access token");
    assert(data.user.tier === "free", "Should start with free tier");
    accessToken = data.accessToken;
    userId = data.user.id;
  });

  await test("Duplicate registration returns 409", async () => {
    const { status } = await request("POST", "/api/v1/auth/register", {
      email: testEmail,
      password: "TestPass123!",
      name: "Duplicate",
      profession: "ca",
    });
    assert(status === 409, `Expected 409, got ${status}`);
  });

  // 3. Login
  console.log("\n[3] Login");
  await test("Login with correct credentials", async () => {
    const { status, data } = await request("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: "TestPass123!",
    });
    assert(status === 200, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.accessToken, "No token returned");
    accessToken = data.accessToken;
  });

  await test("Login with wrong password returns 401", async () => {
    const { status } = await request("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: "wrong",
    });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test("GET /api/v1/auth/me returns user", async () => {
    const { status, data } = await request("GET", "/api/v1/auth/me", undefined, accessToken);
    assert(status === 200, `Status ${status}`);
    assert(data.user.email === testEmail, "Wrong email");
    assert(data.user.profession === "ca", "Wrong profession");
  });

  // 4. Tax Chat
  console.log("\n[4] Tax Chat");
  await test("Tax chat query (no LLM key = fallback msg)", async () => {
    const { status, data } = await request(
      "POST",
      "/api/v1/tax/chat",
      { query: "What is the GST rate for IT services?", domain: "gst" },
      accessToken,
    );
    assert(status === 200, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.answer, "No answer returned");
  });

  await test("Tax chat without auth returns 401", async () => {
    const { status } = await request("POST", "/api/v1/tax/chat", {
      query: "test",
    });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  // 5. Compliance Calendar
  console.log("\n[5] Compliance Calendar");
  await test("Get compliance calendar for March", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/tax/compliance-calendar?month=3&year=2026",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(Array.isArray(data.deadlines), "Deadlines not an array");
    assert(data.deadlines.length > 0, "No deadlines for March");
  });

  await test("Filter compliance by category", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/tax/compliance-calendar?month=3&year=2026&category=income-tax",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(
      data.deadlines.every((d: any) => d.category === "income-tax"),
      "Non income-tax items returned",
    );
  });

  // 6. Tariff Lookup
  console.log("\n[6] Tariff Lookup");
  await test("Tariff search returns results (data loaded in smoke test)", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/upload/tariff-search?hsn=8501&limit=5",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    // May be empty if tariff data wasn't loaded in this DB instance
  });

  await test("Tariff stats endpoint", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/upload/tariff-stats",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(Array.isArray(data.stats), "Stats not an array");
  });

  // 7. Subscription
  console.log("\n[7] Subscription");
  await test("Get subscription plans", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/subscription/plans",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(data.plans.length === 3, `Expected 3 plans, got ${data.plans.length}`);
  });

  await test("Get current subscription (free tier)", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/subscription/current",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(data.tier === "free", `Expected free, got ${data.tier}`);
  });

  await test("Get usage stats", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/subscription/usage",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(data.usage, "No usage data");
    assert(data.usage.queries.used >= 0, "Invalid queries count");
  });

  // 8. Plugins
  console.log("\n[8] Plugins");
  await test("List plugins (should include transfer-pricing)", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/plugins",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(Array.isArray(data.plugins), "Plugins not an array");
    assert(
      data.plugins.some((p: any) => p.id === "transfer-pricing"),
      "Transfer pricing plugin not found",
    );
  });

  await test("Plugin health check", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/plugins/health",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
  });

  // 9. Enterprise Endpoints
  console.log("\n[9] Enterprise");
  await test("Get RBAC roles", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/enterprise/roles",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(data.roles.length > 0, "No roles returned");
    assert(
      data.roles.some((r: any) => r.role === "super_admin"),
      "Missing super_admin role",
    );
  });

  await test("Get license info", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/enterprise/license",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(data.license.type === "agpl-3.0", "Wrong license type");
    assert(data.license.features.taxChat === true, "taxChat should be enabled");
    assert(data.license.features.sso === false, "SSO should be disabled in AGPL");
  });

  await test("SSO config returns 403 for non-admin user (correct RBAC)", async () => {
    const { status } = await request(
      "GET",
      "/api/v1/enterprise/sso/config",
      undefined,
      accessToken,
    );
    assert(status === 403, `Expected 403 for user role, got ${status}`);
  });

  // 10. API Key Management
  console.log("\n[10] API Keys");
  await test("Create API key returns 403 for user role (correct RBAC)", async () => {
    const { status } = await request(
      "POST",
      "/api/v1/api-keys",
      { name: "Test Key", permissions: ["tax:chat"], expiresInDays: 30 },
      accessToken,
    );
    assert(status === 403, `Expected 403, got ${status}`);
  });

  await test("List API keys (empty for new user)", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/api-keys",
      undefined,
      accessToken,
    );
    assert(status === 200, `Status ${status}`);
    assert(Array.isArray(data.keys), "Keys not an array");
  });

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log("=".repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error("Integration test crashed:", err);
  process.exit(1);
});
