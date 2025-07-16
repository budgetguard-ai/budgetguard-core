export interface CompletionRequest {
  model: string;
  messages?: Array<{ role: string; content: string; name?: string }>;
  prompt?: string;
  input?: string;
  [key: string]: unknown;
}

export interface CompletionResponse {
  choices?: Array<{
    text?: string;
    message?: { content?: string };
  }>;
  model?: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Provider {
  chatCompletion(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }>;

  responses(request: CompletionRequest): Promise<{
    status: number;
    data: CompletionResponse;
  }>;
}
