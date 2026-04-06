import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  isWerkzeugPasswordHash,
  normalizeEmail,
  parseAdminEmails,
  verifyPassword
} from "./auth";

describe("auth utilities", () => {
  it("normalizes and parses admin emails", () => {
    expect(normalizeEmail("  Admin@example.com ")).toBe("admin@example.com");

    const emails = parseAdminEmails("Admin@example.com, second@example.com\nTHIRD@example.com");

    expect(Array.from(emails)).toEqual([
      "admin@example.com",
      "second@example.com",
      "third@example.com"
    ]);

    expect(Array.from(parseAdminEmails(" Admin@example.com ; admin@example.com ;  "))).toEqual([
      "admin@example.com"
    ]);
  });

  it("hashes and verifies passwords", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(isWerkzeugPasswordHash(passwordHash)).toBe(true);
    expect(passwordHash.startsWith("pbkdf2:sha256:4000$")).toBe(true);

    await expect(verifyPassword("correct horse battery staple", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", passwordHash)).resolves.toBe(false);
  });

  it("rejects invalid stored password hashes", async () => {
    await expect(verifyPassword("password", null)).resolves.toBe(false);
    await expect(verifyPassword("password", undefined)).resolves.toBe(false);
    await expect(verifyPassword("password", "sha256$salt$hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2:sha256:not-a-number$salt$hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2:sha256:0$salt$hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2:sha256:260000$salt")).resolves.toBe(false);
  });

  it("creates and hashes session tokens", async () => {
    const sessionToken = createSessionToken();
    const hashedToken = await hashSessionToken(sessionToken);

    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(hashedToken).toMatch(/^[0-9a-f]{64}$/);
    await expect(hashSessionToken(sessionToken)).resolves.toBe(hashedToken);
  });
});