import { PrismaClient, Prisma } from "@prisma/client";

export interface SessionHeaders {
  sessionId?: string;
  sessionName?: string;
  sessionPath?: string;
}

export function extractSessionHeaders(h: Record<string, unknown>): SessionHeaders {
  // Case-insensitive header lookup
  const findHeader = (key: string): string | undefined => {
    for (const [headerKey, value] of Object.entries(h)) {
      if (headerKey.toLowerCase() === key.toLowerCase()) {
        return (value as string | undefined)?.trim();
      }
    }
    return undefined;
  };

  return {
    sessionId: findHeader("x-session-id"),
    sessionName: findHeader("x-session-name"),
    sessionPath: findHeader("x-session-path"),
  };
}

export async function getOrCreateSession(
  headers: SessionHeaders,
  tenantId: number,
  tagIds: number[],
  prisma: PrismaClient,
): Promise<{
  sessionId: string;
  effectiveBudgetUsd: number | null;
  currentCostUsd: number;
  status: string;
} | null> {
  if (!headers.sessionId) {
    // No session requested
    return null;
  }

  // Fetch related budgets (tenant + tag overrides)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultSessionBudgetUsd: true },
  });

  let tagBudget: Prisma.Decimal | null = null;
  if (tagIds.length > 0) {
    const tagWithBudget = await prisma.tag.findFirst({
      where: {
        id: { in: tagIds },
        sessionBudgetUsd: { not: null },
      },
      orderBy: { sessionBudgetUsd: "asc" }, // choose lowest if multiple
      select: { sessionBudgetUsd: true },
    });
    tagBudget = tagWithBudget?.sessionBudgetUsd ?? null;
  }

  const effective =
    (tagBudget?.toNumber?.() ??
      tenant?.defaultSessionBudgetUsd?.toNumber?.()) ?? null;

  const existing = await prisma.session.findUnique({
    where: { sessionId: headers.sessionId },
  });

  if (existing) {
    // Recompute effective budget each fetch (in case admin/tag changed)
    if (effective !== null && effective !== existing.effectiveBudgetUsd?.toNumber?.()) {
      await prisma.session.update({
        where: { sessionId: existing.sessionId },
        data: { effectiveBudgetUsd: effective },
      });
    }
    return {
      sessionId: existing.sessionId,
      effectiveBudgetUsd:
        effective !== null
          ? effective
          : existing.effectiveBudgetUsd?.toNumber?.() ?? null,
      currentCostUsd: existing.currentCostUsd.toNumber
        ? existing.currentCostUsd.toNumber()
        : Number(existing.currentCostUsd),
      status: existing.status,
    };
  }

  const created = await prisma.session.create({
    data: {
      sessionId: headers.sessionId,
      tenantId,
      name: headers.sessionName,
      path: headers.sessionPath,
      effectiveBudgetUsd: effective !== null ? new Prisma.Decimal(effective) : null,
      currentCostUsd: new Prisma.Decimal(0),
    },
  });

  if (tagIds.length > 0) {
    // Connect tags (optional; can be deferred)
    await prisma.session.update({
      where: { sessionId: created.sessionId },
      data: {
        tags: {
          connect: tagIds.map((id) => ({ id })),
        },
      },
    });
  }

  return {
    sessionId: created.sessionId,
    effectiveBudgetUsd: effective,
    currentCostUsd: 0,
    status: created.status,
  };
}

export async function markSessionBudgetExceeded(
  sessionId: string,
  prisma: PrismaClient,
) {
  if (!sessionId) return;
  await prisma.session.update({
    where: { sessionId },
    data: { status: "budget_exceeded" },
  });
}

export async function incrementSessionCost(
  sessionId: string,
  usd: number,
  prisma: PrismaClient,
) {
  if (!sessionId || usd <= 0) return;
  await prisma.session.update({
    where: { sessionId },
    data: {
      currentCostUsd: {
        increment: new Prisma.Decimal(usd),
      },
      lastActiveAt: new Date(),
    },
  });
}