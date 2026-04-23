import type { BlogDb } from "../db/types";
import { isLang } from "../utils/i18n";
import { hashPostTranslationSource } from "./content";
import { OPENAI_TRANSLATION_PROVIDER_ID_PREFIX } from "./openai";
import type { TranslationJobMessage, TranslationProvider } from "./types";

export const DEFAULT_TRANSLATION_PROVIDER_ID = `${OPENAI_TRANSLATION_PROVIDER_ID_PREFIX}unknown`;

export const processTranslationJob = async (
  job: TranslationJobMessage,
  { db, provider }: { db: BlogDb; provider: TranslationProvider }
): Promise<"completed" | "failed" | "skipped"> => {
  if (!isLang(job.sourceLang) || !isLang(job.targetLang)) {
    return "skipped";
  }

  const post = await db.getPostById(job.postId, {
    includeDrafts: true,
    viewerId: null
  });

  if (!post?.body) {
    return "skipped";
  }

  const currentSourceHash = hashPostTranslationSource({
    title: post.title ?? null,
    body: post.body,
    sourceLang: job.sourceLang
  });

  if (currentSourceHash !== job.sourceHash) {
    return "skipped";
  }

  const existingTranslation = await db.getPostTranslation(job.postId, job.targetLang);

  await db.upsertPostTranslation({
    postId: job.postId,
    lang: job.targetLang,
    translatedTitle: existingTranslation?.translated_title ?? null,
    translatedBody: existingTranslation?.translated_body ?? null,
    status: "processing",
    sourceHash: job.sourceHash,
    provider: existingTranslation?.provider ?? DEFAULT_TRANSLATION_PROVIDER_ID,
    errorMessage: null,
    isMachineTranslation: true,
    isPublished: existingTranslation?.is_published === 1,
    translatedAt: existingTranslation?.translated_at ?? null
  });

  try {
    const translatedPost = await provider.translatePost({
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
      isPublished: existingTranslation?.is_published === 1,
      translatedAt: translatedPost.translatedAt
    });

    return "completed";
  } catch (error) {
    await db.upsertPostTranslation({
      postId: job.postId,
      lang: job.targetLang,
      translatedTitle: existingTranslation?.translated_title ?? null,
      translatedBody: existingTranslation?.translated_body ?? null,
      status: "failed",
      sourceHash: job.sourceHash,
      provider: existingTranslation?.provider ?? DEFAULT_TRANSLATION_PROVIDER_ID,
      errorMessage: error instanceof Error ? error.message : "Unknown translation error",
      isMachineTranslation: true,
      isPublished: existingTranslation?.is_published === 1,
      translatedAt: existingTranslation?.translated_at ?? null
    });

    return "failed";
  }
};

export type TranslationDispatcherOptions = {
  db: BlogDb;
  provider: TranslationProvider;
  schedule?: (callback: () => void) => void;
  onError?: (error: unknown, job: TranslationJobMessage) => void;
};

export const createTranslationDispatcher = (options: TranslationDispatcherOptions) => {
  const { db, provider, schedule = (callback) => { setTimeout(callback, 0); }, onError } = options;

  return async (jobs: TranslationJobMessage[]) => {
    for (const job of jobs) {
      schedule(() => {
        void processTranslationJob(job, { db, provider }).catch((error) => {
          if (onError) {
            onError(error, job);
            return;
          }
          console.warn(`[translation] job for post ${job.postId} -> ${job.targetLang} failed`, error);
        });
      });
    }
  };
};
