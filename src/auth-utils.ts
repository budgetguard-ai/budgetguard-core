import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

/**
 * Authenticates an API key by finding all active keys with matching prefix
 * and then comparing the hash
 */
export async function authenticateApiKey(
  suppliedKey: string,
  prisma: PrismaClient,
): Promise<{ id: number; tenantId: number } | null> {
  if (!suppliedKey || suppliedKey.length < 8) {
    return null;
  }

  const keyPrefix = suppliedKey.substring(0, 8);

  // Find all active keys with matching prefix
  const candidateKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix: keyPrefix,
      isActive: true,
    },
    select: {
      id: true,
      keyHash: true,
      tenantId: true,
    },
  });

  // Check each candidate key hash
  for (const candidate of candidateKeys) {
    const isValid = await bcrypt.compare(suppliedKey, candidate.keyHash);
    if (isValid) {
      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        id: candidate.id,
        tenantId: candidate.tenantId,
      };
    }
  }

  return null;
}
