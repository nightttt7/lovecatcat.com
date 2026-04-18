import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createSqliteDb } from "./db/sqlite";
import path from "node:path";
import { createLocalTranslationDispatcher } from "./translation/local-runner";
import { createLocalDevTranslationProvider } from "./translation/provider";
import { parseAdminEmails } from "./utils/auth";
import { loadLocalEnvFiles } from "./utils/env";
import { findAvailablePort, parsePort } from "./utils/port";

loadLocalEnvFiles();

const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "dev.db");
const sqliteDb = createSqliteDb({ dbPath, readonly: false });

const parseEnvNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const localTranslationFailureRate = parseEnvNumber(process.env.LOCAL_TRANSLATION_FAILURE_RATE, 0);
const rawMinDelay = parseEnvNumber(process.env.LOCAL_TRANSLATION_MIN_DELAY_MS, 800);
const rawMaxDelay = parseEnvNumber(process.env.LOCAL_TRANSLATION_MAX_DELAY_MS, 2000);
const minLocalTranslationDelayMs = Math.max(0, Math.min(rawMinDelay, rawMaxDelay));
const maxLocalTranslationDelayMs = Math.max(minLocalTranslationDelayMs, rawMaxDelay);

const localTranslationProvider = createLocalDevTranslationProvider({
  failureRate: localTranslationFailureRate
});

const dispatchLocalTranslationJobs = createLocalTranslationDispatcher({
  db: sqliteDb,
  provider: localTranslationProvider,
  schedule: (callback) => {
    const span = maxLocalTranslationDelayMs - minLocalTranslationDelayMs;
    const delay = minLocalTranslationDelayMs + Math.floor(Math.random() * (span + 1));
    const timer = setTimeout(callback, delay);
    timer.unref?.();
  },
  onError: (error, job) => {
    console.warn(
      `[local-translation] post ${job.postId} -> ${job.targetLang} failed:`,
      error instanceof Error ? error.message : error
    );
  }
});

const app = createApp({
  getSite: () => getSiteConfig(),
  getDb: () => sqliteDb,
  getAdminEmails: () => Array.from(parseAdminEmails(process.env.ADMIN_EMAILS)),
  enqueueTranslationJobs: async (_c, jobs) => {
    await dispatchLocalTranslationJobs(jobs);
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
