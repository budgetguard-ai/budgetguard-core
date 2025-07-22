import {
  Provider,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
} from "./base.js";

const DEFAULT_MAX_TOKENS = 8192;

interface GoogleContent {
  parts: Array<{
    text: string;
  }>;
}

interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: {
    parts: Array<{
      text: string;
    }>;
  };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  };
}

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleProvider implements Provider {
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl =
      config.baseUrl ||
      "https://generativelanguage.googleapis.com/v1beta/models";
  }

  private convertRequestToGoogle(request: CompletionRequest): GoogleRequest {
    const contents: GoogleContent[] = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    if (request.messages) {
      for (const message of request.messages) {
        if (message.role === "system") {
          systemInstruction = {
            parts: [{ text: message.content }],
          };
        } else if (message.role === "user" || message.role === "assistant") {
          contents.push({
            parts: [{ text: message.content }],
          });
        }
      }
    }

    // If there's a prompt field instead of messages, treat it as user content
    if (request.prompt && !request.messages) {
      contents.push({
        parts: [{ text: request.prompt }],
      });
    }

    const googleRequest: GoogleRequest = {
      contents,
    };

    if (systemInstruction) {
      googleRequest.systemInstruction = systemInstruction;
    }

    // Handle generation config
    const requestWithOptionals = request as CompletionRequest & {
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stop?: string | string[];
      thinking_budget?: number; // Support for disabling thinking
    };

    const generationConfig: GoogleRequest["generationConfig"] = {};

    if (requestWithOptionals.max_tokens !== undefined) {
      generationConfig.maxOutputTokens = requestWithOptionals.max_tokens;
    } else {
      generationConfig.maxOutputTokens = DEFAULT_MAX_TOKENS;
    }

    if (requestWithOptionals.temperature !== undefined) {
      generationConfig.temperature = requestWithOptionals.temperature;
    }

    if (requestWithOptionals.top_p !== undefined) {
      generationConfig.topP = requestWithOptionals.top_p;
    }

    if (requestWithOptionals.stop !== undefined) {
      generationConfig.stopSequences = Array.isArray(requestWithOptionals.stop)
        ? requestWithOptionals.stop
        : [requestWithOptionals.stop];
    }

    // Handle thinking configuration
    if (requestWithOptionals.thinking_budget !== undefined) {
      generationConfig.thinkingConfig = {
        thinkingBudget: requestWithOptionals.thinking_budget,
      };
    }

    googleRequest.generationConfig = generationConfig;

    return googleRequest;
  }

  private convertResponseFromGoogle(
    response: GoogleResponse,
    originalModel: string,
  ): CompletionResponse {
    const candidate = response.candidates[0];
    
    // Handle missing parts array - Google API sometimes returns content without parts
    let content = "";
    if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
      content = candidate.content.parts.map((part) => part.text).join("") || "";
    } else {
      // Sometimes content might be directly in the content object
      if (candidate?.content && typeof candidate.content === "string") {
        content = candidate.content;
      } else {
        // If we get MAX_TOKENS finish reason with no content, this might be due to
        // the model hitting token limits while generating "thinking" tokens
        if (candidate?.finishReason === "MAX_TOKENS") {
          content = "[Response truncated due to token limit]";
        }
      }
    }

    // Handle tiered pricing for gemini-2.5-pro
    let effectiveModel = originalModel;
    if (originalModel === "gemini-2.5-pro") {
      const totalTokens = response.usageMetadata.totalTokenCount;
      effectiveModel =
        totalTokens > 200000 ? "gemini-2.5-pro-high" : "gemini-2.5-pro-low";
    }

    return {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      model: effectiveModel,
      usage: {
        prompt_tokens: response.usageMetadata.promptTokenCount,
        completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount,
      },
    };
  }

  private isValidGoogleResponse(data: unknown): data is GoogleResponse {
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "candidates" in data &&
      "usageMetadata" in data
    );
  }

  private async requestEndpoint(
    model: string,
    request: CompletionRequest,
  ): Promise<{ status: number; data: CompletionResponse }> {
    const googleRequest = this.convertRequestToGoogle(request);
    const url = `${this.baseUrl}/${model}:generateContent`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.config.apiKey,
      },
      body: JSON.stringify(googleRequest),
    });

    const json = await resp.json();

    if (!resp.ok) {
      return {
        status: resp.status,
        data: {
          error: json,
        },
      };
    }

    if (!this.isValidGoogleResponse(json)) {
      const responsePreview = JSON.stringify(json).slice(0, 500);
      throw new Error(
        `Invalid response structure from Google API: ${responsePreview}`,
      );
    }

    const convertedResponse = this.convertResponseFromGoogle(json, model);

    return {
      status: resp.status,
      data: convertedResponse,
    };
  }

  async chatCompletion(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    return this.requestEndpoint(request.model, request);
  }

  async responses(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }> {
    // Google Gemini uses the same generateContent endpoint for both
    return this.requestEndpoint(request.model, request);
  }
}
