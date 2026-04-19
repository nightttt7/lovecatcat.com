import { describe, expect, it } from "vitest";
import {
  createLocalDevTranslationProvider,
  LocalDevTranslationFailureError,
  LOCAL_DEV_TRANSLATION_PROVIDER_ID
} from "./provider";

describe("createLocalDevTranslationProvider", () => {
  it("wraps Chinese targets with the DEV mock notice", async () => {
    const provider = createLocalDevTranslationProvider({
      now: () => new Date("2026-04-18T00:00:00.000Z")
    });

    const result = await provider.translatePost({
      sourceLang: "en",
      targetLang: "zh",
      title: "Hello world",
      body: "Original body"
    });

    expect(result.provider).toBe(LOCAL_DEV_TRANSLATION_PROVIDER_ID);
    expect(result.translatedTitle).toBe("[DEV 模拟译文] Hello world");
    expect(result.translatedBody).toBe(
      "(由于当前运行于 DEV 环境，真实翻译未执行，以下为占位译文。)\n\nOriginal body"
    );
    expect(result.translatedAt).toBe("2026-04-18T00:00:00.000Z");
  });

  it("wraps English targets with the DEV mock notice", async () => {
    const provider = createLocalDevTranslationProvider();

    const result = await provider.translatePost({
      sourceLang: "zh",
      targetLang: "en",
      title: "原文标题",
      body: "原文内容"
    });

    expect(result.translatedTitle).toBe("[DEV mock translation] 原文标题");
    expect(result.translatedBody).toContain("原文内容");
  });

  it("keeps the title null when the source title is empty", async () => {
    const provider = createLocalDevTranslationProvider();

    const result = await provider.translatePost({
      sourceLang: "zh",
      targetLang: "en",
      title: null,
      body: "原文内容"
    });

    expect(result.translatedTitle).toBeNull();
  });

  it("throws when the configured failure rate is hit", async () => {
    const provider = createLocalDevTranslationProvider({
      failureRate: 1,
      random: () => 0
    });

    await expect(
      provider.translatePost({
        sourceLang: "zh",
        targetLang: "en",
        title: "原文标题",
        body: "原文内容"
      })
    ).rejects.toBeInstanceOf(LocalDevTranslationFailureError);
  });
});
