import type { AIProvider } from "../db/types.js";

export function maskKey(raw: string): string {
  if (raw.length > 8) {
    return `${raw.slice(0, 3)}${"•".repeat(Math.min(raw.length - 7, 20))}${raw.slice(-4)}`;
  }

  return "••••••••";
}

/**
 * Validates an API key by making a lightweight test call to the provider.
 *
 * For OpenAI: GET /v1/models — returns 200 if the key is valid.
 * For Anthropic: POST /v1/messages with minimal payload — a valid key
 */
export async function validateApiKey(
  provider: AIProvider,
  apiKey: string
): Promise<boolean> {
  try {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return response.ok;
    } else if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_tokens: 1,
          model: "claude-3-5-haiku-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      return response.status === 200 || response.status === 400;
    }
    return false;
  } catch {
    return false;
  }
}
