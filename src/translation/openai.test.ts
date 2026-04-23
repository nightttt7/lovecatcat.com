import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiTranslationProvider,
  DEFAULT_OPENAI_TRANSLATION_MODEL,
  OPENAI_CHAT_COMPLETIONS_URL
} from "./openai";

const buildOkResponse = (content: string) => {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

describe("createOpenAiTranslationProvider", () => {
  it("translates title and body via two chat completions and returns provider metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = body.messages[1].content;
      const isTitle = !userContent.includes("\n");
      return buildOkResponse(isTitle ? "中文标题" : "中文正文 with `code`");
    });

    const provider = createOpenAiTranslationProvider({
      apiKey: "sk-test",
      model: "gpt-5.4-mini",
      fetchImpl,
      now: () => new Date("2026-04-23T12:00:00.000Z")
    });

    const result = await provider.translatePost({
      sourceLang: "en",
      targetLang: "zh",
      title: "Hello world",
      body: "Body line one\n\nBody line two"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(OPENAI_CHAT_COMPLETIONS_URL);
    expect(result.provider).toBe("openai:gpt-5.4-mini");
    expect(result.translatedTitle).toBe("中文标题");
    expect(result.translatedBody).toBe("中文正文 with `code`");
    expect(result.translatedAt).toBe("2026-04-23T12:00:00.000Z");
  });

  it("uses the default translation model when no model override is provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => buildOkResponse("translated body"));

    const provider = createOpenAiTranslationProvider({ apiKey: "sk-test", fetchImpl });

    const result = await provider.translatePost({
      sourceLang: "zh",
      targetLang: "en",
      title: null,
      body: "原文"
    });

    expect(result.provider).toBe(`openai:${DEFAULT_OPENAI_TRANSLATION_MODEL}`);
  });

  it("skips the title call when no title is provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => buildOkResponse("translated body"));

    const provider = createOpenAiTranslationProvider({ apiKey: "sk-test", fetchImpl });

    const result = await provider.translatePost({
      sourceLang: "zh",
      targetLang: "en",
      title: null,
      body: "原文"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.translatedTitle).toBeNull();
    expect(result.translatedBody).toBe("translated body");
  });

  it("throws when the OpenAI response is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("rate limited", { status: 429 }));

    const provider = createOpenAiTranslationProvider({ apiKey: "sk-test", fetchImpl });

    await expect(
      provider.translatePost({ sourceLang: "en", targetLang: "zh", title: null, body: "Body" })
    ).rejects.toThrow(/OpenAI request failed with 429/);
  });

  it("throws when the response payload has no translated content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })
    );

    const provider = createOpenAiTranslationProvider({ apiKey: "sk-test", fetchImpl });

    await expect(
      provider.translatePost({ sourceLang: "en", targetLang: "zh", title: null, body: "Body" })
    ).rejects.toThrow(/did not contain translated content/);
  });

  it("requires a non-empty api key", () => {
    expect(() => createOpenAiTranslationProvider({ apiKey: "" })).toThrow(/apiKey/);
  });
});
