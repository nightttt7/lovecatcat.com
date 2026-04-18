import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createD1Db } from "./db/d1";
import { hashPostTranslationSource } from "./translation/content";
import { createWorkersAiTranslationProvider } from "./translation/provider";
import type { TranslationJobMessage } from "./translation/types";
import { parseAdminEmails } from "./utils/auth";
import { isLang } from "./utils/i18n";

export type Bindings = {
  DB: D1Database;
  AI: Ai;
  TRANSLATION_QUEUE: Queue<TranslationJobMessage>;
  ADMIN_EMAILS?: string;
};

type TranslationSourcePostRow = {
  id: number;
  title: string | null;
  body: string | null;
  source_lang: string | null;
};

const app = createApp<Bindings>({
  getSite: () => getSiteConfig(),
  getDb: (c) => createD1Db(c.env.DB),
  getAdminEmails: (c) => Array.from(parseAdminEmails(c.env.ADMIN_EMAILS)),
  enqueueTranslationJobs: async (c, jobs) => {
    if (jobs.length === 1) {
      await c.env.TRANSLATION_QUEUE.send(jobs[0]);
      return;
    }

    await c.env.TRANSLATION_QUEUE.sendBatch(jobs.map((job) => ({ body: job })));
  }
});

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    const db = createD1Db(env.DB);
    await db.ensureSchema();
    const translationProvider = createWorkersAiTranslationProvider(env.AI);

    for (const message of batch.messages) {
      const job = message.body as TranslationJobMessage;
      const post = await env.DB
        .prepare("SELECT id, title, body, source_lang FROM posts WHERE id = ? LIMIT 1")
        .bind(job.postId)
        .first<TranslationSourcePostRow>();

      if (!post || !post.body || !isLang(job.sourceLang) || !isLang(job.targetLang)) {
        continue;
      }

      const currentSourceHash = hashPostTranslationSource({
        title: post.title ?? null,
        body: post.body,
        sourceLang: job.sourceLang
      });

      if (currentSourceHash !== job.sourceHash) {
        continue;
      }

      const existingTranslation = await db.getPostTranslation(job.postId, job.targetLang);

      try {
        await db.upsertPostTranslation({
          postId: job.postId,
          lang: job.targetLang,
          translatedTitle: existingTranslation?.translated_title ?? null,
          translatedBody: existingTranslation?.translated_body ?? null,
          status: "processing",
          sourceHash: job.sourceHash,
          provider: existingTranslation?.provider ?? "workers-ai:@cf/meta/m2m100-1.2b",
          errorMessage: null,
          isMachineTranslation: true,
          translatedAt: existingTranslation?.translated_at ?? null
        });

        const translatedPost = await translationProvider.translatePost({
          sourceLang: job.sourceLang,
          targetLang: job.targetLang,
          title: post.title ?? null,
          body: post.body
        });

        await db.upsertPostTranslation({
          postId: job.postId,
          lang: job.targetLang,
          translatedTitle: translatedPost.translatedTitle,
          translatedBody: translatedPost.translatedBody,
          status: "completed",
          sourceHash: job.sourceHash,
          provider: translatedPost.provider,
          errorMessage: null,
          isMachineTranslation: true,
          translatedAt: translatedPost.translatedAt
        });
      } catch (error) {
        await db.upsertPostTranslation({
          postId: job.postId,
          lang: job.targetLang,
          translatedTitle: existingTranslation?.translated_title ?? null,
          translatedBody: existingTranslation?.translated_body ?? null,
          status: "failed",
          sourceHash: job.sourceHash,
          provider: existingTranslation?.provider ?? "workers-ai:@cf/meta/m2m100-1.2b",
          errorMessage: error instanceof Error ? error.message : "Unknown translation error",
          isMachineTranslation: true,
          translatedAt: existingTranslation?.translated_at ?? null
        });
        throw error;
      }
    }
  }
} satisfies ExportedHandler<Bindings>;
