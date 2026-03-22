import { Router } from "express";
import { updateLLMKey } from "../db/index.js";
import type { AIProvider } from "../db/types.js";
import { decryptSettings } from "../utils/decrypt.js";
import { maskKey, validateApiKey } from "../utils/apikey.js";
import { encrypt, deriveSecretForPurpose } from "../utils/crypto.js";

const router = Router();

/**
 * GET /api/settings
 *
 * Returns the authenticated user's provider and masked key. Never exposes the raw API key.
 */
router.get("/", async (req, res) => {
  try {
    const result = await decryptSettings(req.user!.id);
    if ("error" in result) {
      res.json({
        provider: null,
        maskedKey: null,
        githubConnected: false,
      });
      return;
    }

    res.json({
      provider: result.provider,
      maskedKey: maskKey(result.apiKey),
      githubConnected: result.githubToken !== null,
    });
  } catch (err) {
    console.error("[settings] GET error:", err);
    res.status(500).json({ error: "Failed to read settings" });
  }
});

/**
 * PUT /api/settings
 * Accepts { provider, apiKey }.
 *
 * Validates the key against the provider with a lightweight test call.
 * Encrypts the key and stores it.
 * Returns 400 with "API key could not be verified" on validation failure.
 */
router.put("/", async (req, res) => {
  try {
    const { provider, apiKey } = req.body as {
      apiKey?: string;
      provider?: string;
    };

    if (!provider || !apiKey) {
      res.status(400).json({ error: "provider and apiKey are required" });
      return;
    }
    if (provider !== "openai" && provider !== "anthropic") {
      res.status(400).json({ error: "provider must be 'openai' or 'anthropic'" });
      return;
    }

    // Validate API Key
    const valid = await validateApiKey(provider as AIProvider, apiKey);
    if (!valid) {
      res.status(400).json({ error: "API key could not be verified" });
      return;
    }

    // Encrypt API Key
    const secret = deriveSecretForPurpose("api_key_encryption");
    const { encrypted, iv, authTag } = encrypt(apiKey, secret);

    // Update API Key
    const settings = await updateLLMKey(req.user!.id, {
      iv,
      provider,
      auth_tag: authTag,
      encrypted_api_key: encrypted,
    });

    res.json({
      maskedKey: maskKey(apiKey),
      provider: settings.provider,
    });
  } catch (err) {
    console.error("[settings] PUT error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
