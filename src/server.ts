import { serve } from "@hono/node-server";
import path from "node:path";
import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createSqliteDb } from "./db/sqlite";
import { createTranslationDispatcher } from "./translation/dispatcher";
import { createDeepSeekTranslationProvider } from "./translation/deepseek";
import { parseAdminEmails } from "./utils/auth";
import { loadLocalEnvFiles } from "./utils/env";
import { findAvailablePort, parsePort } from "./utils/port";

loadLocalEnvFiles();

const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "dev.db");
const sqliteDb = createSqliteDb({ dbPath, readonly: false });

const deepSeekApiKey = process.env.LCC_DS_API_KEY ?? "";
const deepSeekModel = process.env.LCC_DS_MODEL?.trim();

const dispatchTranslationJobs = deepSeekApiKey && deepSeekModel
  ? createTranslationDispatcher({
      db: sqliteDb,
      provider: createDeepSeekTranslationProvider({
        apiKey: deepSeekApiKey,
        model: deepSeekModel
      }),
      onError: (error, job) => {
        console.warn(
          `[translation] post ${job.postId} -> ${job.targetLang} failed:`,
          error instanceof Error ? error.message : error
        );
      }
    })
  : null;

if (!dispatchTranslationJobs) {
  console.warn(
    "[translation] LCC_DS_API_KEY and LCC_DS_MODEL are required. Translation generation will fail until both are configured."
  );
}

const app = createApp({
  getSite: () => getSiteConfig(),
  getDb: () => sqliteDb,
  getAdminEmails: () => Array.from(parseAdminEmails(process.env.ADMIN_EMAILS)),
  getTranslationModel: () => deepSeekModel,
  runTranslationJobs: async (_c, jobs) => {
    if (!dispatchTranslationJobs) {
      console.warn(
        `[translation] dropping ${jobs.length} job(s) because LCC_DS_API_KEY or LCC_DS_MODEL is not configured.`
      );
      return;
    }
    await dispatchTranslationJobs(jobs);
  }
});

const requestedPort = parsePort(process.env.PORT);
const port = await findAvailablePort(requestedPort);

serve({
  fetch: app.fetch,
  port
});

if (port !== requestedPort) {
  console.warn(`Port ${requestedPort} is in use. Falling back to http://localhost:${port}`);
}

console.log(`🚀 Dev server running at http://localhost:${port}`);
