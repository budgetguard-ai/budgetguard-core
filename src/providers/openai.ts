import {
  Provider,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
} from "./base.js";

export class OpenAIProvider implements Provider {
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.openai.com";
  }

  private isValidCompletionResponse(data: unknown): data is CompletionResponse {
    // Allow any object structure since OpenAI responses can vary
    // This provides basic validation while remaining flexible
    return typeof data === "object" && data !== null && !Array.isArray(data);
  }

  private async requestEndpoint(
    path: string,
    request: CompletionRequest,
  ): Promise<{ status: number; data: CompletionResponse }> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    const json = await resp.json();
    if (!this.isValidCompletionResponse(json)) {
      throw new Error(
        `Invalid response structure from OpenAI API: ${typeof json}`,
      );
    }

    return {
      status: resp.status,
      data: json as CompletionResponse,
    };
  }

  async chatCompletion(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    return this.requestEndpoint("/v1/chat/completions", request);
  }

  async responses(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    return this.requestEndpoint("/v1/responses", request);
  }
}
