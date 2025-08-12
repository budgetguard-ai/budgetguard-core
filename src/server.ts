import fastify, {
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createClient } from "redis";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { countTokensAndCost } from "./token.js";
import {
  ledgerKey,
  getBudgetPeriods,
  ALLOWED_PERIODS,
  isValidPeriod,
  type Period,
} from "./ledger.js";
import { evaluatePolicy } from "./policy/opa.js";
import {
  readBudget,
  writeBudget,
  deleteBudget,
  readBudgetsOptimized,
} from "./budget.js";
import { readRateLimit, writeRateLimit } from "./rate-limit.js";
import type { CompletionRequest } from "./providers/base.js";
import {
  getProviderForModel,
  DatabaseProviderSelector,
  type ProviderType,
} from "./provider-selector.js";
import {
  authenticateApiKey,
  cleanupApiKeyCache,
  deactivateApiKeyInCache,
} from "./auth-utils.js";
import { checkTagBudgets, checkHierarchicalTagBudgets } from "./tag-budget.js";
import { validateAndCacheTagSet, invalidateTagCache } from "./tag-cache.js";

// TypeScript interfaces for type safety
interface ValidatedTag {
  id: number;
  name: string;
  weight: number;
}

interface TagWhereClause {
  tenantId: number;
  isActive?: boolean;
  parentId?: number;
}

interface AuthContext {
  keyAuth: { id: number; tenantId: number };
  tenant: { id: number; name: string };
}

interface RequestWithTags extends FastifyRequest {
  validatedTags?: ValidatedTag[];
  authContext?: AuthContext;
}

interface TagUpdateData {
  name?: string;
  description?: string;
  parentId?: number;
  color?: string;
  metadata?: Prisma.InputJsonValue;
  isActive?: boolean;
  path?: string;
}

interface TagBudgetUpdateData {
  amountUsd?: string;
  startDate?: Date;
  endDate?: Date;
  weight?: number;
  alertThresholds?: Prisma.InputJsonValue;
  inheritanceMode?: string;
  isActive?: boolean;
}

dotenv.config();

// Time constants
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const ONE_MINUTE_IN_MS = 60 * 1000;

const DEFAULT_BUDGET = Number(
  process.env.DEFAULT_BUDGET_USD || process.env.MAX_MONTHLY_USD || 50,
);

const BUDGET_PERIODS = getBudgetPeriods();

// Helper function to extract and validate tags from headers with Redis caching
async function extractAndValidateTags(
  headers: Record<string, string | string[] | undefined>,
  tenantId: number,
  prisma: PrismaClient,
  redis?: ReturnType<typeof createClient>,
): Promise<Array<{ id: number; name: string; weight: number }>> {
  const validatedTags: Array<{ id: number; name: string; weight: number }> = [];
  const budgetTagsHeaderRaw = headers["x-budget-tags"];

  // Handle array headers by taking the first element, or convert to string
  const budgetTagsHeader = Array.isArray(budgetTagsHeaderRaw)
    ? budgetTagsHeaderRaw[0]
    : budgetTagsHeaderRaw;

  if (!budgetTagsHeader || typeof budgetTagsHeader !== "string") {
    return validatedTags;
  }

  const tagNames = budgetTagsHeader
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (tagNames.length === 0) {
    return validatedTags;
  }

  // Use cached validation for better performance
  return await validateAndCacheTagSet(tagNames, tenantId, redis, prisma);
}

// Helper function to write budget cache for both recurring and custom budgets
async function writeBudgetCache(
  budget: {
    period: string;
    amountUsd: string | number | Prisma.Decimal;
    startDate?: Date | null;
    endDate?: Date | null;
  },
  tenantName: string,
  prisma: import("@prisma/client").PrismaClient,
  redisClient: ReturnType<typeof createClient> | undefined,
  customStartDate?: Date,
  customEndDate?: Date,
) {
  if (budget.period === "daily" || budget.period === "monthly") {
    // For recurring budgets, write cache with current period dates
    const { startDate: currentStart, endDate: currentEnd } = await readBudget({
      tenant: tenantName,
      period: budget.period,
      prisma,
      redis: redisClient,
      defaultBudget: DEFAULT_BUDGET,
    });
    await writeBudget(
      tenantName,
      budget.period,
      parseFloat(budget.amountUsd.toString()),
      currentStart,
      currentEnd,
      redisClient,
    );
  } else if (customStartDate && customEndDate) {
    // For custom budgets, use provided dates
    await writeBudget(
      tenantName,
      budget.period,
      parseFloat(budget.amountUsd.toString()),
      customStartDate,
      customEndDate,
      redisClient,
    );
  } else if (budget.startDate && budget.endDate) {
    // For custom budgets using budget's own dates
    await writeBudget(
      tenantName,
      budget.period,
      parseFloat(budget.amountUsd.toString()),
      budget.startDate,
      budget.endDate,
      redisClient,
    );
  }
}

// Export for testing
export { extractAndValidateTags };

