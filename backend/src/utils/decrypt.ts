import { getSettings } from "../db/index.js";
import { decrypt, deriveSecretForPurpose } from "./crypto.js";

interface DecryptedSettings {
  apiKey: string;
  githubToken: string | null;
  provider: "openai" | "anthropic";
}

export async function decryptGitHubToken(userId: string): Promise<string | null> {
  const settings = await getSettings(userId);
  if (!settings.encrypted_github_token || !settings.github_iv || !settings.github_auth_tag) {
    return null;
  }

  try {
    const githubSecret = deriveSecretForPurpose("github_token_encryption");
    return decrypt(
      {
        iv: settings.github_iv,
        authTag: settings.github_auth_tag,
        encrypted: settings.encrypted_github_token,
      },
      githubSecret
    );
  } catch (err) {
    console.error("[github] Failed to decrypt GitHub token:", err);
    return null;
  }
}

export async function decryptSettings(userId: string): Promise<DecryptedSettings | { error: string }> {
  try {
    const settings = await getSettings(userId);

    if (!settings.provider) {
      return { error: "No AI provider configured. Please set up your API key in Settings." };
    }
    if (!settings.encrypted_api_key || !settings.iv || !settings.auth_tag) {
      return { error: "No API key configured. Please set up your API key in Settings." };
    }

    let apiKey: string;
    try {
      const apiKeySecret = deriveSecretForPurpose("api_key_encryption");
      apiKey = decrypt(
        {
          iv: settings.iv,
          authTag: settings.auth_tag,
          encrypted: settings.encrypted_api_key,
        },
        apiKeySecret
      );
    } catch {
      return { error: "API key could not be decrypted. Please re-enter your API key in Settings." };
    }

    let githubToken: string | null = null;
    if (
      settings.encrypted_github_token &&
      settings.github_iv &&
      settings.github_auth_tag
    ) {
      try {
        const githubSecret = deriveSecretForPurpose("github_token_encryption");
        githubToken = decrypt(
          {
            iv: settings.github_iv,
            authTag: settings.github_auth_tag,
            encrypted: settings.encrypted_github_token,
          },
          githubSecret
        );
      } catch {
        // GitHub token is optional
        githubToken = null;
      }
    }

    return {
      apiKey,
      githubToken,
      provider: settings.provider as "openai" | "anthropic",
    };
  } catch (err) {
    return { error: "Failed to read settings." };
  }
}
