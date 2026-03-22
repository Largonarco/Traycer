import type { AIProvider } from "../db/types.js";

export function maskKey(raw: string): string {
  if (raw.length > 8) {
    return `${raw.slice(0, 3)}${"•".repeat(Math.min(raw.length - 7, 20))}${raw.slice(-4)}`;
  }

  return "••••••••";
}

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
          model: "claude-3-haiku-20240307",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      return response.status !== 401 && response.status !== 403;
    }
    return false;
  } catch {
    return false;
  }
}
