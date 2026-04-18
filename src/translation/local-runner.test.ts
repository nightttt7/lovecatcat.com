import { describe, expect, it, vi } from "vitest";
import type {
  BlogDb,
  PostDetailRow,
  PostTranslationRow,
  UpsertPostTranslationInput
} from "../db/types";
import { hashPostTranslationSource } from "./content";
import {
  createLocalTranslationDispatcher,
  processLocalTranslationJob
} from "./local-runner";
import {
  createLocalDevTranslationProvider,
  LOCAL_DEV_TRANSLATION_PROVIDER_ID
} from "./provider";
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

describe("processLocalTranslationJob", () => {
  it("transitions a job from processing to completed using the local mock provider", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const provider = createLocalDevTranslationProvider({
      now: () => new Date("2026-04-18T00:00:00.000Z")
    });

    const result = await processLocalTranslationJob(buildJob(post), { db, provider });

    expect(result).toBe("completed");
    expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "completed"]);
    expect(state.upserts[1].provider).toBe(LOCAL_DEV_TRANSLATION_PROVIDER_ID);
    expect(state.upserts[1].translatedBody).toContain("Original body");
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

    const result = await processLocalTranslationJob(buildJob(post), { db, provider: failingProvider });

    expect(result).toBe("failed");
    expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "failed"]);
    expect(state.upserts[1].errorMessage).toBe("boom");
  });

  it("skips processing when the source has changed since the job was scheduled", async () => {
    const post = buildPost({ body: "Updated body" });
    const { db, state } = buildMinimalDb(post);
    const provider = createLocalDevTranslationProvider();

    const job = buildJob(post, { sourceHash: "stale-hash" });

    const result = await processLocalTranslationJob(job, { db, provider });

    expect(result).toBe("skipped");
    expect(state.upserts).toHaveLength(0);
  });

  it("skips processing when the post has been deleted", async () => {
    const { db, state } = buildMinimalDb(null);
    const provider = createLocalDevTranslationProvider();

    const post = buildPost();
    const result = await processLocalTranslationJob(buildJob(post), { db, provider });

    expect(result).toBe("skipped");
    expect(state.upserts).toHaveLength(0);
  });
});

describe("createLocalTranslationDispatcher", () => {
  it("returns immediately and processes jobs through the scheduled callback", async () => {
    const post = buildPost();
    const { db, state } = buildMinimalDb(post);
    const provider = createLocalDevTranslationProvider();
    const scheduled: Array<() => void> = [];
    const dispatch = createLocalTranslationDispatcher({
      db,
      provider,
      schedule: (callback) => {
        scheduled.push(callback);
      }
    });

    await dispatch([buildJob(post)]);

    expect(scheduled).toHaveLength(1);
    expect(state.upserts).toHaveLength(0);

    scheduled[0]();
    await vi.waitFor(() => {
      expect(state.upserts.map((entry) => entry.status)).toEqual(["processing", "completed"]);
    });
  });

  it("forwards processing errors to onError instead of crashing the dispatcher", async () => {
    const post = buildPost();
    const { db } = buildMinimalDb(post);
    const provider = createLocalDevTranslationProvider();
    const onError = vi.fn();

    const dispatch = createLocalTranslationDispatcher({
      db: {
        ...db,
        getPostById: async () => {
          throw new Error("db is on fire");
        }
      } as BlogDb,
      provider,
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
