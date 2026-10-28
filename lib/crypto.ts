import crypto from "crypto";

/**
 * AES-256-GCM encryption for sensitive review content at rest. Ciphertext is
 * stored inside the same column types the app already uses (text stays
 * text, jsonb stays jsonb) — see encryptJson/decryptJson below — so no
 * schema migration is needed, and legacy plaintext rows keep rendering
 * until re-encrypted.
 *
 * ENCRYPTION_KEY is OPTIONAL, deliberately: this is meant to be a pure
 * add-on that never breaks the app if the key isn't set. Without it,
 * encrypt* functions pass values through unchanged (same behavior as
 * before this feature existed) and log a one-time warning. Once a key is
 * set, new writes get encrypted; existing plaintext rows keep reading
 * fine either way.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "v1:";

let cachedKey: Buffer | null = null;
let warnedMissingKey = false;

function getKey(): Buffer | null {
  if (cachedKey) return cachedKey;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (e.g. generate it with `openssl rand -base64 32`).");
  }
  cachedKey = buf;
  return buf;
}

function warnMissingKeyOnce() {
  if (warnedMissingKey) return;
  warnedMissingKey = true;
  console.warn(
    "ENCRYPTION_KEY is not set — review content, peer feedback, and upward reviews are being stored UNENCRYPTED. Set ENCRYPTION_KEY to turn on encryption at rest (see README)."
  );
}

export function encryptText(plain: string): string {
  const key = getKey();
  if (!key) {
    warnMissingKeyOnce();
    return plain;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function isEncryptedText(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function decryptText(payload: string): string {
  if (!isEncryptedText(payload)) return payload;
  const key = getKey();
  if (!key) {
    throw new Error("This data was encrypted with an ENCRYPTION_KEY that's no longer set. Restore the same ENCRYPTION_KEY to read it.");
  }
  const raw = Buffer.from(payload.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

type EncJson = { _enc: string };

function isEncJson(value: unknown): value is EncJson {
  return !!value && typeof value === "object" && typeof (value as any)._enc === "string";
}

/** Wraps a JSON-serializable value for storage in a jsonb column as ciphertext — or passes it through unchanged if ENCRYPTION_KEY isn't set. */
export function encryptJson<T>(value: T): unknown {
  if (!getKey()) {
    warnMissingKeyOnce();
    return value;
  }
  return { _enc: encryptText(JSON.stringify(value)) };
}

/** Unwraps a value read back from a jsonb column — passes legacy plaintext through unchanged. */
export function decryptJson<T>(stored: unknown, fallback: T): T {
  if (stored == null) return fallback;
  if (isEncJson(stored)) return JSON.parse(decryptText(stored._enc)) as T;
  return stored as T;
}
