import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../providers/openai.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("OpenAIProvider", () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

  it("handles successful chat completion requests", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1677652288,
      model: "gpt-3.5-turbo",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
      temperature: 0.7,
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(200);
    expect(result.data.choices).toHaveLength(1);
    expect(result.data.choices[0].message?.content).toBe(
      "Hello! How can I help you today?",
    );
    expect(result.data.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 15,
      total_tokens: 25,
    });

    // Verify the request was made with correct OpenAI format
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        }),
        body: JSON.stringify(request),
      }),
    );
  });

  it("handles successful responses endpoint requests", async () => {
    const mockResponse = {
      id: "resp-123",
      object: "response",
      created: 1677652288,
      model: "gpt-3.5-turbo",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Response content",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 10,
        total_tokens: 15,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Test" }],
    };

    const result = await provider.responses(request);

    expect(result.status).toBe(200);
    expect(result.data).toEqual(mockResponse);

    // Verify the request was made to the responses endpoint
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        }),
        body: JSON.stringify(request),
      }),
    );
  });

  it("handles API authentication errors correctly", async () => {
    const errorResponse = {
      error: {
        message: "Incorrect API key provided",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(401);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("handles API rate limit errors correctly", async () => {
    const errorResponse = {
      error: {
        message: "Rate limit reached",
        type: "rate_limit_error",
        param: null,
        code: "rate_limit_exceeded",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(429);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("handles API server errors correctly", async () => {
    const errorResponse = {
      error: {
        message: "The server had an error while processing your request",
        type: "server_error",
        param: null,
        code: "server_error",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(500);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("handles quota exceeded errors correctly", async () => {
    const errorResponse = {
      error: {
        message: "You exceeded your current quota",
        type: "insufficient_quota",
        param: null,
        code: "insufficient_quota",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(403);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("throws error for invalid response structure", async () => {
    const invalidResponse = "not an object";

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(invalidResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    await expect(provider.chatCompletion(request)).rejects.toThrow(
      "Invalid response structure from OpenAI API",
    );
  });

  it("throws error for null response", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    await expect(provider.chatCompletion(request)).rejects.toThrow(
      "Invalid response structure from OpenAI API",
    );
  });

  it("throws error for array response", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    await expect(provider.chatCompletion(request)).rejects.toThrow(
      "Invalid response structure from OpenAI API",
    );
  });

  it("uses custom base URL when provided", async () => {
    const customProvider = new OpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://custom-openai.example.com",
    });

    const mockResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      model: "gpt-3.5-turbo",
      choices: [{ message: { content: "Hello" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    await customProvider.chatCompletion(request);

    expect(fetch).toHaveBeenCalledWith(
      "https://custom-openai.example.com/v1/chat/completions",
      expect.anything(),
    );
  });

  it("includes response preview in error for invalid structure", async () => {
    const invalidResponse = {
      some: "invalid",
      response: "structure",
      with: { nested: "data" },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(invalidResponse),
    });

    const request = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }],
    };

    await expect(provider.chatCompletion(request)).rejects.toThrow(
      `Invalid response structure from OpenAI API: ${JSON.stringify(invalidResponse)}`,
    );
  });
});
