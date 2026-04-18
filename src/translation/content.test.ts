import { describe, expect, it } from "vitest";
import { detectPostSourceLanguage, getTranslationTargetLanguages, normalizeSelectedSourceLanguage } from "./content";

describe("detectPostSourceLanguage", () => {
  it("keeps mixed technical Chinese posts as zh", () => {
    const title = "Hono 路由与 Middleware 记录";
    const body = `
## Overview

这是一篇中文技术文章，但里面会出现 Hono、Middleware、TypeScript、Cloudflare Workers、SQLite 和 Markdown 这些英文术语。

部署时我还会检查 preview workflow、admin login、pagination layout 和 comment form 的表现。
`;

    expect(detectPostSourceLanguage(title, body, "en")).toBe("zh");
  });

  it("keeps English posts as en when they contain only a tiny amount of Chinese", () => {
    const title = "Preview deployment checklist";
    const body = `
This English maintenance note validates the preview deployment workflow, checks the admin dashboard,
and reviews SQLite migration output. A small label such as 中文按钮 should not flip the whole article.
`;

    expect(detectPostSourceLanguage(title, body, "zh")).toBe("en");
  });

  it("ignores markdown code and urls when detecting language", () => {
    const title = "更新 post_translations 状态";
    const body = `
这里主要说明中文流程。

0ts
const url = "https://example.com/docs/preview";
const driver = "better-sqlite3";
0

请参考 [Remote Preview Guide](https://example.com/docs/remote-preview) 获取更多信息。
`;

    const normalizedBody = body.replace(/\u0006/g, "`");
    expect(detectPostSourceLanguage(title, normalizedBody, "en")).toBe("zh");
  });

  it("falls back when no language signal exists", () => {
    expect(detectPostSourceLanguage("12345", "--- ***", "en")).toBe("en");
  });
});

describe("normalizeSelectedSourceLanguage", () => {
  it("uses the selected language when it is valid", () => {
    expect(normalizeSelectedSourceLanguage("en", "zh")).toBe("en");
  });

  it("falls back to detected language when the value is invalid", () => {
    expect(normalizeSelectedSourceLanguage("fr", "zh")).toBe("zh");
  });
});

describe("getTranslationTargetLanguages", () => {
  it("returns the opposite language for zh source posts", () => {
    expect(getTranslationTargetLanguages("zh")).toEqual(["en"]);
  });

  it("returns the opposite language for en source posts", () => {
    expect(getTranslationTargetLanguages("en")).toEqual(["zh"]);
  });
});