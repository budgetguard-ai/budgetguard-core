import type { PrismaClient } from "@prisma/client";
import type { Provider } from "./providers/base.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";

export type ProviderType = "openai" | "anthropic";

export interface ProviderSelector {
  getProviderForModel(model: string): Promise<Provider | null>;
}

export class DatabaseProviderSelector implements ProviderSelector {
  constructor(
    private prisma: PrismaClient,
    private config: {
      openaiApiKey?: string;
      anthropicApiKey?: string;
    },
  ) {}

  async getProviderForModel(model: string): Promise<Provider | null> {
    const modelPricing = await this.prisma.modelPricing.findUnique({
      where: { model },
    });

    if (!modelPricing || !modelPricing.provider) {
      return null;
    }

    switch (modelPricing.provider as ProviderType) {
      case "openai":
        if (!this.config.openaiApiKey) {
          throw new Error("OpenAI API key not configured");
        }
        return new OpenAIProvider({ apiKey: this.config.openaiApiKey });
      case "anthropic":
        if (!this.config.anthropicApiKey) {
          throw new Error("Anthropic API key not configured");
        }
        return new AnthropicProvider({ apiKey: this.config.anthropicApiKey });
      default:
        return null;
    }
  }
}

export function getProviderForModel(
  model: string,
  prisma: PrismaClient,
  config: { openaiApiKey?: string; anthropicApiKey?: string },
): Promise<Provider | null> {
  const selector = new DatabaseProviderSelector(prisma, config);
  return selector.getProviderForModel(model);
}
