import { encoding_for_model, get_encoding, TiktokenModel } from "tiktoken";
import { PrismaClient } from "@prisma/client";

export interface TokenCountInput {
  model: string;
  prompt: string | Array<{ role: string; content: string; name?: string }>;
  completion?: string;
}

export interface TokenCountResult {
  promptTokens: number;
  completionTokens: number;
  usd: number;
}

// Fallback pricing for unknown models (gpt-3.5-turbo equivalent)
// Prices are in USD per 1 million tokens
const FALLBACK_PRICING = { prompt: 1, completion: 2 };

export async function countTokensAndCost(
  input: TokenCountInput,
  prisma: PrismaClient,
): Promise<TokenCountResult> {
  let enc: ReturnType<typeof encoding_for_model>;
  try {
    // Use string model name directly, cast as TiktokenModel
    enc = encoding_for_model(input.model as TiktokenModel);
  } catch {
    // If encoding_for_model fails, fallback to cl100k_base encoding
    enc = get_encoding("cl100k_base");
  }
  let promptTokens = 0;
  let completionTokens = 0;

  // Lookup pricing from database
  let price = FALLBACK_PRICING;
  try {
    const modelPricing = await prisma.modelPricing.findUnique({
      where: { model: input.model },
    });
    if (modelPricing) {
      price = {
        prompt: Number(modelPricing.inputPrice),
        completion: Number(modelPricing.outputPrice),
      };
    } else {
      console.log(
        `No pricing found for model ${input.model}, using fallback pricing`,
      );
    }
  } catch (error) {
    console.error(`Error fetching pricing for model ${input.model}:`, error);
    console.log(`Using fallback pricing for model ${input.model}`);
  }

  if (typeof input.prompt === "string") {
    if (input.prompt) {
      promptTokens = enc.encode(input.prompt).length;
    }
  } else if (Array.isArray(input.prompt)) {
    for (const msg of input.prompt) {
      promptTokens += 4; // per-message tokens
      promptTokens += enc.encode(msg.role).length;
      promptTokens += enc.encode(msg.content).length;
      if (msg.name) promptTokens += enc.encode(msg.name).length - 1;
    }
    promptTokens += 2; // assistant priming
  }

  if (input.completion) {
    completionTokens = enc.encode(input.completion).length;
  }

  const usd =
    (promptTokens * price.prompt) / 1000000 +
    (completionTokens * price.completion) / 1000000;
  enc.free();
  return { promptTokens, completionTokens, usd };
}
