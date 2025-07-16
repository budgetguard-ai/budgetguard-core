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

    const json = (await resp.json()) as CompletionResponse;
    return {
      status: resp.status,
      data: json,
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
