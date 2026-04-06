import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createSqliteDb } from "./db/sqlite";
import path from "node:path";
import { parseAdminEmails } from "./utils/auth";
import { loadLocalEnvFiles } from "./utils/env";
import { findAvailablePort, parsePort } from "./utils/port";

loadLocalEnvFiles();

const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "dev.db");
const sqliteDb = createSqliteDb({ dbPath, readonly: false });

const app = createApp({
  getSite: () => getSiteConfig(),
  getDb: () => sqliteDb,
  getAdminEmails: () => Array.from(parseAdminEmails(process.env.ADMIN_EMAILS))
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
