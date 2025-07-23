import {
  Provider,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  ProviderHealthStatus,
} from "./base.js";

const DEFAULT_MAX_TOKENS = 4096; // or whatever default value is appropriate

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text";
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements Provider {
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.anthropic.com";
  }

  private convertRequestToAnthropic(
    request: CompletionRequest,
  ): AnthropicRequest {
    // Convert OpenAI-style messages to Anthropic format
    const messages: AnthropicMessage[] = [];
    let system: string | undefined;

    if (request.messages) {
      for (const message of request.messages) {
        if (message.role === "system") {
          // Anthropic handles system messages differently
          system = message.content;
        } else if (message.role === "user" || message.role === "assistant") {
          messages.push({
            role: message.role,
            content: message.content,
          });
        }
      }
    }

    // If there's a prompt field instead of messages, treat it as a user message
    if (request.prompt && !request.messages) {
      messages.push({
        role: "user",
        content: request.prompt,
      });
    }

    const requestWithMaxTokens = request as CompletionRequest & {
      max_tokens?: number;
    };

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: requestWithMaxTokens.max_tokens || DEFAULT_MAX_TOKENS,
      messages,
    };

    if (system) {
      anthropicRequest.system = system;
    }

    // Pass through optional parameters
    const requestWithOptionals = request as CompletionRequest & {
      temperature?: number;
      top_p?: number;
      stop?: string | string[];
    };

    if (requestWithOptionals.temperature !== undefined) {
      anthropicRequest.temperature = requestWithOptionals.temperature;
    }
    if (requestWithOptionals.top_p !== undefined) {
      anthropicRequest.top_p = requestWithOptionals.top_p;
    }
    if (requestWithOptionals.stop !== undefined) {
      anthropicRequest.stop_sequences = Array.isArray(requestWithOptionals.stop)
        ? requestWithOptionals.stop
        : [requestWithOptionals.stop];
    }

    return anthropicRequest;
  }

  private convertResponseFromAnthropic(
    response: AnthropicResponse,
  ): CompletionResponse {
    // Convert Anthropic response to OpenAI-compatible format
    const content = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");

    return {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      model: response.model,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private isValidAnthropicResponse(data: unknown): data is AnthropicResponse {
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "content" in data &&
      "model" in data &&
      "usage" in data
    );
  }

  private async requestEndpoint(
    path: string,
    request: CompletionRequest,
  ): Promise<{ status: number; data: CompletionResponse }> {
    const anthropicRequest = this.convertRequestToAnthropic(request);

    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicRequest),
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

    if (!this.isValidAnthropicResponse(json)) {
      const responsePreview = JSON.stringify(json).slice(0, 500);
      throw new Error(
        `Invalid response structure from Anthropic API: ${responsePreview}`,
      );
    }

    const convertedResponse = this.convertResponseFromAnthropic(json);

    return {
      status: resp.status,
      data: convertedResponse,
    };
  }

  async chatCompletion(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    return this.requestEndpoint("/v1/messages", request);
  }

  async responses(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    // Anthropic doesn't have a separate responses endpoint
    // Route to the same messages endpoint
    return this.requestEndpoint("/v1/messages", request);
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    const lastChecked = Date.now();

    try {
      // Make a minimal request to check API connectivity
      // Anthropic doesn't have a models endpoint, so we'll use a minimal message request
      const minimalRequest: AnthropicRequest = {
        model: "claude-3-haiku-20240307", // Use the smallest/fastest model
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      };

      const resp = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(minimalRequest),
        signal: AbortSignal.timeout(10000), // 10 second timeout for actual request
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
      if (!this.isValidAnthropicResponse(data)) {
        return {
          healthy: false,
          responseTime,
          error: "Invalid response structure from Anthropic API",
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
