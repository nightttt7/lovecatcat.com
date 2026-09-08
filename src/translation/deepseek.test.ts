import { describe, expect, it, vi } from "vitest";
import {
  createDeepSeekTranslationProvider,
  DEEPSEEK_CHAT_COMPLETIONS_URL
} from "./deepseek";

const buildOkResponse = (content: string) => {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

describe("createDeepSeekTranslationProvider", () => {
  it("translates title and body via two chat completions and returns provider metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        temperature?: number;
        thinking?: { type: string };
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.temperature).toBeUndefined();
      expect(body.thinking).toEqual({ type: "disabled" });
      const userContent = body.messages[1].content;
      const isTitle = !userContent.includes("\n");
      return buildOkResponse(isTitle ? "中文标题" : "中文正文 with `code`");
    });

    const provider = createDeepSeekTranslationProvider({
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
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
    expect(fetchImpl.mock.calls[0][0]).toBe(DEEPSEEK_CHAT_COMPLETIONS_URL);
    expect(result.provider).toBe("deepseek:deepseek-v4-flash");
    expect(result.translatedTitle).toBe("中文标题");
    expect(result.translatedBody).toBe("中文正文 with `code`");
    expect(result.translatedAt).toBe("2026-04-23T12:00:00.000Z");
  });

  it("requires a model", () => {
    expect(() => createDeepSeekTranslationProvider({ apiKey: "sk-test" })).toThrow(/model/);
    expect(() => createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "   " })).toThrow(/model/);
  });

  it("trims the model override", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as { model?: string };
      return buildOkResponse(body.model ?? "missing model");
    });

    const provider = createDeepSeekTranslationProvider({
      apiKey: "sk-test",
      model: "  deepseek-v4-pro  ",
      fetchImpl
    });

    const result = await provider.translatePost({
      sourceLang: "en",
      targetLang: "zh",
      title: null,
      body: "Body"
    });

    expect(result.provider).toBe("deepseek:deepseek-v4-pro");
    expect(result.translatedBody).toBe("deepseek-v4-pro");
  });

  it("skips the title call when no title is provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => buildOkResponse("translated body"));

    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

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

  it("throws when the DeepSeek response is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("rate limited", { status: 429 }));

    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translatePost({ sourceLang: "en", targetLang: "zh", title: null, body: "Body" })
    ).rejects.toThrow(/DeepSeek request failed with 429/);
  });

  it("throws when the response payload has no translated content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })
    );

    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translatePost({ sourceLang: "en", targetLang: "zh", title: null, body: "Body" })
    ).rejects.toThrow(/did not contain translated content/);
  });

  it("requires a non-empty api key", () => {
    expect(() => createDeepSeekTranslationProvider({ apiKey: "" })).toThrow(/apiKey/);
  });

  it("falls back to the system clock when no now override is provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => buildOkResponse("translated body"));
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });
    const before = Date.now();

    const result = await provider.translatePost({
      sourceLang: "en",
      targetLang: "zh",
      title: null,
      body: "Body"
    });

    const translatedAtMs = Date.parse(result.translatedAt);
    expect(Number.isNaN(translatedAtMs)).toBe(false);
    expect(translatedAtMs).toBeGreaterThanOrEqual(before);
    expect(translatedAtMs).toBeLessThanOrEqual(Date.now());
  });
});
