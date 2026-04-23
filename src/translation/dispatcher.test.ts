import { describe, expect, it, vi } from "vitest";
import type {
  BlogDb,
  PostDetailRow,
  PostTranslationRow,
  UpsertPostTranslationInput
} from "../db/types";
import { hashPostTranslationSource } from "./content";
import {
  createTranslationDispatcher,
  DEFAULT_TRANSLATION_PROVIDER_ID,
  processTranslationJob
} from "./dispatcher";
import type { TranslationJobMessage, TranslationProvider } from "./types";

type MinimalDbState = {
  upserts: UpsertPostTranslationInput[];
  current: PostTranslationRow | null;
};

const buildMinimalDb = (post: PostDetailRow | null): { db: BlogDb; state: MinimalDbState } => {
  const state: MinimalDbState = { upserts: [], current: null };
  const db = {
    getPostById: async () => post,
    getPostTranslation: async () => state.current,
    upsertPostTranslation: async (input: UpsertPostTranslationInput) => {
      state.upserts.push(input);
      state.current = {
        id: 1,
        post_id: input.postId,
        lang: input.lang,
        translated_title: input.translatedTitle,
        translated_body: input.translatedBody,
        status: input.status,
        source_hash: input.sourceHash,
        provider: input.provider,
        error_message: input.errorMessage ?? null,
        is_machine_translation: input.isMachineTranslation ? 1 : 0,
        is_published: input.isPublished ? 1 : 0,
        translated_at: input.translatedAt
      };
    }
  } as unknown as BlogDb;

  return { db, state };
};

const buildPost = (overrides: Partial<PostDetailRow> = {}): PostDetailRow => ({
  id: 1,
  title: "Original title",
  body: "Original body",
  timestamp: "2026-04-18 00:00:00",
  tag: "news",
  author_id: 1,
  author_name: "admin",
  source_lang: "en",
  is_draft: 0,
  is_private: 0,
  ...overrides
});

const buildJob = (post: PostDetailRow, overrides: Partial<TranslationJobMessage> = {}): TranslationJobMessage => ({
  postId: post.id,
  sourceLang: "en",
  targetLang: "zh",
  sourceHash: hashPostTranslationSource({
    title: post.title ?? null,
    body: post.body ?? "",
    sourceLang: "en"
  }),
  trigger: "create",
  ...overrides
});

const successProvider: TranslationProvider = {
  async translatePost(input) {
    return {
      translatedTitle: input.title ? `[zh] ${input.title}` : null,
      translatedBody: `[zh] ${input.body}`,
      provider: "openai:test-model",
      translatedAt: "2026-04-18T00:00:00.000Z"
    };
  }
};

describe("processTranslationJob", () => {
  it("transitions a job from processing to completed", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);

    const result = await processTranslationJob(buildJob(post), { db, provider: successProvider });

    expect(result).toBe("completed");
    expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "draft"]);
    expect(state.upserts[0].provider).toBe(DEFAULT_TRANSLATION_PROVIDER_ID);
    expect(state.upserts[1].provider).toBe("openai:test-model");
    expect(state.upserts[1].translatedBody).toBe("[zh] Original body");
    expect(state.upserts[1].errorMessage).toBeNull();
  });

  it("records a failed status when the provider throws", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const failingProvider: TranslationProvider = {
      async translatePost() {
        throw new Error("boom");
      }
    };

    const result = await processTranslationJob(buildJob(post), { db, provider: failingProvider });

    expect(result).toBe("failed");
    expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "failed"]);
    expect(state.upserts[1].errorMessage).toBe("boom");
  });

  it("skips processing when the source has changed since the job was scheduled", async () => {
    const post = buildPost({ body: "Updated body" });
    const { db, state } = buildMinimalDb(post);

    const job = buildJob(post, { sourceHash: "stale-hash" });

    const result = await processTranslationJob(job, { db, provider: successProvider });

    expect(result).toBe("skipped");
    expect(state.upserts).toHaveLength(0);
  });

  it("skips processing when the post has been deleted", async () => {
    const { db, state } = buildMinimalDb(null);

    const post = buildPost();
    const result = await processTranslationJob(buildJob(post), { db, provider: successProvider });

    expect(result).toBe("skipped");
    expect(state.upserts).toHaveLength(0);
  });
});

describe("processTranslationJob edge cases", () => {
  it("skips the job when the source or target language is invalid", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const job = buildJob(post, { targetLang: "fr" as never });

    const result = await processTranslationJob(job, { db, provider: successProvider });

    expect(result).toBe("skipped");
    expect(state.upserts).toHaveLength(0);
  });
});

describe("createTranslationDispatcher", () => {
  it("returns immediately and processes jobs through the scheduled callback", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const scheduled: Array<() => void> = [];
    const dispatch = createTranslationDispatcher({
      db,
      provider: successProvider,
      schedule: (callback) => {
        scheduled.push(callback);
      }
    });

    await dispatch([buildJob(post)]);

    expect(scheduled).toHaveLength(1);
    expect(state.upserts).toHaveLength(0);

    scheduled[0]();
    await vi.waitFor(() => {
      expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "draft"]);
    });
  });

  it("falls back to console.warn when no onError handler is provided", async () => {
    const post = buildPost();
    const { db } = buildMinimalDb(post);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const dispatch = createTranslationDispatcher({
      db: {
        ...db,
        getPostById: async () => {
          throw new Error("db is on fire");
        }
      } as BlogDb,
      provider: successProvider,
      schedule: (callback) => {
        callback();
      }
    });

    await dispatch([buildJob(post)]);

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    expect(String(warnSpy.mock.calls[0][0])).toContain("[translation]");
    warnSpy.mockRestore();
  });

  it("defaults to setTimeout-based scheduling when no schedule override is supplied", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const dispatch = createTranslationDispatcher({ db, provider: successProvider });

    await dispatch([buildJob(post)]);

    await vi.waitFor(() => {
      expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "draft"]);
    });
  });

  it("forwards processing errors to onError instead of crashing the dispatcher", async () => {
    const post = buildPost();
    const { db } = buildMinimalDb(post);
    const onError = vi.fn();

    const dispatch = createTranslationDispatcher({
      db: {
        ...db,
        getPostById: async () => {
          throw new Error("db is on fire");
        }
      } as BlogDb,
      provider: successProvider,
      schedule: (callback) => {
        callback();
      },
      onError
    });

    await dispatch([buildJob(post)]);

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    const [error, job] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(job.postId).toBe(post.id);
  });
});
