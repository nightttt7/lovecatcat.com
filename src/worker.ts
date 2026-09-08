import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createD1Db } from "./db/d1";
import { processTranslationJob } from "./translation/dispatcher";
import { createDeepSeekTranslationProvider } from "./translation/deepseek";
import { parseAdminEmails } from "./utils/auth";

export type Bindings = {
  DB: D1Database;
  ADMIN_EMAILS?: string;
  LCC_DS_API_KEY?: string;
  LCC_DS_MODEL?: string;
};

const app = createApp<Bindings>({
  getSite: () => getSiteConfig(),
  getDb: (c) => createD1Db(c.env.DB),
  getAdminEmails: (c) => Array.from(parseAdminEmails(c.env.ADMIN_EMAILS)),
  getTranslationModel: (c) => c.env.LCC_DS_MODEL?.trim(),
  runTranslationJobs: async (c, jobs) => {
    const apiKey = c.env.LCC_DS_API_KEY;
    const configuredModel = c.env.LCC_DS_MODEL?.trim();

    if (!apiKey || !configuredModel) {
      console.warn(
        `[translation] dropping ${jobs.length} job(s) because LCC_DS_API_KEY or LCC_DS_MODEL is not configured for this Worker environment.`
      );
      return;
    }

    const db = createD1Db(c.env.DB);
    const provider = createDeepSeekTranslationProvider({
      apiKey,
      model: configuredModel
    });

    for (const job of jobs) {
      c.executionCtx.waitUntil(
        processTranslationJob(job, { db, provider }).catch((error) => {
          console.warn(
            `[translation] post ${job.postId} -> ${job.targetLang} failed:`,
            error instanceof Error ? error.message : error
          );
        })
      );
    }
  }
});

export default {
  fetch: app.fetch
} satisfies ExportedHandler<Bindings>;