export async function buildServer() {
  const app = fastify({
    logger: true,
    ajv: { customOptions: { keywords: ["example"] } },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "BudgetGuard API",
        description:
          "FinOps control plane for AI APIs - Budget enforcement, rate limiting, and usage tracking for OpenAI, Anthropic, and Google AI providers",
        version: "0.1.0",
        contact: {
          name: "BudgetGuard Support",
          url: "https://github.com/budgetguard-ai/budgetguard-core",
        },
        license: {
          name: "Apache 2.0",
          url: "https://github.com/budgetguard-ai/budgetguard-core/blob/main/LICENSE",
        },
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development server",
        },
        {
          url: "https://your-budgetguard.com",
          description: "Production server",
        },
      ],
      tags: [
        {
          name: "AI Proxy",
          description:
            "AI API proxy endpoints with budget and rate limit enforcement",
        },
        {
          name: "Health & Monitoring",
          description: "Health checks and system monitoring endpoints",
        },
        {
          name: "Tenant Management",
          description: "Administrative endpoints for managing tenants",
        },
        {
          name: "Budget Management",
          description: "Budget configuration and monitoring",
        },
        {
          name: "API Key Management",
          description: "Tenant API key generation and management",
        },
        {
          name: "Rate Limiting",
          description: "Rate limit configuration and monitoring",
        },
        {
          name: "Usage Analytics",
          description: "Usage tracking, ledger, and analytics",
        },
        {
          name: "Model Pricing",
          description: "AI model pricing configuration",
        },
        {
          name: "Provider Management",
          description: "AI provider health and configuration",
        },
      ],
      components: {
        securitySchemes: {
          AdminApiKey: {
            type: "apiKey",
            in: "header",
            name: "X-Admin-Key",
            description: "Admin API key for administrative operations",
          },
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "Tenant-specific API key",
          },
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "AI provider API key (OpenAI, Anthropic, Google)",
          },
          OpenAIKey: {
            type: "apiKey",
            in: "header",
            name: "X-OpenAI-Key",
            description: "OpenAI API key for GPT models",
          },
          AnthropicKey: {
            type: "apiKey",
            in: "header",
            name: "X-Anthropic-Key",
            description: "Anthropic API key for Claude models",
          },
          GoogleKey: {
            type: "apiKey",
            in: "header",
            name: "X-Google-API-Key",
            description: "Google API key for Gemini models",
          },
        },
        schemas: {
          Error: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  code: { type: "string", example: "BUDGET_EXCEEDED" },
                  message: {
                    type: "string",
                    example: "Monthly budget exceeded",
                  },
                  details: { type: "object" },
                  timestamp: { type: "string", format: "date-time" },
                  requestId: { type: "string" },
                },
              },
            },
          },
          ChatMessage: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant", "system"] },
              content: { type: "string" },
            },
            required: ["role", "content"],
          },
          Tenant: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              rateLimitPerMin: { type: "number" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
          Budget: {
            type: "object",
            properties: {
              period: { type: "string", enum: ["daily", "monthly", "custom"] },
              limitUsd: { type: "number" },
              usedUsd: { type: "number" },
              remainingUsd: { type: "number" },
              startDate: { type: "string", format: "date-time" },
              endDate: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Periodic cleanup of API key cache (every 5 minutes)
  setInterval(() => {
    cleanupApiKeyCache();
  }, FIVE_MINUTES_IN_MS);

  // Register static file serving for dashboard
  const { fileURLToPath } = await import("url");
  const path = await import("path");
  const fs = await import("fs");
  const fsPromises = fs.promises;

  // Helper function to resolve dashboard dist path
  const resolveDashboardDistPath = async (dirname: string) => {
    const paths = [
      // Development location: src/dashboard/dist
      path.join(dirname, "..", "src", "dashboard", "dist"),
      // Production location: dashboard/dist
      path.join(dirname, "dashboard", "dist"),
    ];

    for (const distPath of paths) {
      try {
        await fsPromises.access(distPath);
        return distPath;
      } catch {
        // Continue to next path
      }
    }

    // Return first path as fallback if none exist
    return paths[0];
  };

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardDistPath = await resolveDashboardDistPath(__dirname);

  // Check if dashboard dist exists
  try {
    await fsPromises.access(dashboardDistPath);
    // Manually handle dashboard assets (JS, CSS, etc.)
    app.get(
      "/dashboard/assets/*",
      {
        schema: {
          tags: ["Dashboard"],
          summary: "Serve dashboard static assets",
          description: "Static assets (JS, CSS, images) for the dashboard",
        },
      },
      async (req, reply) => {
        const assetPath = req.url.replace("/dashboard/", "");
        const fullPath = path.join(dashboardDistPath, assetPath);

        try {
          await fsPromises.access(fullPath);
          const content = await fsPromises.readFile(fullPath);

          // Set appropriate content type
          if (fullPath.endsWith(".js")) {
            reply.type("application/javascript");
          } else if (fullPath.endsWith(".css")) {
            reply.type("text/css");
          } else if (fullPath.endsWith(".png")) {
            reply.type("image/png");
          } else if (fullPath.endsWith(".svg")) {
            reply.type("image/svg+xml");
          }

          return reply.send(content);
        } catch {
          return reply.code(404).send({ error: "Asset not found" });
        }
      },
    );

    // Serve dashboard SPA for main route and all subroutes
    const serveDashboardSPA = async (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const indexPath = path.join(dashboardDistPath, "index.html");
      try {
        const indexContent = await fsPromises.readFile(indexPath, "utf8");
        reply.type("text/html").send(indexContent);
      } catch {
        reply.code(404).send({ error: "Dashboard not built" });
      }
    };

    app.get(
      "/dashboard",
      {
        schema: {
          tags: ["Dashboard"],
          summary: "Dashboard SPA entry point",
          description: "Main dashboard single-page application",
        },
      },
      serveDashboardSPA,
    );
    app.get(
      "/dashboard/*",
      {
        schema: {
          tags: ["Dashboard"],
          summary: "Dashboard SPA routes",
          description: "All dashboard routes (SPA routing)",
        },
      },
      async (req, reply) => {
        // Skip asset requests - they're handled above
        if (req.url.includes("/assets/")) {
          return;
        }

        // Serve SPA for all other dashboard routes
        await serveDashboardSPA(req, reply);
      },
    );
  } catch {
    // Dashboard dist doesn't exist
    // If dashboard not built, show helpful message
    app.get(
      "/dashboard",
      {
        schema: {
          tags: ["Dashboard"],
          summary: "Dashboard not built message",
          description: "Error message when dashboard is not built",
        },
      },
      async (req, reply) => {
        reply.code(404).send({
          error: "Dashboard not built",
          message: "Run 'npm run build:dashboard' to build the dashboard first",
        });
      },
    );
  }

  let prisma: PrismaClient | undefined;
  app.addHook("onClose", async () => {
    await prisma?.$disconnect();
  });
  const getPrisma = async () => {
    if (!prisma) {
      prisma = new PrismaClient();
      await prisma.$connect();
    }
    return prisma;
  };

  let redisClient: ReturnType<typeof createClient> | undefined;
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }

  // Define types for OpenAI response
  type OpenAIChoice = { text?: string; message?: { content?: string } };
  type OpenAIResponse = {
    choices?: OpenAIChoice[];
    model?: string;
    error?: unknown;
  };

  app.addHook("onSend", async (req, _reply, payload) => {
    if (!redisClient) return payload;

    const route = req.routeOptions.url ?? req.url;
    if (route !== "/v1/chat/completions" && route !== "/v1/responses") {
      return payload;
    }

    const statusCode = _reply.statusCode;
    let resp: Record<string, unknown> | string;
    try {
      resp = typeof payload === "string" ? JSON.parse(payload) : payload;
    } catch {
      resp = payload as string | Record<string, unknown>;
    }

    // Only increment usage if status is 200 and no error in response
    if (
      statusCode !== 200 ||
      (resp && (resp as Record<string, unknown>).error)
    ) {
      return payload;
    }

    let usd = 0;
    let promptTok = 0;
    let compTok = 0;
    let model: string | undefined = undefined;

    try {
      const body = req.body as Record<string, unknown> | undefined;
      model =
        (body?.model as string) ||
        (typeof resp === "object" && resp !== null && "model" in resp
          ? (resp as OpenAIResponse).model
          : undefined);

      let completion: string | undefined = undefined;
      let actualUsage:
        | {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          }
        | undefined = undefined;

      if (typeof resp === "object" && resp !== null && "choices" in resp) {
        const choices = (resp as OpenAIResponse).choices ?? [];
        if (choices.length > 0) {
          completion = choices[0]?.text ?? choices[0]?.message?.content;
        }
      }

      // Extract provider-reported usage tokens if available
      if (typeof resp === "object" && resp !== null && "usage" in resp) {
        const usage = (resp as { usage: unknown }).usage;
        if (usage && typeof usage === "object" && usage !== null) {
          const usageObj = usage as Record<string, unknown>;
          actualUsage = {
            promptTokens: Number(usageObj.prompt_tokens) || 0,
            completionTokens: Number(usageObj.completion_tokens) || 0,
            totalTokens: Number(usageObj.total_tokens) || 0,
          };
        }
      }

      if (model && (body?.prompt || body?.messages || body?.input)) {
        const prismaClient = await getPrisma();
        const {
          promptTokens,
          completionTokens,
          usd: cost,
        } = await countTokensAndCost(
          {
            model,
            prompt:
              (body?.prompt as string) ||
              ((body?.messages as Array<{ role: string; content: string }>) ??
                []) ||
              (body?.input as string),
            completion,
            actualUsage, // Pass provider-reported usage if available
          },
          prismaClient,
        );
        usd = cost;
        promptTok = promptTokens;
        compTok = completionTokens;
      }
    } catch {
      // ignore parse errors
    }

    // Get validated tags from request context
    const validatedTags = (req as RequestWithTags).validatedTags || [];
    const eventData: Record<string, string> = {
      ts: Date.now().toString(),
      tenant: (req.headers["x-tenant-id"] as string) || "public",
      route: req.routeOptions.url ?? req.url,
      model: model || "unknown",
      usd: usd.toFixed(6),
      promptTok: promptTok.toString(),
      compTok: compTok.toString(),
    };

    // Add tag information if tags are present
    if (validatedTags.length > 0) {
      eventData.tags = JSON.stringify(
        validatedTags.map((tag: ValidatedTag) => ({
          id: tag.id,
          name: tag.name,
          weight: tag.weight,
        })),
      );
    }

    await redisClient.xAdd("bg_events", "*", eventData);
    const tenant = (req.headers["x-tenant-id"] as string) || "public";
    const prismaClient = await getPrisma();
    for (const period of BUDGET_PERIODS) {
      const { startDate, endDate } = await readBudget({
        tenant,
        period,
        prisma: prismaClient,
        redis: redisClient,
        defaultBudget: DEFAULT_BUDGET,
      });
      const now = new Date();
      if (now < startDate || now > endDate) continue;
      const key = ledgerKey(period, now, { startDate, endDate });
      await redisClient.incrByFloat(`ledger:${tenant}:${key}`, usd);
    }
    return payload;
  });

  // Rate limit cache to avoid expensive DB/Redis calls on every request
  const rateLimitCache = new Map<string, { limit: number; expires: number }>();
  const RATE_LIMIT_CACHE_TTL = ONE_MINUTE_IN_MS;

  // Register rate limiting with in-memory cache optimization
  await app.register(
    rateLimit as unknown as (
      instance: FastifyInstance,
      opts: Record<string, unknown>,
      done: (err?: Error) => void,
    ) => void,
    {
      client: redisClient,
      max: async (req: FastifyRequest) => {
        const tenant = (req.headers["x-tenant-id"] as string) || "public";

        // Check in-memory cache first
        const cached = rateLimitCache.get(tenant);
        const now = Date.now();

        if (cached && cached.expires > now) {
          // Cache hit - return immediately
          return cached.limit === 0 ? Number.MAX_SAFE_INTEGER : cached.limit;
        }

        // Cache miss - fetch from Redis/DB
        const prismaClient = await getPrisma();
        const limit = await readRateLimit({
          tenant,
          prisma: prismaClient,
          redis: redisClient,
          defaultLimit: Number(process.env.MAX_REQS_PER_MIN || 100),
        });

        // Cache the result
        rateLimitCache.set(tenant, {
          limit,
          expires: now + RATE_LIMIT_CACHE_TTL,
        });

        return limit === 0 ? Number.MAX_SAFE_INTEGER : limit;
      },
      timeWindow: "1 minute",
      keyGenerator: (req: FastifyRequest) =>
        (req.headers["x-tenant-id"] as string) || "public",
      allowList: (req: FastifyRequest) => {
        // Allow admin endpoints, dashboard, docs, and health
        const url = req.url;
        return (
          url.startsWith("/admin") ||
          url.startsWith("/dashboard") ||
          url.startsWith("/docs") ||
          url === "/health"
        );
      },
      errorResponseBuilder: () => ({ error: "Rate limit exceeded" }),
    },
  );

  app.setErrorHandler((err, _req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).error === "Rate limit exceeded") {
      reply.code(429).send({ error: "Rate limit exceeded" });
      return;
    }
    reply.send(err);
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health & Monitoring"],
        summary: "Health check endpoint",
        description:
          "Returns the health status of BudgetGuard and its dependencies",
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              dependencies: {
                type: "object",
                properties: {
                  database: { type: "boolean" },
                  redis: { type: "boolean" },
                  providers: {
                    type: "object",
                    properties: {
                      configured: { type: "number" },
                      healthy: { type: "number" },
                    },
                  },
                },
              },
            },
            required: ["ok"],
          },
        },
      },
    },
    async () => {
      const health = {
        ok: true,
        dependencies: {
          database: false,
          redis: false,
          providers: {
            configured: 0,
            healthy: 0,
          },
        },
      };

      try {
        // Check database connectivity
        const prisma = await getPrisma();
        await prisma.$queryRaw`SELECT 1`;
        health.dependencies.database = true;
      } catch {
        health.ok = false;
      }

      try {
        // Check Redis connectivity (if configured)
        if (process.env.REDIS_URL) {
          const redis = createClient({ url: process.env.REDIS_URL });
          await redis.connect();
          await redis.ping();
          await redis.disconnect();
          health.dependencies.redis = true;
        } else {
          health.dependencies.redis = true; // Not required if not configured
        }
      } catch {
        health.ok = false;
      }

      try {
        // Check provider status (quick check)
        const config = {
          openaiApiKey: process.env.OPENAI_KEY,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          googleApiKey: process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const providers = providerSelector.getAllConfiguredProviders();

        health.dependencies.providers.configured =
          Object.keys(providers).length;

        // Quick concurrent health checks (with timeout)
        const healthChecks = await Promise.allSettled(
          Object.values(providers).map(async (provider) => {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Health check timeout")), 3000),
            );
            return Promise.race([provider.healthCheck(), timeoutPromise]);
          }),
        );

        health.dependencies.providers.healthy = healthChecks.filter(
          (result) =>
            result.status === "fulfilled" &&
            typeof result.value === "object" &&
            result.value !== null &&
            "healthy" in result.value &&
            (result.value as { healthy: boolean }).healthy,
        ).length;
      } catch {
        // Provider checks are not critical for overall health
      }

      return health;
    },
  );

  // proxy OpenAI chat completions endpoint
  app.post(
    "/v1/chat/completions",
    {
      schema: {
        tags: ["AI Proxy"],
        summary: "Chat completions with budget enforcement",
        description:
          "Proxy chat completion requests to AI providers (OpenAI, Anthropic, Google) with budget and rate limit enforcement",
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            messages: { type: "array" },
          },
          required: ["model", "messages"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
        parameters: [
          {
            in: "header",
            name: "X-Tenant-Id",
            schema: { type: "string" },
            required: false,
            description: "Tenant identifier for budget/rate limiting",
          },
          {
            in: "header",
            name: "Authorization",
            schema: { type: "string" },
            required: false,
            description: "Bearer <API_KEY>",
          },
          {
            in: "header",
            name: "X-OpenAI-Key",
            schema: { type: "string" },
            required: false,
            description: "OpenAI API key for OpenAI models",
          },
          {
            in: "header",
            name: "X-Anthropic-Key",
            schema: { type: "string" },
            required: false,
            description: "Anthropic API key for Claude models",
          },
          {
            in: "header",
            name: "X-API-Key",
            schema: { type: "string" },
            required: false,
            description: "Tenant API key",
          },
          {
            in: "header",
            name: "X-Budget-Tags",
            schema: { type: "string" },
            required: false,
            description:
              "Comma-separated list of tags for budget allocation (e.g., 'engineering,production')",
          },
        ],
        security: [{}, { ApiKeyAuth: [] }, { BearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const startDecision = process.hrtime.bigint();
      const prisma = await getPrisma();

      // Extract API key from headers
      let supplied: string | undefined;
      const auth = req.headers.authorization as string | undefined;
      if (auth && auth.startsWith("Bearer ")) supplied = auth.slice(7);
      if (!supplied && req.headers["x-api-key"]) {
        supplied = req.headers["x-api-key"] as string;
      }

      // Require authentication for all AI proxy requests
      if (!supplied) {
        return reply.code(401).send({
          error:
            "Authentication required. Provide API key via Authorization header or X-API-Key header",
        });
      }

      // Authenticate and get tenant context
      const keyAuth = await authenticateApiKey(supplied, prisma);
      if (!keyAuth) {
        return reply.code(401).send({ error: "Invalid API key" });
      }

      const tenantRec = await prisma.tenant.findUnique({
        where: { id: keyAuth.tenantId },
      });
      if (!tenantRec) {
        return reply.code(401).send({ error: "Tenant not found" });
      }

      const tenant = tenantRec.name;
      const tenantId = tenantRec.id;
      (req.headers as Record<string, string>)["x-tenant-id"] = tenant;

      // Audit log
      await prisma.auditLog
        .create({
          data: {
            tenantId: keyAuth.tenantId,
            actor: `apiKey:${keyAuth.id}`,
            event: "api_key_used",
            details: req.routeOptions.url ?? req.url,
          },
        })
        .catch(() => {});
      // Extract and validate tags from X-Budget-Tags header
      let validatedTags: Array<{ id: number; name: string; weight: number }> =
        [];
      try {
        validatedTags = await extractAndValidateTags(
          req.headers,
          tenantId,
          prisma,
          redisClient,
        );
        // Store tags in request context for later use in onSend hook
        (req as RequestWithTags).validatedTags = validatedTags;
      } catch (error) {
        return reply.code(400).send({
          error:
            error instanceof Error ? error.message : "Tag validation failed",
        });
      }

      // Use ULTRA-optimized batching for ALL Redis calls (budgets + tenant + rate limit + usage)
      const { budgets } = await readBudgetsOptimized(
        tenant,
        BUDGET_PERIODS,
        prisma,
        redisClient,
        DEFAULT_BUDGET,
        ledgerKey,
      );
      const input = {
        tenant,
        route: req.routeOptions.url ?? req.url,
        time: new Date().getHours(),
        budgets,
      };
      const allow = await evaluatePolicy(input);
      app.log.info({ input, allow }, "policy decision");
      if (!allow) {
        const decisionMs =
          Number(process.hrtime.bigint() - startDecision) / 1e6;
        for (const b of budgets) {
          app.log.warn({ period: b.period, usage: b.usage, budget: b.budget });
        }
        app.log.warn({ decisionMs }, "policy denied");
        return reply.code(403).send({ error: "Request denied by policy" });
      }
      for (const b of budgets) {
        if (b.usage >= b.budget) {
          const decisionMs =
            Number(process.hrtime.bigint() - startDecision) / 1e6;
          app.log.warn({
            period: b.period,
            usage: b.usage,
            budget: b.budget,
            decisionMs,
          });
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }

      // Check tag budgets if tags are present
      if (validatedTags.length > 0) {
        try {
          const tagBudgetChecks = await checkTagBudgets({
            validatedTags,
            tenant,
            tenantId: tenantId,
            prisma,
            redis: redisClient,
            ledgerKey,
          });

          // Check for any exceeded tag budgets
          const exceededTagBudgets = tagBudgetChecks.filter(
            (check) => check.exceeded,
          );
          if (exceededTagBudgets.length > 0) {
            const decisionMs =
              Number(process.hrtime.bigint() - startDecision) / 1e6;
            app.log.warn({
              exceededTagBudgets: exceededTagBudgets.map((check) => ({
                tagName: check.tagName,
                period: check.period,
                usage: check.usage,
                budget: check.amount,
              })),
              decisionMs,
            });
            return reply.code(402).send({
              error: `Tag budget exceeded: ${exceededTagBudgets
                .map((check) => check.tagName)
                .join(", ")}`,
            });
          }

          // Also check hierarchical budgets
          const hierarchicalChecks = await checkHierarchicalTagBudgets({
            validatedTags,
            tenant,
            tenantId: tenantId,
            prisma,
            redis: redisClient,
            ledgerKey,
          });

          const exceededHierarchicalBudgets = hierarchicalChecks.filter(
            (check) => check.exceeded,
          );
          if (exceededHierarchicalBudgets.length > 0) {
            const decisionMs =
              Number(process.hrtime.bigint() - startDecision) / 1e6;
            app.log.warn({
              exceededHierarchicalBudgets: exceededHierarchicalBudgets.map(
                (check) => ({
                  tagName: check.tagName,
                  period: check.period,
                  usage: check.usage,
                  budget: check.amount,
                }),
              ),
              decisionMs,
            });
            return reply.code(402).send({
              error: `Parent tag budget exceeded: ${exceededHierarchicalBudgets
                .map((check) => check.tagName)
                .join(", ")}`,
            });
          }
        } catch (error) {
          console.error("Error checking tag budgets:", error);
          // Continue with request if tag budget check fails (fail open)
        }
      }

      const decisionMs = Number(process.hrtime.bigint() - startDecision) / 1e6;
      app.log.info({ decisionMs }, "allow request");

      const body = req.body as CompletionRequest;
      const model = body.model;

      const provider = await getProviderForModel(model, await getPrisma(), {
        openaiApiKey:
          (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
        anthropicApiKey:
          (req.headers["x-anthropic-key"] as string) ||
          process.env.ANTHROPIC_API_KEY,
        googleApiKey:
          (req.headers["x-google-api-key"] as string) ||
          process.env.GOOGLE_API_KEY,
      });

      if (!provider) {
        return reply
          .code(400)
          .send({ error: `No provider configured for model: ${model}` });
      }

      const result = await provider.chatCompletion(body);
      return reply.code(result.status).send(result.data);
    },
  );

  // proxy OpenAI responses endpoint
  app.post(
    "/v1/responses",
    {
      schema: {
        tags: ["AI Proxy"],
        summary: "Legacy responses endpoint",
        description:
          "Legacy endpoint for simple text responses with budget enforcement",
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
          },
          required: ["model"],
          additionalProperties: true,
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
        parameters: [
          {
            in: "header",
            name: "X-Tenant-Id",
            schema: { type: "string" },
            required: false,
            description: "Tenant identifier for budget/rate limiting",
          },
          {
            in: "header",
            name: "Authorization",
            schema: { type: "string" },
            required: false,
            description: "Bearer <API_KEY>",
          },
          {
            in: "header",
            name: "X-OpenAI-Key",
            schema: { type: "string" },
            required: false,
            description: "OpenAI API key for OpenAI models",
          },
          {
            in: "header",
            name: "X-Anthropic-Key",
            schema: { type: "string" },
            required: false,
            description: "Anthropic API key for Claude models",
          },
          {
            in: "header",
            name: "X-API-Key",
            schema: { type: "string" },
            required: false,
            description: "Tenant API key",
          },
          {
            in: "header",
            name: "X-Budget-Tags",
            schema: { type: "string" },
            required: false,
            description:
              "Comma-separated list of tags for budget allocation (e.g., 'engineering,production')",
          },
        ],
        security: [{}, { ApiKeyAuth: [] }],
      },
    },
    async (req, reply) => {
      const startDecision = process.hrtime.bigint();
      const prisma = await getPrisma();

      // Extract API key from headers
      let supplied: string | undefined;
      const auth = req.headers.authorization as string | undefined;
      if (auth && auth.startsWith("Bearer ")) supplied = auth.slice(7);
      if (!supplied && req.headers["x-api-key"]) {
        supplied = req.headers["x-api-key"] as string;
      }

      // Require authentication for all AI proxy requests
      if (!supplied) {
        return reply.code(401).send({
          error:
            "Authentication required. Provide API key via Authorization header or X-API-Key header",
        });
      }

      // Authenticate and get tenant context
      const keyAuth = await authenticateApiKey(supplied, prisma);
      if (!keyAuth) {
        return reply.code(401).send({ error: "Invalid API key" });
      }

      const tenantRec = await prisma.tenant.findUnique({
        where: { id: keyAuth.tenantId },
      });
      if (!tenantRec) {
        return reply.code(401).send({ error: "Tenant not found" });
      }

      const tenant = tenantRec.name;
      const tenantId = tenantRec.id;
      (req.headers as Record<string, string>)["x-tenant-id"] = tenant;

      // Audit log
      await prisma.auditLog
        .create({
          data: {
            tenantId: keyAuth.tenantId,
            actor: `apiKey:${keyAuth.id}`,
            event: "api_key_used",
            details: req.routeOptions.url ?? req.url,
          },
        })
        .catch(() => {});
      // Extract and validate tags from X-Budget-Tags header
      let validatedTags: Array<{ id: number; name: string; weight: number }> =
        [];
      try {
        validatedTags = await extractAndValidateTags(
          req.headers,
          tenantId,
          prisma,
          redisClient,
        );
        // Store tags in request context for later use in onSend hook
        (req as RequestWithTags).validatedTags = validatedTags;
      } catch (error) {
        return reply.code(400).send({
          error:
            error instanceof Error ? error.message : "Tag validation failed",
        });
      }

      // Use ULTRA-optimized batching for ALL Redis calls (budgets + tenant + rate limit + usage)
      const { budgets } = await readBudgetsOptimized(
        tenant,
        BUDGET_PERIODS,
        prisma,
        redisClient,
        DEFAULT_BUDGET,
        ledgerKey,
      );
      const input = {
        tenant,
        route: req.routeOptions.url ?? req.url,
        time: new Date().getHours(),
        budgets,
      };
      const allow = await evaluatePolicy(input);
      app.log.info({ input, allow }, "policy decision");
      if (!allow) {
        const decisionMs =
          Number(process.hrtime.bigint() - startDecision) / 1e6;
        for (const b of budgets) {
          app.log.warn({ period: b.period, usage: b.usage, budget: b.budget });
        }
        app.log.warn({ decisionMs }, "policy denied");
        return reply.code(403).send({ error: "Request denied by policy" });
      }
      for (const b of budgets) {
        if (b.usage >= b.budget) {
          const decisionMs =
            Number(process.hrtime.bigint() - startDecision) / 1e6;
          app.log.warn({
            period: b.period,
            usage: b.usage,
            budget: b.budget,
            decisionMs,
          });
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }

      // Check tag budgets if tags are present
      if (validatedTags.length > 0) {
        try {
          const tagBudgetChecks = await checkTagBudgets({
            validatedTags,
            tenant,
            tenantId: tenantId,
            prisma,
            redis: redisClient,
            ledgerKey,
          });

          // Check for any exceeded tag budgets
          const exceededTagBudgets = tagBudgetChecks.filter(
            (check) => check.exceeded,
          );
          if (exceededTagBudgets.length > 0) {
            const decisionMs =
              Number(process.hrtime.bigint() - startDecision) / 1e6;
            app.log.warn({
              exceededTagBudgets: exceededTagBudgets.map((check) => ({
                tagName: check.tagName,
                period: check.period,
                usage: check.usage,
                budget: check.amount,
              })),
              decisionMs,
            });
            return reply.code(402).send({
              error: `Tag budget exceeded: ${exceededTagBudgets
                .map((check) => check.tagName)
                .join(", ")}`,
            });
          }

          // Also check hierarchical budgets
          const hierarchicalChecks = await checkHierarchicalTagBudgets({
            validatedTags,
            tenant,
            tenantId: tenantId,
            prisma,
            redis: redisClient,
            ledgerKey,
          });

          const exceededHierarchicalBudgets = hierarchicalChecks.filter(
            (check) => check.exceeded,
          );
          if (exceededHierarchicalBudgets.length > 0) {
            const decisionMs =
              Number(process.hrtime.bigint() - startDecision) / 1e6;
            app.log.warn({
              exceededHierarchicalBudgets: exceededHierarchicalBudgets.map(
                (check) => ({
                  tagName: check.tagName,
                  period: check.period,
                  usage: check.usage,
                  budget: check.amount,
                }),
              ),
              decisionMs,
            });
            return reply.code(402).send({
              error: `Parent tag budget exceeded: ${exceededHierarchicalBudgets
                .map((check) => check.tagName)
                .join(", ")}`,
            });
          }
        } catch (error) {
          console.error("Error checking tag budgets:", error);
          // Continue with request if tag budget check fails (fail open)
        }
      }

      const decisionMs = Number(process.hrtime.bigint() - startDecision) / 1e6;
      app.log.info({ decisionMs }, "allow request");

      const body = req.body as CompletionRequest;
      const model = body.model;

      const provider = await getProviderForModel(model, await getPrisma(), {
        openaiApiKey:
          (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
        anthropicApiKey:
          (req.headers["x-anthropic-key"] as string) ||
          process.env.ANTHROPIC_API_KEY,
        googleApiKey:
          (req.headers["x-google-api-key"] as string) ||
          process.env.GOOGLE_API_KEY,
      });

      if (!provider) {
        return reply
          .code(400)
          .send({ error: `No provider configured for model: ${model}` });
      }

      const result = await provider.responses(body);
      return reply.code(result.status).send(result.data);
    },
  );

  const adminAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const key = req.headers["x-admin-key"] as string | undefined;
    if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };

  // TODO: Shared authentication middleware for AI proxy endpoints
  // Currently unused - would require refactoring existing endpoints to use it
  // const aiProxyAuth = async (req: FastifyRequest, reply: FastifyReply) => { ... }

  app.post(
    "/admin/tenant",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tenant Management"],
        summary: "Create a new tenant",
        description:
          "Create a new tenant with optional budget and rate limit configuration",
        body: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { name } = req.body as { name?: string };
      if (!name) {
        return reply.code(400).send({ error: "Missing name" });
      }
      try {
        const tenant = await prisma.tenant.create({
          data: {
            name,
            rateLimitPerMin: Number(process.env.MAX_REQS_PER_MIN || 100),
          },
        });
        return reply.send(tenant);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return reply.code(400).send({ error: "Tenant already exists" });
        }
        return reply.code(400).send({ error: "Unable to create tenant" });
      }
    },
  );

  app.get(
    "/admin/tenant",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tenant Management"],
        summary: "List all tenants",
        description: "Retrieve a list of all tenants in the system",
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                name: { type: "string" },
                createdAt: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                rateLimitPerMin: { type: "number", nullable: true }, // <-- Add this
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const prisma = await getPrisma();
      const tenants = await prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          rateLimitPerMin: true, // <-- Add this
        },
      });
      return reply.send(tenants);
    },
  );

  app.get(
    "/admin/tenant/:tenantId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tenant Management"],
        summary: "Get tenant by ID",
        description: "Retrieve detailed information about a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }
      return reply.send(tenant);
    },
  );

  app.put(
    "/admin/tenant/:tenantId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tenant Management"],
        summary: "Update tenant",
        description: "Update tenant information such as name or rate limits",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            rateLimitPerMin: { type: "number", nullable: true },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
              rateLimitPerMin: { type: "number", nullable: true },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const { name, rateLimitPerMin } = req.body as {
        name?: string;
        rateLimitPerMin?: number | null;
      };

      // Check if tenant exists
      const existingTenant = await prisma.tenant.findUnique({ where: { id } });
      if (!existingTenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      // Validate name if provided
      if (name !== undefined && (!name || name.trim().length === 0)) {
        return reply.code(400).send({ error: "Name cannot be empty" });
      }

      try {
        const updateData: { name?: string; rateLimitPerMin?: number | null } =
          {};
        if (name !== undefined) updateData.name = name.trim();
        if (rateLimitPerMin !== undefined)
          updateData.rateLimitPerMin = rateLimitPerMin;

        const updatedTenant = await prisma.tenant.update({
          where: { id },
          data: updateData,
        });

        // Update rate limit cache if rate limit was changed
        if (rateLimitPerMin !== undefined) {
          await writeRateLimit(
            updatedTenant.name,
            updatedTenant.rateLimitPerMin ??
              Number(process.env.MAX_REQS_PER_MIN || 100),
            redisClient,
          );
        }

        return reply.send(updatedTenant);
      } catch (error) {
        app.log.error(error, "Error updating tenant");
        return reply.code(400).send({ error: "Unable to update tenant" });
      }
    },
  );

  app.delete(
    "/admin/tenant/:tenantId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tenant Management"],
        summary: "Delete tenant",
        description: "Delete a tenant and all associated data",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" } },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);

      // Check if tenant exists
      const existingTenant = await prisma.tenant.findUnique({ where: { id } });
      if (!existingTenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      try {
        // Use transaction to ensure all related data is deleted consistently
        await prisma.$transaction(async (tx) => {
          // Delete related records in correct order to handle foreign key constraints
          await tx.auditLog.deleteMany({ where: { tenantId: id } });
          await tx.usageLedger.deleteMany({ where: { tenantId: id } });
          await tx.apiKey.deleteMany({ where: { tenantId: id } });
          await tx.budget.deleteMany({ where: { tenantId: id } });

          // Finally delete the tenant
          await tx.tenant.delete({ where: { id } });
        });

        // Clean up Redis cache
        if (redisClient) {
          try {
            // Delete rate limit cache
            await redisClient.del(`ratelimit:${existingTenant.name}`);

            // Delete budget cache for all periods
            for (const period of BUDGET_PERIODS) {
              await redisClient.del(`budget:${existingTenant.name}:${period}`);
            }

            // Delete usage ledger cache (pattern match and delete)
            const ledgerKeys = await redisClient.keys(
              `ledger:${existingTenant.name}:*`,
            );
            if (ledgerKeys.length > 0) {
              await (redisClient.del as (...keys: string[]) => Promise<number>)(
                ...ledgerKeys,
              );
            }
          } catch (redisError) {
            app.log.warn(
              redisError,
              "Error cleaning up Redis cache for deleted tenant",
            );
            // Don't fail the request if Redis cleanup fails
          }
        }

        return reply.send({ ok: true });
      } catch (error) {
        app.log.error(error, "Error deleting tenant");
        return reply.code(400).send({ error: "Unable to delete tenant" });
      }
    },
  );

  app.get(
    "/admin/tenant/:tenantId/ratelimit",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Rate Limiting"],
        summary: "Get tenant rate limit",
        description:
          "Retrieve the current rate limit configuration for a tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "object",
            properties: { rateLimitPerMin: { type: "number", nullable: true } },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      return reply.send({ rateLimitPerMin: tenant.rateLimitPerMin ?? null });
    },
  );

  app.put(
    "/admin/tenant/:tenantId/ratelimit",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Rate Limiting"],
        summary: "Set tenant rate limit",
        description:
          "Configure the rate limit for a specific tenant (requests per minute)",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        body: {
          type: "object",
          properties: {
            rateLimitPerMin: {
              type: ["number", "null"],
              minimum: 0,
            },
          },
          required: ["rateLimitPerMin"],
        },
        response: {
          200: {
            type: "object",
            properties: { rateLimitPerMin: { type: "number", nullable: true } },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const { rateLimitPerMin } = req.body as {
        rateLimitPerMin: number | null;
      };

      // Validate rate limit value
      if (rateLimitPerMin !== null && rateLimitPerMin < 0) {
        return reply.code(400).send({ error: "Rate limit cannot be negative" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      const updated = await prisma.tenant.update({
        where: { id },
        data: { rateLimitPerMin: rateLimitPerMin },
      });

      // Clear cache first, then set new value
      if (redisClient) {
        const key = `ratelimit:${tenant.name}`;
        await redisClient.del(key);
      }

      await writeRateLimit(
        tenant.name,
        updated.rateLimitPerMin ?? Number(process.env.MAX_REQS_PER_MIN || 100),
        redisClient,
      );

      return reply.send({ rateLimitPerMin: updated.rateLimitPerMin ?? null });
    },
  );

  app.post(
    "/admin/tenant/:tenantId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Budget Management"],
        summary: "Set tenant budget",
        description: "Configure budget limits for a specific tenant and period",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        body: {
          type: "object",
          properties: {
            budgets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string" },
                  amountUsd: { type: "number" },
                  startDate: { type: "string" },
                  endDate: { type: "string" },
                },
                required: ["period", "amountUsd"],
              },
            },
          },
          required: ["budgets"],
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenantRec = await prisma.tenant.findUnique({ where: { id } });
      if (!tenantRec) {
        return reply.code(404).send({ error: "Tenant not found" });
      }
      const { budgets } = req.body as {
        budgets?: Array<{
          period: string;
          amountUsd: number;
          startDate?: string;
          endDate?: string;
        }>;
      };
      if (!budgets || !Array.isArray(budgets)) {
        return reply.code(400).send({ error: "Missing budgets" });
      }
      const results = [] as unknown[];
      for (const b of budgets) {
        if (!b.period || b.amountUsd === undefined) continue;
        if (!ALLOWED_PERIODS.includes(b.period as Period)) {
          return reply
            .code(400)
            .send({ error: "Invalid period. Allowed: daily, monthly, custom" });
        }
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        // For daily and monthly budgets, store null dates (they are recurring)
        // For custom budgets, store the specific dates
        if (b.period === "monthly" || b.period === "daily") {
          // Recurring budgets - no specific dates stored in DB
          startDate = undefined;
          endDate = undefined;
        } else if (b.period === "custom") {
          if (
            !b.startDate ||
            !b.endDate ||
            isNaN(new Date(b.startDate).getTime()) ||
            isNaN(new Date(b.endDate).getTime())
          ) {
            return reply.code(400).send({
              error: "Custom period requires valid startDate and endDate",
            });
          }
          // Set start to 00:00:00.000 and end to 23:59:59.999 for the end date
          startDate = new Date(b.startDate);
          endDate = new Date(b.endDate);
          endDate.setUTCHours(23, 59, 59, 999);
        }
        if (endDate && startDate && endDate < startDate) {
          return reply
            .code(400)
            .send({ error: "endDate must be equal to or after startDate" });
        }
        const existing = await prisma.budget.findFirst({
          where: { tenantId: id, period: b.period },
        });
        const data = {
          tenantId: id,
          period: b.period,
          amountUsd: b.amountUsd,
          startDate,
          endDate,
        };
        if (existing) {
          const updated = await prisma.budget.update({
            where: { id: existing.id },
            data,
          });
          results.push(updated);
          await writeBudgetCache(
            updated,
            tenantRec.name,
            prisma,
            redisClient,
            startDate,
            endDate,
          );
        } else {
          const created = await prisma.budget.create({ data });
          results.push(created);
          await writeBudgetCache(
            created,
            tenantRec.name,
            prisma,
            redisClient,
            startDate,
            endDate,
          );
        }
      }
      return reply.send(results);
    },
  );

  app.get(
    "/admin/tenant/:tenantId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Budget Management"],
        summary: "Get tenant budgets",
        description: "Retrieve all budget configurations for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      const budgets = await prisma.budget.findMany({ where: { tenantId: id } });

      // Enhance budgets with current period information
      const enhancedBudgets = await Promise.all(
        budgets.map(async (budget) => {
          try {
            // Get current period dates for this budget
            const { startDate, endDate } = await readBudget({
              tenant: tenant.name,
              period: budget.period,
              prisma,
              redis: redisClient,
              defaultBudget: DEFAULT_BUDGET,
            });

            // Get current usage for this period
            let currentUsage = 0;
            if (redisClient) {
              if (!isValidPeriod(budget.period)) {
                app.log.error(`Invalid period: ${budget.period}`);
                throw new Error(`Invalid period: ${budget.period}`);
              }
              const key = ledgerKey(budget.period, new Date(), {
                startDate,
                endDate,
              });
              const val = await redisClient.get(`ledger:${tenant.name}:${key}`);
              currentUsage = val ? parseFloat(val) : 0;
            }

            return {
              ...budget,
              currentPeriodStartDate: startDate.toISOString(),
              currentPeriodEndDate: endDate.toISOString(),
              currentUsage,
              isRecurring:
                budget.period === "daily" || budget.period === "monthly",
            };
          } catch (error) {
            // Log error for debugging but provide fallback for graceful degradation
            app.log.error(
              error,
              `Error enhancing budget ${budget.id} with current period information`,
            );
            return {
              ...budget,
              currentUsage: 0,
              isRecurring:
                budget.period === "daily" || budget.period === "monthly",
            };
          }
        }),
      );

      return reply.send(enhancedBudgets);
    },
  );

  app.post(
    "/admin/tenant/:tenantId/apikeys",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["API Key Management"],
        summary: "Generate tenant API key",
        description: "Generate a new API key for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              key: { type: "string" },
              createdAt: { type: "string" },
              isActive: { type: "boolean" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      const key = randomBytes(32).toString("hex");
      const keyHash = await bcrypt.hash(key, 12);
      const keyPrefix = key.substring(0, 8);
      const rec = await prisma.apiKey.create({
        data: { keyHash, keyPrefix, tenantId: id, isActive: true },
      });
      return reply.send({
        id: rec.id,
        key: key, // Return the plaintext key only once
        keyPrefix: rec.keyPrefix,
        createdAt: rec.createdAt,
        isActive: rec.isActive,
      });
    },
  );

  app.get(
    "/admin/tenant/:tenantId/apikeys",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["API Key Management"],
        summary: "List tenant API keys",
        description: "Retrieve all API keys for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                createdAt: { type: "string" },
                isActive: { type: "boolean" },
                lastUsedAt: { type: "string", nullable: true },
              },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const list = await prisma.apiKey.findMany({ where: { tenantId: id } });
      return reply.send(
        list.map((k) => ({
          id: k.id,
          createdAt: k.createdAt,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt ?? undefined,
        })),
      );
    },
  );

  app.delete(
    "/admin/apikey/:id",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["API Key Management"],
        summary: "Delete API key",
        description: "Delete a specific API key by ID",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { id } = req.params as { id: string };
      const keyId = Number(id);

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      // Mark the key as inactive in the cache to prevent immediate reuse
      deactivateApiKeyInCache(keyId);

      return reply.send({ ok: true });
    },
  );

  app.get(
    "/admin/tenant/:tenantId/usage",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Usage Analytics"],
        summary: "Get tenant usage summary",
        description:
          "Retrieve usage summary and statistics for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: { type: "object", additionalProperties: { type: "number" } },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      const usage: Record<string, number> = {};
      if (!redisClient) {
        return reply.send(usage);
      }
      for (const p of BUDGET_PERIODS) {
        const { startDate, endDate } = await readBudget({
          tenant: tenant.name,
          period: p,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        const key = ledgerKey(p, new Date(), { startDate, endDate });
        const val = await redisClient.get(`ledger:${tenant.name}:${key}`);
        usage[p] = val ? parseFloat(val) : 0;
      }
      return reply.send(usage);
    },
  );

  // Historical usage endpoint
  app.get(
    "/admin/tenant/:tenantId/usage/history",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Usage Analytics"],
        summary: "Get tenant usage history",
        description:
          "Retrieve historical usage data for a specific tenant with optional date filtering",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        querystring: {
          type: "object",
          properties: {
            days: { type: "string", default: "30" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                usage: { type: "number" },
              },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const {
        days = "30",
        startDate: startDateParam,
        endDate: endDateParam,
      } = req.query as {
        days?: string;
        startDate?: string;
        endDate?: string;
      };

      const id = Number(tenantId);

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      // Calculate date range - use provided dates if available, otherwise use days
      let startDate: Date;
      let endDate: Date;

      if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return reply.code(400).send({ error: "Invalid date format" });
        }
        if (startDate >= endDate) {
          return reply
            .code(400)
            .send({ error: "startDate must be before endDate" });
        }
      } else {
        // Fallback to days calculation
        const daysCount = parseInt(days, 10);
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - daysCount);
      }

      // Query historical usage from UsageLedger
      const historicalUsage = await prisma.usageLedger.findMany({
        where: {
          tenantId: id,
          ts: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { ts: "asc" },
      });

      // Group by date and sum usage
      const dailyUsage = new Map<string, number>();

      // Calculate the number of days in the range
      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;

      // Initialize all dates with 0
      for (let i = 0; i < daysDiff; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split("T")[0];
        dailyUsage.set(dateKey, 0);
      }

      // Sum actual usage by date
      historicalUsage.forEach((entry) => {
        const dateKey = entry.ts.toISOString().split("T")[0];
        const currentUsage = dailyUsage.get(dateKey) || 0;
        dailyUsage.set(dateKey, currentUsage + entry.usd.toNumber());
      });

      // Convert to array format
      const result = Array.from(dailyUsage.entries()).map(([date, usage]) => ({
        date,
        usage: parseFloat(usage.toFixed(4)),
      }));

      return reply.send(result);
    },
  );

  // Model breakdown endpoint
  app.get(
    "/admin/tenant/:tenantId/usage/models",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Usage Analytics"],
        summary: "Get tenant model usage breakdown",
        description: "Detailed usage statistics by model for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        querystring: {
          type: "object",
          properties: {
            days: { type: "string", default: "30" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                model: { type: "string" },
                usage: { type: "number" },
                percentage: { type: "number" },
              },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const {
        days = "30",
        startDate: startDateParam,
        endDate: endDateParam,
      } = req.query as {
        days?: string;
        startDate?: string;
        endDate?: string;
      };

      const id = Number(tenantId);

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      // Calculate date range - use provided dates if available, otherwise use days
      let startDate: Date;
      let endDate: Date;

      if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return reply.code(400).send({ error: "Invalid date format" });
        }
        if (startDate >= endDate) {
          return reply
            .code(400)
            .send({ error: "startDate must be before endDate" });
        }
      } else {
        // Fallback to days calculation
        const daysCount = parseInt(days, 10);
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - daysCount);
      }

      // Query usage by model from UsageLedger
      const modelUsage = await prisma.usageLedger.groupBy({
        by: ["model"],
        where: {
          tenantId: id,
          ts: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          usd: true,
        },
      });

      // Calculate total usage for percentage calculation
      const totalUsage = modelUsage.reduce(
        (sum, item) => sum + (item._sum.usd?.toNumber() ?? 0),
        0,
      );

      const result = modelUsage
        .map((item) => {
          const usage = item._sum.usd?.toNumber() ?? 0;
          return {
            model: item.model,
            usage: parseFloat(usage.toFixed(4)),
            percentage:
              totalUsage > 0
                ? parseFloat(((usage / totalUsage) * 100).toFixed(1))
                : 0,
          };
        })
        .filter((item) => item.usage > 0)
        .sort((a, b) => b.usage - a.usage);

      return reply.send(result);
    },
  );

  // Detailed usage ledger endpoint
  app.get(
    "/admin/tenant/:tenantId/usage/ledger",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Usage Analytics"],
        summary: "Get tenant usage ledger",
        description: "Detailed usage ledger entries for a specific tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        querystring: {
          type: "object",
          properties: {
            days: { type: "number", default: 30 },
            page: { type: "number", default: 0 },
            limit: { type: "number", default: 100 },
            model: { type: "string" },
            route: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    ts: { type: "string" },
                    tenant: { type: "string" },
                    route: { type: "string" },
                    model: { type: "string" },
                    usd: { type: "string" },
                    promptTok: { type: "number" },
                    compTok: { type: "number" },
                    tenantId: { type: "number" },
                  },
                },
              },
              total: { type: "number" },
              page: { type: "number" },
              limit: { type: "number" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const {
        days = 30,
        page = 0,
        limit = 100,
        model,
        route,
        startDate,
        endDate,
      } = request.query as {
        days?: number;
        page?: number;
        limit?: number;
        model?: string;
        route?: string;
        startDate?: string;
        endDate?: string;
      };

      const id = parseInt(tenantId);
      if (isNaN(id)) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      // Build date filter
      let dateFilter: Record<string, unknown> = {};
      if (startDate && endDate) {
        dateFilter = {
          ts: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        };
      } else {
        const startDateCalc = new Date();
        startDateCalc.setDate(startDateCalc.getDate() - days);
        dateFilter = {
          ts: {
            gte: startDateCalc,
          },
        };
      }

      // Build filters
      const where: Record<string, unknown> = {
        tenantId: id,
        ...dateFilter,
      };

      if (model) {
        where.model = {
          contains: model,
          mode: "insensitive",
        };
      }

      if (route) {
        where.route = {
          contains: route,
          mode: "insensitive",
        };
      }

      try {
        const prismaClient = await getPrisma();

        // Get total count for pagination
        const total = await prismaClient.usageLedger.count({ where });

        // Get paginated data
        const ledgerEntries = await prismaClient.usageLedger.findMany({
          where,
          orderBy: { ts: "desc" },
          skip: page * limit,
          take: limit,
          include: {
            tenantRef: true,
          },
        });

        const result = {
          data: ledgerEntries.map((entry) => ({
            id: entry.id.toString(),
            ts: entry.ts.toISOString(),
            tenant: entry.tenant,
            route: entry.route,
            model: entry.model,
            usd: entry.usd.toString(),
            promptTok: entry.promptTok,
            compTok: entry.compTok,
            tenantId: entry.tenantId,
          })),
          total,
          page,
          limit,
        };

        return reply.send(result);
      } catch (error) {
        console.error("Error fetching usage ledger:", error);
        return reply
          .status(500)
          .send({ error: "Failed to fetch usage ledger" });
      }
    },
  );

  // General usage ledger endpoint (all tenants)
  app.get(
    "/admin/usage/ledger",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Usage Analytics"],
        summary: "Get usage ledger entries",
        description: "Retrieve usage ledger entries across all tenants",
        querystring: {
          type: "object",
          properties: {
            days: { type: "number", default: 30 },
            page: { type: "number", default: 0 },
            limit: { type: "number", default: 100 },
            model: { type: "string" },
            route: { type: "string" },
            tenant: { type: "string" },
            tenantId: { type: "number" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    ts: { type: "string" },
                    tenant: { type: "string" },
                    route: { type: "string" },
                    model: { type: "string" },
                    usd: { type: "string" },
                    promptTok: { type: "number" },
                    compTok: { type: "number" },
                    tenantId: { type: "number" },
                  },
                },
              },
              total: { type: "number" },
              page: { type: "number" },
              limit: { type: "number" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    async (request, reply) => {
      const {
        days = 30,
        page = 0,
        limit = 100,
        model,
        route,
        tenant,
        tenantId,
        startDate,
        endDate,
      } = request.query as {
        days?: number;
        page?: number;
        limit?: number;
        model?: string;
        route?: string;
        tenant?: string;
        tenantId?: number;
        startDate?: string;
        endDate?: string;
      };

      // Build date filter
      let dateFilter: Record<string, unknown> = {};
      if (startDate && endDate) {
        dateFilter = {
          ts: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        };
      } else {
        const startDateCalc = new Date();
        startDateCalc.setDate(startDateCalc.getDate() - days);
        dateFilter = {
          ts: {
            gte: startDateCalc,
          },
        };
      }

      // Build filters
      const where: Record<string, unknown> = {
        ...dateFilter,
      };

      if (tenantId) {
        where.tenantId = tenantId;
      }

      if (tenant) {
        where.tenant = {
          contains: tenant,
          mode: "insensitive",
        };
      }

      if (model) {
        where.model = {
          contains: model,
          mode: "insensitive",
        };
      }

      if (route) {
        where.route = {
          contains: route,
          mode: "insensitive",
        };
      }

      try {
        const prismaClient = await getPrisma();

        // Get total count for pagination
        const total = await prismaClient.usageLedger.count({ where });

        // Get paginated data
        const ledgerEntries = await prismaClient.usageLedger.findMany({
          where,
          orderBy: { ts: "desc" },
          skip: page * limit,
          take: limit,
          include: {
            tenantRef: true,
          },
        });

        const result = {
          data: ledgerEntries.map((entry) => ({
            id: entry.id.toString(),
            ts: entry.ts.toISOString(),
            tenant: entry.tenant,
            route: entry.route,
            model: entry.model,
            usd: entry.usd.toString(),
            promptTok: entry.promptTok,
            compTok: entry.compTok,
            tenantId: entry.tenantId,
          })),
          total,
          page,
          limit,
        };

        return reply.send(result);
      } catch (error) {
        console.error("Error fetching general usage ledger:", error);
        return reply
          .status(500)
          .send({ error: "Failed to fetch usage ledger" });
      }
    },
  );

  app.put(
    "/admin/budget/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Budget Management"],
        summary: "Update budget",
        description: "Update an existing budget by ID",
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        body: {
          type: "object",
          properties: {
            period: { type: "string" },
            amountUsd: { type: "number" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const id = Number(budgetId);
      const data = req.body as Partial<{
        period: string;
        amountUsd: number;
        startDate: string;
        endDate: string;
      }>;
      try {
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        // For daily and monthly budgets, store null dates (they are recurring)
        // For custom budgets, use the provided dates
        if (data.period === "monthly" || data.period === "daily") {
          // Recurring budgets - no specific dates stored in DB
          startDate = undefined;
          endDate = undefined;
        } else if (data.period === "custom") {
          startDate = data.startDate ? new Date(data.startDate) : undefined;
          endDate = data.endDate ? new Date(data.endDate) : undefined;
          if (!startDate || !endDate) {
            throw new Error("custom period requires dates");
          }
          endDate.setUTCHours(23, 59, 59, 999);
        }
        const updated = await prisma.budget.update({
          where: { id },
          data: {
            period: data.period,
            amountUsd: data.amountUsd,
            startDate,
            endDate,
          },
        });
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: updated.tenantId },
        });
        if (tenantRec) {
          await writeBudgetCache(updated, tenantRec.name, prisma, redisClient);
        }
        return reply.send(updated);
      } catch {
        return reply.code(404).send({ error: "Budget not found" });
      }
    },
  );

  app.delete(
    "/admin/budget/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Budget Management"],
        summary: "Delete budget",
        description: "Delete a budget by ID",
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" } },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const id = Number(budgetId);
      try {
        const deleted = await prisma.budget.delete({ where: { id } });
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: deleted.tenantId },
        });
        if (tenantRec) {
          await deleteBudget(tenantRec.name, deleted.period, redisClient);
        }
        return reply.send({ ok: true });
      } catch {
        return reply.code(404).send({ error: "Budget not found" });
      }
    },
  );

  app.get(
    "/admin/model-pricing",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Model Pricing"],
        summary: "List model pricing",
        description:
          "Retrieve pricing information for all configured AI models",
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            example: [
              {
                id: 1,
                model: "gpt-4.1",
                versionTag: "gpt-4.1-2025-04-14",
                inputPrice: "2.00",
                cachedInputPrice: "0.50",
                outputPrice: "8.00",
                provider: "openai",
                createdAt: "2025-04-14T00:00:00.000Z",
                updatedAt: "2025-04-14T00:00:00.000Z",
              },
            ],
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (_req, reply) => {
      const prisma = await getPrisma();
      const rows = await prisma.modelPricing.findMany();
      return reply.send(rows);
    },
  );

  app.post(
    "/admin/model-pricing",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Model Pricing"],
        summary: "Add model pricing",
        description: "Add pricing configuration for a new AI model",
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            versionTag: { type: "string" },
            inputPrice: { type: "number" },
            cachedInputPrice: { type: "number" },
            outputPrice: { type: "number" },
            provider: { type: "string" },
          },
          required: [
            "model",
            "versionTag",
            "inputPrice",
            "cachedInputPrice",
            "outputPrice",
          ],
          example: {
            model: "gpt-4.1",
            versionTag: "gpt-4.1-2025-04-14",
            inputPrice: 2.0,
            cachedInputPrice: 0.5,
            outputPrice: 8.0,
            provider: "openai",
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const body = req.body as {
        model: string;
        versionTag: string;
        inputPrice: number;
        cachedInputPrice: number;
        outputPrice: number;
        provider?: string;
      };
      try {
        const rec = await prisma.modelPricing.create({
          data: {
            model: body.model,
            versionTag: body.versionTag,
            inputPrice: body.inputPrice,
            cachedInputPrice: body.cachedInputPrice,
            outputPrice: body.outputPrice,
            provider: body.provider || "openai",
          },
        });
        return reply.send(rec);
      } catch {
        return reply
          .code(400)
          .send({ error: "Unable to create model pricing" });
      }
    },
  );

  app.put(
    "/admin/model-pricing/:idOrModel",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Model Pricing"],
        summary: "Update model pricing",
        description: "Update pricing for a specific model",
        params: {
          type: "object",
          properties: { idOrModel: { type: "string" } },
          required: ["idOrModel"],
        },
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            versionTag: { type: "string" },
            inputPrice: { type: "number" },
            cachedInputPrice: { type: "number" },
            outputPrice: { type: "number" },
            provider: { type: "string" },
          },
          example: { outputPrice: 25 },
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { idOrModel } = req.params as { idOrModel: string };
      const data = req.body as Partial<{
        model: string;
        versionTag: string;
        inputPrice: number;
        cachedInputPrice: number;
        outputPrice: number;
        provider: string;
      }>;
      const where = /^[0-9]+$/.test(idOrModel)
        ? { id: Number(idOrModel) }
        : { model: idOrModel };
      try {
        const updated = await prisma.modelPricing.update({ where, data });
        return reply.send(updated);
      } catch {
        return reply.code(404).send({ error: "Model pricing not found" });
      }
    },
  );

  // Provider status endpoints
  app.get(
    "/admin/providers/status",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Provider Management"],
        summary: "Get all providers status",
        description: "Health status of all AI providers",
        response: {
          200: {
            type: "object",
            properties: {
              providers: {
                type: "object",
                properties: {
                  openai: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                  anthropic: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                  google: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      try {
        const config = {
          openaiApiKey:
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
          anthropicApiKey:
            (req.headers["x-anthropic-key"] as string) ||
            process.env.ANTHROPIC_API_KEY,
          googleApiKey:
            (req.headers["x-google-api-key"] as string) ||
            process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const providers = providerSelector.getAllConfiguredProviders();

        const status: {
          providers: Record<
            string,
            {
              configured: boolean;
              healthy: boolean;
              responseTime?: number;
              error?: string;
              lastChecked: number;
            }
          >;
        } = {
          providers: {},
        };

        // Check each provider type
        for (const providerType of [
          "openai",
          "anthropic",
          "google",
        ] as ProviderType[]) {
          const provider = providers[providerType];
          const configured = provider !== undefined;

          if (configured && provider) {
            try {
              const health = await provider.healthCheck();
              status.providers[providerType] = {
                configured: true,
                ...health,
              };
            } catch (error) {
              status.providers[providerType] = {
                configured: true,
                healthy: false,
                error: error instanceof Error ? error.message : "Unknown error",
                lastChecked: Date.now(),
              };
            }
          } else {
            status.providers[providerType] = {
              configured: false,
              healthy: false,
              error: "Provider not configured",
              lastChecked: Date.now(),
            };
          }
        }

        return reply.send(status);
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error
              ? error.message
              : "Failed to check provider status",
        });
      }
    },
  );

  app.get(
    "/admin/providers/:provider/health",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Provider Management"],
        summary: "Get provider health",
        description: "Health check for a specific AI provider",
        params: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["openai", "anthropic", "google"],
            },
          },
          required: ["provider"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              provider: { type: "string" },
              configured: { type: "boolean" },
              healthy: { type: "boolean" },
              responseTime: { type: "number" },
              error: { type: "string" },
              lastChecked: { type: "number" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      try {
        const { provider: providerType } = req.params as {
          provider: ProviderType;
        };

        const config = {
          openaiApiKey:
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
          anthropicApiKey:
            (req.headers["x-anthropic-key"] as string) ||
            process.env.ANTHROPIC_API_KEY,
          googleApiKey:
            (req.headers["x-google-api-key"] as string) ||
            process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const provider = providerSelector.getProviderByType(providerType);

        if (!provider) {
          return reply.send({
            provider: providerType,
            configured: false,
            healthy: false,
            error: "Provider not configured",
            lastChecked: Date.now(),
          });
        }

        try {
          const health = await provider.healthCheck();
          return reply.send({
            provider: providerType,
            configured: true,
            ...health,
          });
        } catch (error) {
          return reply.send({
            provider: providerType,
            configured: true,
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error",
            lastChecked: Date.now(),
          });
        }
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error
              ? error.message
              : "Failed to check provider health",
        });
      }
    },
  );

  app.post(
    "/admin/providers/:provider/test",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Provider Management"],
        summary: "Test provider with API key",
        description: "Test a specific AI provider with provided API key",
        params: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["openai", "anthropic", "google"],
            },
          },
          required: ["provider"],
        },
        body: {
          type: "object",
          properties: {
            apiKey: { type: "string" },
          },
          required: ["apiKey"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              provider: { type: "string" },
              healthy: { type: "boolean" },
              responseTime: { type: "number" },
              error: { type: "string" },
              lastChecked: { type: "number" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
      },
    },
    async (req, reply) => {
      try {
        const { provider: providerType } = req.params as {
          provider: ProviderType;
        };
        const { apiKey } = req.body as { apiKey: string };

        // Create a temporary provider instance with the provided API key
        let provider;
        switch (providerType) {
          case "openai": {
            const { OpenAIProvider } = await import("./providers/openai.js");
            provider = new OpenAIProvider({ apiKey });
            break;
          }
          case "anthropic": {
            const { AnthropicProvider } = await import(
              "./providers/anthropic.js"
            );
            provider = new AnthropicProvider({ apiKey });
            break;
          }
          case "google": {
            const { GoogleProvider } = await import("./providers/google.js");
            provider = new GoogleProvider({ apiKey });
            break;
          }
          default:
            return reply.code(400).send({ error: "Invalid provider type" });
        }

        try {
          const health = await provider.healthCheck();
          return reply.send({
            provider: providerType,
            ...health,
          });
        } catch (error) {
          return reply.send({
            provider: providerType,
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error",
            lastChecked: Date.now(),
          });
        }
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error ? error.message : "Failed to test provider",
        });
      }
    },
  );

  // Tag Management APIs
  app.post(
    "/admin/tenant/:tenantId/tags",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Create tag",
        description: "Create a new tag for a tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            parentId: { type: "number" },
            color: { type: "string" },
            metadata: { type: "object" },
          },
          required: ["name"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const { name, description, parentId, color, metadata } = req.body as {
        name: string;
        description?: string;
        parentId?: number;
        color?: string;
        metadata?: Record<string, unknown>;
      };

      try {
        // Check if tenant exists
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (!tenant) {
          return reply.code(404).send({ error: "Tenant not found" });
        }

        // Check for duplicate tag name within tenant
        const existing = await prisma.tag.findFirst({
          where: { tenantId: id, name, isActive: true },
        });
        if (existing) {
          return reply.code(400).send({ error: "Tag name already exists" });
        }

        // Calculate hierarchy details if parent is specified
        let path = name;
        let level = 0;

        if (parentId) {
          const parent = await prisma.tag.findFirst({
            where: { id: parentId, tenantId: id, isActive: true },
          });
          if (!parent) {
            return reply.code(400).send({ error: "Parent tag not found" });
          }
          path = parent.path
            ? `${parent.path}/${name}`
            : `${parent.name}/${name}`;
          level = parent.level + 1;
        }

        const tag = await prisma.tag.create({
          data: {
            tenantId: id,
            name,
            description,
            parentId,
            path,
            level,
            color,
            metadata: metadata as Prisma.InputJsonValue,
          },
          include: {
            parent: true,
            children: true,
            budgets: true,
          },
        });

        // Invalidate tag cache for this tenant
        await invalidateTagCache(id, redisClient);

        return reply.send(tag);
      } catch (error) {
        console.error("Error creating tag:", error);
        return reply.code(500).send({ error: "Failed to create tag" });
      }
    },
  );

  app.get(
    "/admin/tenant/:tenantId/tags",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "List tags",
        description: "Get all tags for a tenant",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        querystring: {
          type: "object",
          properties: {
            includeInactive: { type: "boolean" },
            parentId: { type: "number" },
          },
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const { includeInactive, parentId } = req.query as {
        includeInactive?: boolean;
        parentId?: number;
      };
      const id = Number(tenantId);

      try {
        const whereClause: TagWhereClause = { tenantId: id };

        if (!includeInactive) {
          whereClause.isActive = true;
        }

        if (parentId !== undefined) {
          whereClause.parentId = parentId;
        }

        const tags = await prisma.tag.findMany({
          where: whereClause,
          include: {
            parent: true,
            children: { where: { isActive: true } },
            budgets: true,
            _count: {
              select: {
                usage: true,
              },
            },
          },
          orderBy: [{ level: "asc" }, { name: "asc" }],
        });

        return reply.send(tags);
      } catch (error) {
        console.error("Error fetching tags:", error);
        return reply.code(500).send({ error: "Failed to fetch tags" });
      }
    },
  );

  app.get(
    "/admin/tenant/:tenantId/tags/:tagId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Get tag",
        description: "Get a specific tag by ID",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        const tag = await prisma.tag.findFirst({
          where: {
            id: tagIdNum,
            tenantId: tenantIdNum,
            isActive: true,
          },
          include: {
            parent: true,
            children: { where: { isActive: true } },
            budgets: true,
            _count: {
              select: {
                usage: true,
              },
            },
          },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        return reply.send(tag);
      } catch (error) {
        console.error("Error fetching tag:", error);
        return reply.code(500).send({ error: "Failed to fetch tag" });
      }
    },
  );

  app.put(
    "/admin/tenant/:tenantId/tags/:tagId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Update tag",
        description: "Update a tag's properties",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            color: { type: "string" },
            metadata: { type: "object" },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const { name, description, color, metadata, isActive } = req.body as {
        name?: string;
        description?: string;
        color?: string;
        metadata?: Record<string, unknown>;
        isActive?: boolean;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Check if tag exists
        const existingTag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum },
        });

        if (!existingTag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        // Check for name conflicts if updating name
        if (name && name !== existingTag.name) {
          const duplicate = await prisma.tag.findFirst({
            where: {
              tenantId: tenantIdNum,
              name,
              isActive: true,
              id: { not: tagIdNum },
            },
          });
          if (duplicate) {
            return reply.code(400).send({ error: "Tag name already exists" });
          }
        }

        // Update the tag
        const updateData: TagUpdateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (color !== undefined) updateData.color = color;
        if (metadata !== undefined)
          updateData.metadata = metadata as Prisma.InputJsonValue;
        if (isActive !== undefined) updateData.isActive = isActive;

        // Update path if name changed
        if (name && name !== existingTag.name) {
          if (existingTag.parentId) {
            const parent = await prisma.tag.findUnique({
              where: { id: existingTag.parentId },
            });
            updateData.path = parent?.path
              ? `${parent.path}/${name}`
              : `${parent?.name}/${name}`;
          } else {
            updateData.path = name;
          }
        }

        const updatedTag = await prisma.tag.update({
          where: { id: tagIdNum },
          data: updateData,
          include: {
            parent: true,
            children: { where: { isActive: true } },
            budgets: true,
            _count: {
              select: {
                usage: true,
              },
            },
          },
        });

        // Invalidate tag cache for this tenant
        await invalidateTagCache(tenantIdNum, redisClient);

        return reply.send(updatedTag);
      } catch (error) {
        console.error("Error updating tag:", error);
        return reply.code(500).send({ error: "Failed to update tag" });
      }
    },
  );

  app.delete(
    "/admin/tenant/:tenantId/tags/:tagId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Delete tag",
        description:
          "Permanently delete a tag and all associated data (budgets, usage records)",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Check if tag exists
        const tag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum },
          include: {
            children: true,
            tenant: true,
          },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        // Check if tag has children (both active and inactive)
        if (tag.children.length > 0) {
          return reply.code(400).send({
            error: "Cannot delete tag with children. Delete children first.",
          });
        }

        // Use transaction to ensure all related data is deleted consistently
        await prisma.$transaction(async (tx) => {
          // Delete related records in correct order to handle foreign key constraints
          await tx.requestTag.deleteMany({ where: { tagId: tagIdNum } });
          await tx.tagBudget.deleteMany({ where: { tagId: tagIdNum } });

          // Finally delete the tag itself
          await tx.tag.delete({ where: { id: tagIdNum } });
        });

        // Clean up Redis cache
        if (redisClient && tag.tenant) {
          try {
            // Delete tag budget cache for all periods
            for (const period of BUDGET_PERIODS) {
              await redisClient.del(
                `tag_budget:${tag.tenant.name}:${tag.name}:${period}`,
              );
            }
          } catch (redisError) {
            console.warn(
              "Error cleaning up Redis cache for deleted tag:",
              redisError,
            );
            // Don't fail the request if Redis cleanup fails
          }
        }

        // Invalidate tag cache for this tenant
        await invalidateTagCache(tenantIdNum, redisClient);

        return reply.send({ success: true });
      } catch (error) {
        console.error("Error deleting tag:", error);
        return reply.code(500).send({ error: "Failed to delete tag" });
      }
    },
  );

  // Tag deactivation endpoint (soft delete - sets isActive to false)
  app.patch(
    "/admin/tenant/:tenantId/tags/:tagId/deactivate",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Deactivate tag",
        description:
          "Soft delete a tag (sets isActive to false) without removing data",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Check if tag exists
        const tag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum },
          include: { children: { where: { isActive: true } } },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        // Check if tag has active children
        if (tag.children.length > 0) {
          return reply.code(400).send({
            error:
              "Cannot deactivate tag with active children. Deactivate children first.",
          });
        }

        // Soft delete the tag
        await prisma.tag.update({
          where: { id: tagIdNum },
          data: { isActive: false },
        });

        // Invalidate tag cache for this tenant
        await invalidateTagCache(tenantIdNum, redisClient);

        return reply.send({ success: true });
      } catch (error) {
        console.error("Error deactivating tag:", error);
        return reply.code(500).send({ error: "Failed to deactivate tag" });
      }
    },
  );

  // Tag reactivation endpoint
  app.patch(
    "/admin/tenant/:tenantId/tags/:tagId/activate",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Management"],
        summary: "Activate tag",
        description:
          "Reactivate a previously deactivated tag (sets isActive to true)",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Check if tag exists
        const tag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        // Reactivate the tag
        await prisma.tag.update({
          where: { id: tagIdNum },
          data: { isActive: true },
        });

        // Invalidate tag cache for this tenant
        await invalidateTagCache(tenantIdNum, redisClient);

        return reply.send({ success: true });
      } catch (error) {
        console.error("Error activating tag:", error);
        return reply.code(500).send({ error: "Failed to activate tag" });
      }
    },
  );

  // Tag Budget Management APIs
  app.post(
    "/admin/tenant/:tenantId/tags/:tagId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Budget Management"],
        summary: "Create tag budget",
        description: "Create a budget for a specific tag",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        body: {
          type: "object",
          properties: {
            period: { type: "string" },
            amountUsd: { type: "number" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            weight: { type: "number" },
            alertThresholds: { type: "object" },
            inheritanceMode: { type: "string" },
          },
          required: ["period", "amountUsd"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const {
        period,
        amountUsd,
        startDate,
        endDate,
        weight = 1.0,
        alertThresholds,
        inheritanceMode = "LENIENT",
      } = req.body as {
        period: string;
        amountUsd: number;
        startDate?: string;
        endDate?: string;
        weight?: number;
        alertThresholds?: Record<string, unknown>;
        inheritanceMode?: string;
      };

      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Validate period
        if (!isValidPeriod(period as Period)) {
          return reply.code(400).send({
            error: `Invalid period. Must be one of: ${ALLOWED_PERIODS.join(", ")}`,
          });
        }

        // Check if tag exists and belongs to tenant
        const tag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum, isActive: true },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        // Check for existing budget with same period
        const existingBudget = await prisma.tagBudget.findFirst({
          where: {
            tagId: tagIdNum,
            period,
            isActive: true,
          },
        });

        if (existingBudget) {
          return reply.code(400).send({
            error: "Budget already exists for this tag and period",
          });
        }

        // Validate dates for custom period
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;

        if (period === "custom") {
          if (!startDate || !endDate) {
            return reply.code(400).send({
              error: "startDate and endDate are required for custom periods",
            });
          }
          parsedStartDate = new Date(startDate);
          parsedEndDate = new Date(endDate);

          if (parsedStartDate >= parsedEndDate) {
            return reply.code(400).send({
              error: "startDate must be before endDate",
            });
          }
        }

        // Create tag budget
        const tagBudget = await prisma.tagBudget.create({
          data: {
            tagId: tagIdNum,
            period,
            amountUsd,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            weight,
            alertThresholds: alertThresholds as Prisma.InputJsonValue,
            inheritanceMode,
          },
          include: {
            tag: true,
          },
        });

        return reply.send(tagBudget);
      } catch (error) {
        console.error("Error creating tag budget:", error);
        return reply.code(500).send({ error: "Failed to create tag budget" });
      }
    },
  );

  app.get(
    "/admin/tenant/:tenantId/tags/:tagId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Budget Management"],
        summary: "Get tag budgets",
        description: "Get all budgets for a specific tag",
        params: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            tagId: { type: "string" },
          },
          required: ["tenantId", "tagId"],
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId, tagId } = req.params as {
        tenantId: string;
        tagId: string;
      };
      const tenantIdNum = Number(tenantId);
      const tagIdNum = Number(tagId);

      try {
        // Check if tag exists and belongs to tenant
        const tag = await prisma.tag.findFirst({
          where: { id: tagIdNum, tenantId: tenantIdNum, isActive: true },
        });

        if (!tag) {
          return reply.code(404).send({ error: "Tag not found" });
        }

        const budgets = await prisma.tagBudget.findMany({
          where: {
            tagId: tagIdNum,
            isActive: true,
          },
          include: {
            tag: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return reply.send(budgets);
      } catch (error) {
        console.error("Error fetching tag budgets:", error);
        return reply.code(500).send({ error: "Failed to fetch tag budgets" });
      }
    },
  );

  app.put(
    "/admin/budget/tag/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Budget Management"],
        summary: "Update tag budget",
        description: "Update a tag budget",
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        body: {
          type: "object",
          properties: {
            amountUsd: { type: "number" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            weight: { type: "number" },
            alertThresholds: { type: "object" },
            inheritanceMode: { type: "string" },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const {
        amountUsd,
        startDate,
        endDate,
        weight,
        alertThresholds,
        inheritanceMode,
        isActive,
      } = req.body as {
        amountUsd?: number;
        startDate?: string;
        endDate?: string;
        weight?: number;
        alertThresholds?: Record<string, unknown>;
        inheritanceMode?: string;
        isActive?: boolean;
      };

      const budgetIdNum = Number(budgetId);

      try {
        // Check if budget exists
        const existingBudget = await prisma.tagBudget.findUnique({
          where: { id: budgetIdNum },
          include: { tag: true },
        });

        if (!existingBudget) {
          return reply.code(404).send({ error: "Tag budget not found" });
        }

        // Validate dates for custom period if updating dates
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;

        if (existingBudget.period === "custom" && (startDate || endDate)) {
          parsedStartDate = startDate
            ? new Date(startDate)
            : existingBudget.startDate || undefined;
          parsedEndDate = endDate
            ? new Date(endDate)
            : existingBudget.endDate || undefined;

          if (
            parsedStartDate &&
            parsedEndDate &&
            parsedStartDate >= parsedEndDate
          ) {
            return reply.code(400).send({
              error: "startDate must be before endDate",
            });
          }
        }

        // Update budget
        const updateData: TagBudgetUpdateData = {};
        if (amountUsd !== undefined)
          updateData.amountUsd = amountUsd.toString();
        if (startDate !== undefined) updateData.startDate = parsedStartDate;
        if (endDate !== undefined) updateData.endDate = parsedEndDate;
        if (weight !== undefined) updateData.weight = weight;
        if (alertThresholds !== undefined)
          updateData.alertThresholds = alertThresholds as Prisma.InputJsonValue;
        if (inheritanceMode !== undefined)
          updateData.inheritanceMode = inheritanceMode;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updatedBudget = await prisma.tagBudget.update({
          where: { id: budgetIdNum },
          data: updateData,
          include: {
            tag: true,
          },
        });

        return reply.send(updatedBudget);
      } catch (error) {
        console.error("Error updating tag budget:", error);
        return reply.code(500).send({ error: "Failed to update tag budget" });
      }
    },
  );

  app.delete(
    "/admin/budget/tag/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Budget Management"],
        summary: "Delete tag budget",
        description: "Delete a tag budget",
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const budgetIdNum = Number(budgetId);

      try {
        // Check if budget exists
        const budget = await prisma.tagBudget.findUnique({
          where: { id: budgetIdNum },
        });

        if (!budget) {
          return reply.code(404).send({ error: "Tag budget not found" });
        }

        // Delete the budget (hard delete for now, could be soft delete)
        await prisma.tagBudget.delete({
          where: { id: budgetIdNum },
        });

        return reply.send({ success: true });
      } catch (error) {
        console.error("Error deleting tag budget:", error);
        return reply.code(500).send({ error: "Failed to delete tag budget" });
      }
    },
  );

  // Tag Analytics endpoint
  app.get(
    "/admin/tenant/:tenantId/tag-analytics",
    {
      preHandler: adminAuth,
      schema: {
        tags: ["Tag Analytics"],
        summary: "Get tag usage analytics for a tenant",
        description:
          "Retrieve comprehensive tag usage analytics including usage data, budget health, trends, and hierarchy",
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        querystring: {
          type: "object",
          properties: {
            days: { type: "number", minimum: 1, maximum: 365 },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            tagId: { type: "array", items: { type: "number" } },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              usage: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tagId: { type: "number" },
                    tagName: { type: "string" },
                    path: { type: "string" },
                    usage: { type: "number" },
                    requests: { type: "number" },
                    percentage: { type: "number" },
                    color: { type: "string" },
                  },
                },
              },
              budgetHealth: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tagId: { type: "number" },
                    tagName: { type: "string" },
                    budgetId: { type: "number" },
                    period: { type: "string" },
                    budget: { type: "number" },
                    usage: { type: "number" },
                    percentage: { type: "number" },
                    weight: { type: "number" },
                    inheritanceMode: { type: "string" },
                    status: { type: "string" },
                  },
                },
              },
              trends: { type: "array" },
              hierarchy: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    name: { type: "string" },
                    path: { type: "string" },
                    usage: { type: "number" },
                    budget: { type: "number" },
                    children: { type: "array" },
                  },
                },
              },
              totalUsage: { type: "number" },
              totalRequests: { type: "number" },
              activeTags: { type: "number" },
              criticalBudgets: { type: "number" },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const tenantIdNum = Number(tenantId);

      const {
        days = 30,
        startDate,
        endDate,
        tagId: tagIds,
      } = req.query as {
        days?: number;
        startDate?: string;
        endDate?: string;
        tagId?: number[];
      };

      try {
        // Check if tenant exists
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantIdNum },
        });
        if (!tenant) {
          return reply.code(404).send({ error: "Tenant not found" });
        }

        // Calculate date range
        const endDateTime = endDate ? new Date(endDate) : new Date();
        const startDateTime = startDate
          ? new Date(startDate)
          : new Date(endDateTime.getTime() - days * 24 * 60 * 60 * 1000);

        // Get all tags for the tenant
        const tags = await prisma.tag.findMany({
          where: {
            tenantId: tenantIdNum,
            isActive: true,
            ...(tagIds && tagIds.length > 0 ? { id: { in: tagIds } } : {}),
          },
          include: {
            parent: true,
            children: true,
            budgets: {
              where: { isActive: true },
            },
          },
        });

        // Get usage data with tag associations
        const usageData = await prisma.usageLedger.findMany({
          where: {
            tenantId: tenantIdNum,
            ts: {
              gte: startDateTime,
              lte: endDateTime,
            },
            tags: {
              some: {
                tag: {
                  id: tagIds && tagIds.length > 0 ? { in: tagIds } : undefined,
                  isActive: true,
                },
              },
            },
          },
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        });

        // Calculate tag usage aggregations
        const tagUsageMap = new Map<
          number,
          {
            tagId: number;
            tagName: string;
            path: string;
            usage: number;
            requests: number;
            color?: string;
          }
        >();

        for (const usage of usageData) {
          for (const tagAssoc of usage.tags) {
            const tag = tagAssoc.tag;
            const key = tag.id;

            if (!tagUsageMap.has(key)) {
              tagUsageMap.set(key, {
                tagId: tag.id,
                tagName: tag.name,
                path: tag.path || "",
                usage: 0,
                requests: 0,
                color: tag.color || undefined,
              });
            }

            const tagUsage = tagUsageMap.get(key)!;
            tagUsage.usage += Number(usage.usd) * (tagAssoc.weight || 1.0);
            tagUsage.requests += 1;
          }
        }

        // Calculate total usage for percentage calculations
        // Note: totalUsage should be the sum of actual usage entries, not tag attributions
        // since each usage entry can be attributed to multiple tags
        const actualTotalUsage = usageData.reduce(
          (sum, usage) => sum + Number(usage.usd),
          0,
        );
        const actualTotalRequests = usageData.length;

        // For percentage calculations within tag analytics, we use tag attribution totals
        const tagAttributionTotal = Array.from(tagUsageMap.values()).reduce(
          (sum, tag) => sum + tag.usage,
          0,
        );

        // Convert to array with percentages
        const usageAnalytics = Array.from(tagUsageMap.values()).map((tag) => ({
          ...tag,
          percentage:
            tagAttributionTotal > 0
              ? (tag.usage / tagAttributionTotal) * 100
              : 0,
        }));

        // Calculate budget health
        const budgetHealth = [];
        for (const tag of tags) {
          for (const budget of tag.budgets) {
            const tagUsage = tagUsageMap.get(tag.id);
            const usage = tagUsage ? tagUsage.usage : 0;
            const budgetAmount = Number(budget.amountUsd);
            const percentage =
              budgetAmount > 0 ? (usage / budgetAmount) * 100 : 0;

            let status = "healthy";
            if (percentage >= 90) status = "critical";
            else if (percentage >= 70) status = "warning";

            budgetHealth.push({
              tagId: tag.id,
              tagName: tag.name,
              budgetId: budget.id,
              period: budget.period,
              budget: budgetAmount,
              usage: usage,
              percentage: percentage,
              weight: budget.weight,
              inheritanceMode: budget.inheritanceMode,
              status: status,
            });
          }
        }

        // Build hierarchy
        interface HierarchyNode {
          id: number;
          name: string;
          path: string;
          usage: number;
          budget?: number;
          children: HierarchyNode[];
        }

        const buildHierarchy = (parentId: number | null): HierarchyNode[] => {
          return tags
            .filter((tag) => tag.parentId === parentId)
            .map((tag) => {
              const tagUsage = tagUsageMap.get(tag.id);
              const budget =
                tag.budgets.length > 0
                  ? Number(tag.budgets[0].amountUsd)
                  : undefined;

              return {
                id: tag.id,
                name: tag.name,
                path: tag.path || "",
                usage: tagUsage ? tagUsage.usage : 0,
                budget: budget,
                children: buildHierarchy(tag.id),
              };
            });
        };

        const hierarchy = buildHierarchy(null);

        // Calculate summary metrics
        const activeTags = tags.length;
        const criticalBudgets = budgetHealth.filter(
          (b) => b.status === "critical",
        ).length;

        const response = {
          usage: usageAnalytics,
          budgetHealth: budgetHealth,
          trends: [], // TODO: Implement trends calculation
          hierarchy: hierarchy,
          totalUsage: actualTotalUsage,
          totalRequests: actualTotalRequests,
          activeTags: activeTags,
          criticalBudgets: criticalBudgets,
        };

        return reply.send(response);
      } catch (error) {
        console.error("Error fetching tag analytics:", error);
        return reply.code(500).send({ error: "Failed to fetch tag analytics" });
      }
    },
  );

  return app;
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const start = async () => {
    try {
      const app = await buildServer();
      const port = Number(process.env.PORT) || 3000;
      const host = process.env.HOST || "0.0.0.0";

      await app.listen({ port, host });
      console.log(`🚀 Server running at http://${host}:${port}`);
      console.log(`📊 Dashboard: http://${host}:${port}/dashboard`);
      console.log(`📖 API Docs: http://${host}:${port}/docs`);
    } catch (err) {
      console.error("Error starting server:", err);
      process.exit(1);
    }
  };

  void start();
}
