import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnvFiles } from "./env";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

const restoreProcessEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv);
};

afterEach(() => {
  restoreProcessEnv();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadLocalEnvFiles", () => {
  it("loads local env files, strips quotes, and preserves existing process env", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lovecatcat-env-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, ".env"),
      [
        "# comment",
        "BASE_VALUE=from-env",
        "QUOTED=\"hello world\"",
        "SINGLE='quoted value'",
        "INVALID_LINE"
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(tempDir, ".env.development"),
      [
        "BASE_VALUE=from-development",
        "DEV_ONLY=local",
        "LOCKED=should-not-overwrite"
      ].join("\n")
    );

    process.env.LOCKED = "existing";

    loadLocalEnvFiles(tempDir);

    expect(process.env.BASE_VALUE).toBe("from-development");
    expect(process.env.DEV_ONLY).toBe("local");
    expect(process.env.QUOTED).toBe("hello world");
    expect(process.env.SINGLE).toBe("quoted value");
    expect(process.env.LOCKED).toBe("existing");
    expect(process.env.INVALID_LINE).toBeUndefined();
  });

  it("does nothing when local env files are missing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lovecatcat-env-empty-"));
    tempDirs.push(tempDir);

    expect(() => loadLocalEnvFiles(tempDir)).not.toThrow();
  });
});