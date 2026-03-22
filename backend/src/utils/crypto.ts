import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";

const IV_LENGTH = 16; // 128-bit IV for GCM
const KEY_LENGTH = 32; // 256-bit key
const ALGORITHM = "aes-256-gcm";

export interface EncryptedPayload {
  iv: string; // hex-encoded IV
  encrypted: string; // hex-encoded ciphertext
  authTag: string; // hex-encoded authentication tag
}

/**
 * Derives a 32-byte key from the ENCRYPTION_SECRET.
 * If the secret is already 64 hex chars (32 bytes), decode it directly.
 */
function deriveKey(secret: string): Buffer {
  // decode if 64 hex chars
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  // pad/truncate to KEY_LENGTH if not
  const buf = Buffer.alloc(KEY_LENGTH, 0);
  Buffer.from(secret, "utf-8").copy(buf, 0, 0, KEY_LENGTH);
  return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @param secret - The encryption secret
 * @returns EncryptedPayload
 */
export function encrypt(plaintext: string, secret: string): EncryptedPayload {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to plaintext.
 *
 * @param payload - The encrypted payload
 * @param secret - The encryption secret
 * @returns The original plaintext string
 * @throws Error if decryption fails
 */
export function decrypt(payload: EncryptedPayload, secret: string): string {
  const key = deriveKey(secret);
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}

/**
 * Returns the raw ENCRYPTION_SECRET value.
 */
export function getEncryptionSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET environment variable is required but not set. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return secret;
}

/**
 * Derives a purpose-specific key from the master ENCRYPTION_SECRET.
 * Uses HMAC-SHA256 as a simple key derivation function with a purpose label.
 * This ensures token signing, API key encryption, and GitHub token encryption
 * use different derived keys.
 */
export function deriveSecretForPurpose(
  purpose: "token_signing" | "api_key_encryption" | "github_token_encryption"
): string {
  const masterSecret = getEncryptionSecret();

  return createHmac("sha256", masterSecret)
    .update(purpose)
    .digest("hex");
}
