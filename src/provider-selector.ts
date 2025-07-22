import type { PrismaClient } from "@prisma/client";
import type { Provider } from "./providers/base.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";

export type ProviderType = "openai" | "anthropic" | "google";

export interface ProviderSelector {
  getProviderForModel(model: string): Promise<Provider | null>;
}

export class DatabaseProviderSelector implements ProviderSelector {
  constructor(
    private prisma: PrismaClient,
    private config: {
      openaiApiKey?: string;
      anthropicApiKey?: string;
      googleApiKey?: string;
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
      case "google":
        if (!this.config.googleApiKey) {
          throw new Error("Google API key not configured");
        }
        return new GoogleProvider({ apiKey: this.config.googleApiKey });
      default:
        return null;
    }
  }
}

export function getProviderForModel(
  model: string,
  prisma: PrismaClient,
  config: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    googleApiKey?: string;
  },
): Promise<Provider | null> {
  const selector = new DatabaseProviderSelector(prisma, config);
  return selector.getProviderForModel(model);
}
