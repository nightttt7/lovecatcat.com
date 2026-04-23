import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createD1Db } from "./db/d1";
import { processTranslationJob } from "./translation/dispatcher";
import { createOpenAiTranslationProvider, DEFAULT_OPENAI_TRANSLATION_MODEL } from "./translation/openai";
import { parseAdminEmails } from "./utils/auth";

export type Bindings = {
  DB: D1Database;
  ADMIN_EMAILS?: string;
  OPENAI_API_KEY_CAT?: string;
  OPENAI_MODEL_CAT?: string;
};

const app = createApp<Bindings>({
  getSite: () => getSiteConfig(),
  getDb: (c) => createD1Db(c.env.DB),
  getAdminEmails: (c) => Array.from(parseAdminEmails(c.env.ADMIN_EMAILS)),
  getTranslationModel: (c) => c.env.OPENAI_MODEL_CAT?.trim() || DEFAULT_OPENAI_TRANSLATION_MODEL,
  runTranslationJobs: async (c, jobs) => {
    const apiKey = c.env.OPENAI_API_KEY_CAT;

    if (!apiKey) {
      console.warn(
        `[translation] dropping ${jobs.length} job(s) because OPENAI_API_KEY_CAT is not configured for this Worker environment.`
      );
      return;
    }

    const db = createD1Db(c.env.DB);
    const configuredModel = c.env.OPENAI_MODEL_CAT?.trim() || DEFAULT_OPENAI_TRANSLATION_MODEL;
    const provider = createOpenAiTranslationProvider({
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
