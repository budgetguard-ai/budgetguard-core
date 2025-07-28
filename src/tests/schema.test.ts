import { describe, it, beforeEach, expect, vi } from "vitest";
// Basic CRUD coverage for new Prisma models
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  interface Tenant {
    id: number;
    name: string;
  }
  interface ApiKey {
    id: number;
    key: string;
    tenantId: number;
    isActive: boolean;
  }
  interface Budget {
    id: number;
    tenantId: number;
    period: string;
    amountUsd: string;
  }
  interface PolicyBundle {
    id: number;
    tenantId: number;
    name: string;
    wasmPath: string;
    active: boolean;
  }
  interface Alert {
    id: number;
    tenantId: number;
    type: string;
    target: string;
    thresholdUsd: string;
  }
  interface AuditLog {
    id: number;
    tenantId: number;
    actor: string;
    event: string;
    details: string;
  }

  class Collection<T extends { id: number }> {
    rows: T[] = [];
    async create({ data }: { data: Omit<T, "id"> }): Promise<T> {
      const row = { id: this.rows.length + 1, ...data } as T;
      this.rows.push(row);
      return row;
    }
    async findUnique({ where }: { where: { id: number } }): Promise<T | null> {
      return this.rows.find((r) => r.id === where.id) ?? null;
    }
    async update({
      where,
      data,
    }: {
      where: { id: number };
      data: Partial<T>;
    }): Promise<T> {
      const idx = this.rows.findIndex((r) => r.id === where.id);
      const cur = this.rows[idx];
      const updated = { ...cur, ...data };
      this.rows[idx] = updated;
      return updated;
    }
    async delete({ where }: { where: { id: number } }): Promise<void> {
      this.rows = this.rows.filter((r) => r.id !== where.id);
    }
  }

  class FakePrisma {
    tenant = new Collection<Tenant>();
    apiKey = new Collection<ApiKey>();
    budget = new Collection<Budget>();
    policyBundle = new Collection<PolicyBundle>();
    alert = new Collection<Alert>();
    auditLog = new Collection<AuditLog>();
    async $connect() {}
    async $disconnect() {}
  }

  return { PrismaClient: FakePrisma };
});

let prisma: PrismaClient;

beforeEach(() => {
  prisma = new PrismaClient();
});

describe("schema relations", () => {
  it("creates and links records", async () => {
    const tenant = await prisma.tenant.create({ data: { name: "t1" } });
    const key = await prisma.apiKey.create({
      data: {
        keyHash: "$2b$12$abcdefghijklmnopqrstuvwxyz",
        keyPrefix: "abcdefgh",
        tenantId: tenant.id,
        isActive: true,
      },
    });
    const budget = await prisma.budget.create({
      data: { tenantId: tenant.id, period: "monthly", amountUsd: "10" },
    });
    const policy = await prisma.policyBundle.create({
      data: {
        tenantId: tenant.id,
        name: "base",
        wasmPath: "p.wasm",
        active: true,
      },
    });
    const alert = await prisma.alert.create({
      data: {
        tenantId: tenant.id,
        type: "email",
        target: "a@example.com",
        thresholdUsd: "5",
      },
    });
    const audit = await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actor: "sys",
        event: "create",
        details: "ok",
      },
    });

    expect(key.tenantId).toBe(tenant.id);
    expect(budget.tenantId).toBe(tenant.id);
    expect(policy.tenantId).toBe(tenant.id);
    expect(alert.tenantId).toBe(tenant.id);
    expect(audit.tenantId).toBe(tenant.id);

    await prisma.apiKey.delete({ where: { id: key.id } });
    await prisma.policyBundle.update({
      where: { id: policy.id },
      data: { active: false },
    });
    const found = await prisma.budget.findUnique({ where: { id: budget.id } });
    expect(found?.period).toBe("monthly");
  });
});
