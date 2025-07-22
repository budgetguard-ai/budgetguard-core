import { describe, it, expect, vi } from "vitest";
import { GoogleProvider } from "../providers/google.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("GoogleProvider", () => {
  const provider = new GoogleProvider({ apiKey: "test-key" });

  it("converts OpenAI-style request to Google format", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Hello! How can I help you today?",
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 15,
        totalTokenCount: 25,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
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

    // Verify the request was made with correct Google format
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-goog-api-key": "test-key",
        }),
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Hello!" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.7,
          },
        }),
      }),
    );
  });

  it("handles system messages correctly", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 5,
        totalTokenCount: 25,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      max_tokens: 100,
    };

    await provider.chatCompletion(request);

    // Verify system message is extracted and sent separately
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      expect.objectContaining({
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Hello!" }],
            },
          ],
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant." }],
          },
          generationConfig: {
            maxOutputTokens: 100,
          },
        }),
      }),
    );
  });

  it("handles prompt field for legacy compatibility", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
      prompt: "What is the weather?",
    };

    await provider.chatCompletion(request);

    // Verify prompt is converted to user message
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      expect.objectContaining({
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "What is the weather?" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
          },
        }),
      }),
    );
  });

  it("handles API errors correctly", async () => {
    const errorResponse = {
      error: {
        code: 401,
        message: "API key not valid",
        status: "UNAUTHENTICATED",
      },
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve(errorResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(401);
    expect(result.data.error).toEqual(errorResponse);
  });

  it("handles stop sequences parameter", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hello!" }],
      stop: ["STOP", "END"],
    };

    await provider.chatCompletion(request);

    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      expect.objectContaining({
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Hello!" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            stopSequences: ["STOP", "END"],
          },
        }),
      }),
    );
  });

  it("handles tiered pricing for gemini-2.5-pro with low token count", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 100000,
        candidatesTokenCount: 50000,
        totalTokenCount: 150000, // Under 200k threshold
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(200);
    expect(result.data.model).toBe("gemini-2.5-pro-low");
  });

  it("handles tiered pricing for gemini-2.5-pro with high token count", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 180000,
        candidatesTokenCount: 50000,
        totalTokenCount: 230000, // Over 200k threshold
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.chatCompletion(request);

    expect(result.status).toBe(200);
    expect(result.data.model).toBe("gemini-2.5-pro-high");
  });

  it("responses method routes to same endpoint", async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const request = {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hello!" }],
    };

    const result = await provider.responses(request);

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      expect.anything(),
    );
  });
});
