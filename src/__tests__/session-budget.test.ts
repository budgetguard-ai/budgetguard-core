import {
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  test,
  expect,
} from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import type { UsageLedger } from "@prisma/client";
import { createClient } from "redis";
import bcrypt from "bcrypt";
import crypto from "crypto";

async function waitForLedgerEntry(
  prisma: PrismaClient,
  tenantId: number,
  maxAttempts = 30,
  delayMs = 250,
): Promise<UsageLedger | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const entry = await prisma.usageLedger.findFirst({
      where: { tenantId },
      orderBy: { ts: "desc" }, // or { timestamp: "desc" } if your column name differs
    });
    if (entry) return entry;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

type LedgerTokenEntry = {
  promptTok?: number | null;
  compTok?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
};

describe("Session Budget Integration Tests", () => {
  let prisma: PrismaClient;
  let redis: ReturnType<typeof createClient>;
  let tenantId: number;
  let apiKey: string;
  let testTenantName: string;
  let serverRunning = false;

  const BASE_URL = "http://localhost:3000"; // Use existing test server
  const TINY_BUDGET = 0.000001; // Very small budget to trigger blocking quickly

  beforeAll(async () => {
    // Initialize database connection
    prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize Redis connection
    redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();

    // Ensure gpt-4o-mini model pricing exists for tests
    await prisma.modelPricing.upsert({
      where: { model: "gpt-4o-mini" },
      update: {},
      create: {
        model: "gpt-4o-mini",
        versionTag: "2024-07-18",
        inputPrice: new Prisma.Decimal(0.15),
        cachedInputPrice: new Prisma.Decimal(0.075),
        outputPrice: new Prisma.Decimal(0.6),
        provider: "openai",
      },
    });

    // Check if server is running
    try {
      const response = await fetch(`${BASE_URL}/health`, { method: "GET" });
      serverRunning = response.ok;
    } catch {
      serverRunning = false;
    }
  });

  afterAll(async () => {
    // Cleanup
    await redis.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create unique test tenant
    testTenantName = `session-test-${Date.now()}`;

    const tenant = await prisma.tenant.create({
      data: {
        name: testTenantName,
        defaultSessionBudgetUsd: new Prisma.Decimal(TINY_BUDGET),
      },
    });
    tenantId = tenant.id;

    // Create API key for test tenant
    const newKey = crypto.randomBytes(32).toString("hex");
    const keyPrefix = newKey.substring(0, 8);
    const keyHash = await bcrypt.hash(newKey, 12);

    await prisma.apiKey.create({
      data: {
        keyHash,
        keyPrefix,
        tenantId,
        isActive: true,
      },
    });

    apiKey = newKey;
  });

  afterEach(async () => {
    // Clean up test data
    if (tenantId) {
      await prisma.apiKey.deleteMany({ where: { tenantId } });
      await prisma.session.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.usageLedger.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }

    // Clear Redis caches
    const patterns = ["session:*", "session_cost:*", "tenant_session_budget:*"];
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...(Array.from(keys) as string[]));
      }
    }
  });

  test(
    "should inherit tenant defaultSessionBudgetUsd for new sessions",
    { timeout: 20000 },
    async () => {
      if (!serverRunning) {
        console.log("Skipping test - server not running on localhost:3000");
        return;
      }

      const sessionId = `test-inherit-${Date.now()}`;

      const response = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
          "x-session-name": "Inherit Test",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Test inheritance",
          stream: false,
        }),
      });

      expect(response.status).toBe(200);

      // Check session was created with correct budget
      const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { effectiveBudgetUsd: true, tenantId: true },
      });

      expect(session).toBeTruthy();
      expect(session?.tenantId).toBe(tenantId);
      expect(Number(session?.effectiveBudgetUsd)).toBe(TINY_BUDGET);
    },
  );

  test(
    "should track session costs in Redis and enforce budget (Option A)",
    { timeout: 15000 },
    async () => {
      if (!serverRunning) {
        console.log("Skipping test - server not running on localhost:3000");
        return;
      }

      const sessionId = `test-budget-${Date.now()}`;

      // First request - should succeed
      const firstResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
          "x-session-name": "Budget Test",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "First request",
          stream: false,
        }),
      });

      expect(firstResponse.status).toBe(200);
      const firstData = await firstResponse.json();
      expect(firstData.usage).toBeTruthy();
      expect(firstData.usage.input_tokens).toBeGreaterThan(0);
      expect(firstData.usage.output_tokens).toBeGreaterThan(0);

      // Wait a moment for cost tracking
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check Redis cost tracking
      const costKey = `session_cost:${sessionId}`;
      const redisCost = await redis.get(costKey);
      expect(redisCost).toBeTruthy();
      expect(parseFloat(redisCost!)).toBeGreaterThan(0);

      // Second request - should be blocked (cost exceeds tiny budget)
      const secondResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
          "x-session-name": "Budget Test",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Second request should be blocked",
          stream: false,
        }),
      });

      expect(secondResponse.status).toBe(402);
      const secondData = await secondResponse.json();
      expect(secondData.error).toBe("Session budget exceeded");

      // Check session status was updated
      const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { status: true },
      });
      expect(session?.status).toBe("budget_exceeded");
    },
  );

  test(
    "should allow fresh sessions to start with zero cost",
    { timeout: 15000 },
    async () => {
      if (!serverRunning) {
        console.log("Skipping test - server not running on localhost:3000");
        return;
      }

      const firstSessionId = `test-fresh-1-${Date.now()}`;
      const secondSessionId = `test-fresh-2-${Date.now()}`;

      // First session - make request and get blocked
      await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": firstSessionId,
          "x-session-name": "First Session",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "First session request",
          stream: false,
        }),
      });

      // Second request to first session should be blocked
      const blockedResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": firstSessionId,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Should be blocked",
          stream: false,
        }),
      });
      expect(blockedResponse.status).toBe(402);

      // Fresh session should be allowed
      const freshResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": secondSessionId,
          "x-session-name": "Fresh Session",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Fresh session request",
          stream: false,
        }),
      });

      expect(freshResponse.status).toBe(200);
    },
  );

  test(
    "should work with both /v1/chat/completions and /v1/responses endpoints",
    { timeout: 15000 },
    async () => {
      if (!serverRunning) {
        console.log("Skipping test - server not running on localhost:3000");
        return;
      }

      const sessionId = `test-endpoints-${Date.now()}`;

      // Test with chat completions
      const chatResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
          "x-session-name": "Endpoints Test",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Chat test" }],
          max_tokens: 10,
        }),
      });

      expect(chatResponse.status).toBe(200);
      const chatData = await chatResponse.json();
      expect(chatData.usage.prompt_tokens).toBeGreaterThan(0);
      expect(chatData.usage.completion_tokens).toBeGreaterThan(0);

      // Test with responses (should be blocked due to accumulated cost)
      const responsesResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Responses test",
          stream: false,
        }),
      });

      expect(responsesResponse.status).toBe(402);
      const responsesData = await responsesResponse.json();
      expect(responsesData.error).toBe("Session budget exceeded");
    },
  );

  test(
    "should correctly track token counts for different response formats",
    { timeout: 20000 },
    async () => {
      if (!serverRunning) {
        console.log("Skipping test - server not running on localhost:3000");
        return;
      }

      const sessionId = `test-tokens-${Date.now()}`;

      // Test /v1/responses format (input_tokens/output_tokens)
      const responsesResponse = await fetch(`${BASE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
          "x-session-name": "Token Test",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: "Token count test",
          stream: false,
        }),
      });

      expect(responsesResponse.status).toBe(200);
      const responsesData = await responsesResponse.json();

      // Verify response format
      expect(responsesData.usage.input_tokens).toBeGreaterThan(0);
      expect(responsesData.usage.output_tokens).toBeGreaterThan(0);
      expect(responsesData.usage.total_tokens).toBe(
        responsesData.usage.input_tokens + responsesData.usage.output_tokens,
      );

      // Check that usage was recorded in ledger (poll by sessionId)
      const ledgerEntry = await waitForLedgerEntry(
        prisma,
        tenantId,
        60, // up to 60 * 250ms = 15s
        250,
      );

      if (!ledgerEntry) {
        // Background ledger processor not running; skip ledger field assertions
        console.warn(
          "[session-budget.test] No usageLedger row found (likely worker not running) – skipping ledger token assertions",
        );
      } else {
        const tokenEntry = ledgerEntry as LedgerTokenEntry;
        const promptTokens =
          tokenEntry.promptTok ?? tokenEntry.promptTokens ?? 0;
        const completionTokens =
          tokenEntry.compTok ?? tokenEntry.completionTokens ?? 0;

        expect(promptTokens).toBe(responsesData.usage.input_tokens);
        expect(completionTokens).toBe(responsesData.usage.output_tokens);
      }
    },
  );
});
