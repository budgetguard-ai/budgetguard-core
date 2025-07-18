import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../providers/anthropic.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("AnthropicProvider", () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });

  it("converts OpenAI-style request to Anthropic format", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello! How can I help you today?",
        },
      ],
      model: "claude-3-5-sonnet-latest",
      stop_reason: "end_turn",
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "Hello!" }],
      max_tokens: 100,
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

    // Verify the request was made with correct Anthropic format
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        }),
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 100,
          messages: [{ role: "user", content: "Hello!" }],
          temperature: 0.7,
        }),
      }),
    );
  });

  it("handles system messages correctly", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Response" }],
      model: "claude-3-5-sonnet-latest",
      stop_reason: "end_turn",
      usage: { input_tokens: 20, output_tokens: 5 },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      max_tokens: 100,
    };

    await provider.chatCompletion(request);

    // Verify system message is extracted and sent separately
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 100,
          messages: [{ role: "user", content: "Hello!" }],
          system: "You are a helpful assistant.",
        }),
      }),
    );
  });

  it("handles prompt field for legacy compatibility", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Response" }],
      model: "claude-3-5-sonnet-latest",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      prompt: "What is the weather?",
    };

    await provider.chatCompletion(request);

    // Verify prompt is converted to user message
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          messages: [{ role: "user", content: "What is the weather?" }],
        }),
      }),
    );
  });

  it("handles API errors correctly", async () => {
    const errorResponse = {
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid API key",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(401);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("handles stop sequences parameter", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Response" }],
      model: "claude-3-5-sonnet-latest",
      stop_reason: "stop_sequence",
      stop_sequence: "STOP",
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "Hello!" }],
      stop: ["STOP", "END"],
    };

    await provider.chatCompletion(request);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          messages: [{ role: "user", content: "Hello!" }],
          stop_sequences: ["STOP", "END"],
        }),
      }),
    );
  });

  it("responses method routes to same endpoint", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Response" }],
      model: "claude-3-5-sonnet-latest",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.responses(request);

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.anything(),
    );
  });
});
