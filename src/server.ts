import { serve } from "@hono/node-server";
import path from "node:path";
import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createSqliteDb } from "./db/sqlite";
import { createTranslationDispatcher } from "./translation/dispatcher";
import { createOpenAiTranslationProvider, DEFAULT_OPENAI_TRANSLATION_MODEL } from "./translation/openai";
import { parseAdminEmails } from "./utils/auth";
import { loadLocalEnvFiles } from "./utils/env";
import { findAvailablePort, parsePort } from "./utils/port";

loadLocalEnvFiles();

const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "dev.db");
const sqliteDb = createSqliteDb({ dbPath, readonly: false });

const openAiApiKey = process.env.OPENAI_API_KEY_CAT ?? "";
const openAiModel = process.env.OPENAI_MODEL_CAT?.trim();

const dispatchTranslationJobs = openAiApiKey
  ? createTranslationDispatcher({
      db: sqliteDb,
      provider: createOpenAiTranslationProvider({
        apiKey: openAiApiKey,
        model: openAiModel
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
    "[translation] OPENAI_API_KEY_CAT is not set. Translation generation will fail until the key is configured."
  );
}

const app = createApp({
  getSite: () => getSiteConfig(),
  getDb: () => sqliteDb,
  getAdminEmails: () => Array.from(parseAdminEmails(process.env.ADMIN_EMAILS)),
  getTranslationModel: () => openAiModel?.trim() || DEFAULT_OPENAI_TRANSLATION_MODEL,
  runTranslationJobs: async (_c, jobs) => {
    if (!dispatchTranslationJobs) {
      console.warn(
        `[translation] dropping ${jobs.length} job(s) because OPENAI_API_KEY_CAT is not configured.`
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
