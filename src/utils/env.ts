import fs from "node:fs";
import path from "node:path";

const stripQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

export const loadLocalEnvFiles = (cwd = process.cwd()) => {
  const candidates = [".env", ".env.development"];
  const lockedKeys = new Set(Object.keys(process.env));

  for (const name of candidates) {
    const filePath = path.resolve(cwd, name);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = stripQuotes(line.slice(separatorIndex + 1).trim());

      if (!key || lockedKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
    }
  }
};