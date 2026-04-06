import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const PBKDF2_PREFIX = "pbkdf2:sha256";
const PBKDF2_ITERATIONS = 4000;
const SESSION_TOKEN_BYTES = 32;

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const fromHex = (value: string) => {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
};

const derivePasswordHash = async (password: string, salt: string, iterations: number) => {
  const derivedBytes = pbkdf2(sha256, password, salt, {
    c: iterations,
    dkLen: 32
  });

  return toHex(derivedBytes);
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const parseAdminEmails = (value?: string) => {
  return new Set(
    (value ?? "")
      .split(/[;,\n]/)
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
};

export const isWerkzeugPasswordHash = (value: string) => value.startsWith(`${PBKDF2_PREFIX}:`);

export const hashPassword = async (password: string) => {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}$${salt}$${hash}`;
};

export const verifyPassword = async (password: string, storedHash: string | null | undefined) => {
  if (!storedHash || !isWerkzeugPasswordHash(storedHash)) {
    return false;
  }

  const [method, salt, expectedHash] = storedHash.split("$");

  if (!method || !salt || !expectedHash) {
    return false;
  }

  const parts = method.split(":");
  const iterations = Number(parts[2]);

  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const actualHash = await derivePasswordHash(password, salt, iterations);
  return constantTimeEqual(fromHex(actualHash), fromHex(expectedHash));
};

export const createSessionToken = () => toHex(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)));

export const hashSessionToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
};