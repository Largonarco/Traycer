import type { User } from "../db/types.js";
import { deriveSecretForPurpose } from "./crypto.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Returns the secret used for signing/verifying tokens.
 * Reads TOKEN_SECRET env var with fallback to a purpose-derived key
 * from ENCRYPTION_SECRET via HMAC-SHA256.
 */
export function getTokenSecret(): string {
  return process.env.TOKEN_SECRET || deriveSecretForPurpose("token_signing");
}

/**
 * Creates a short-lived access token (15 minutes).
 */
export function createSessionToken(userId: string): string {
  const payload = {
    sub: userId,
    type: "access",
    exp: Date.now() + ACCESS_TOKEN_EXPIRY_MS,
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getTokenSecret())
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Creates a long-lived refresh token (90 days).
 */
export function createRefreshToken(userId: string): string {
  const payload = {
    sub: userId,
    type: "refresh",
    exp: Date.now() + REFRESH_TOKEN_EXPIRY_MS,
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getTokenSecret())
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Verifies a session or refresh token and returns its payload.
 * Returns null if the token is invalid, expired, or tampered with.
 */
export function verifySessionToken(
  token: string
): { sub: string; exp: number; type: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const expectedSig = createHmac("sha256", getTokenSecret())
    .update(payloadStr)
    .digest("base64url");

  // Constant Time Comparison
  if (signature.length !== expectedSig.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig)))
    return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString()
    );

    if (!payload.sub || !payload.exp) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now())
      return null;

    return {
      sub: payload.sub,
      exp: payload.exp,
      type: payload.type || "access",
    };
  } catch {
    return null;
  }
}
