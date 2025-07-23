import {
  Provider,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  ProviderHealthStatus,
} from "./base.js";

export class OpenAIProvider implements Provider {
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.openai.com";
  }

  private isValidCompletionResponse(data: unknown): data is CompletionResponse {
    // Basic validation for OpenAI response structure
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Check for common OpenAI response fields
    // For successful responses, expect either choices or error field
    const hasChoices = "choices" in obj && Array.isArray(obj.choices);
    const hasError = "error" in obj;
    const hasId = "id" in obj && typeof obj.id === "string";
    const hasModel = "model" in obj && typeof obj.model === "string";

    // Valid if it has standard OpenAI fields or is an error response
    return hasError || (hasChoices && (hasId || hasModel));
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

    if (!resp.ok) {
      // Return error in OpenAI-compatible format
      return {
        status: resp.status,
        data: {
          error: json,
        },
      };
    }

    if (!this.isValidCompletionResponse(json)) {
      const responsePreview = JSON.stringify(json).slice(0, 500);
      throw new Error(
        `Invalid response structure from OpenAI API: ${responsePreview}`,
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

  async healthCheck(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    const lastChecked = Date.now();

    try {
      // Make a lightweight request to check API connectivity
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - startTime;

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const errorMessage =
          typeof errorData === "object" &&
          errorData !== null &&
          "error" in errorData
            ? (errorData as { error?: { message?: string } }).error?.message
            : undefined;
        return {
          healthy: false,
          responseTime,
          error: `HTTP ${resp.status}: ${errorMessage || resp.statusText}`,
          lastChecked,
        };
      }

      // Verify the response is valid
      const data = await resp.json();
      const hasValidData =
        typeof data === "object" &&
        data !== null &&
        "data" in data &&
        Array.isArray((data as { data: unknown }).data);
      if (!hasValidData) {
        return {
          healthy: false,
          responseTime,
          error: "Invalid response structure from OpenAI models endpoint",
          lastChecked,
        };
      }

      return {
        healthy: true,
        responseTime,
        lastChecked,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : "Unknown error",
        lastChecked,
      };
    }
  }
}
