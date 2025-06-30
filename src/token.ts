export interface CountInput {
  model: string;
  prompt: string | Array<{ role: string; content: string; name?: string }>;
  completion?: string;
}

export interface CountResult {
  promptTokens: number;
  completionTokens: number;
  usd: number;
}

import { encoding_for_model, TiktokenModel } from "tiktoken";

const PRICE: Record<string, { prompt: number; completion: number }> = {
  "gpt-3.5-turbo": { prompt: 0.001, completion: 0.002 },
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
};

function priceFor(model: string) {
  for (const key of Object.keys(PRICE)) {
    if (model.startsWith(key)) return PRICE[key];
  }
  return PRICE["gpt-3.5-turbo"];
}

export function countTokensAndCost(input: CountInput): CountResult {
  let enc: ReturnType<typeof encoding_for_model>;
  try {
    enc = encoding_for_model(input.model as TiktokenModel);
  } catch {
    enc = encoding_for_model("gpt-3.5-turbo" as TiktokenModel);
  }
  let promptTokens = 0;
  let completionTokens = 0;

  const price = priceFor(input.model);

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
    (promptTokens * price.prompt) / 1000 +
    (completionTokens * price.completion) / 1000;
  enc.free();
  return { promptTokens, completionTokens, usd };
}
