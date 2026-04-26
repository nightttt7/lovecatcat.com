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

    expect(detectPostSourceLanguage(title, body)).toBe("zh");
  });

  it("keeps English posts as en when they contain only a tiny amount of Chinese", () => {
    const title = "Preview deployment checklist";
    const body = `
This English maintenance note validates the preview deployment workflow, checks the admin dashboard,
and reviews SQLite migration output. A small label such as 中文按钮 should not flip the whole article.
`;

    expect(detectPostSourceLanguage(title, body)).toBe("en");
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
    expect(detectPostSourceLanguage(title, normalizedBody)).toBe("zh");
  });

  it("returns null when no language signal exists", () => {
    expect(detectPostSourceLanguage("12345", "--- ***")).toBeNull();
  });

  it("returns null when the language signal stays ambiguous", () => {
    const title = "Preview 中";
    const body = "This draft is mostly English for deployment review and adds 少量 hints only.";

    expect(detectPostSourceLanguage(title, body)).toBeNull();
  });

  it("prefers zh when the title carries multiple Han characters even with mostly English body", () => {
    const title = "中文标题";
    const body = "This English body is much longer than the title and contains many words.";

    expect(detectPostSourceLanguage(title, body)).toBe("zh");
  });

  it("returns zh when the body carries a strong han signal share above the upper threshold", () => {
    const title = "Title";
    const body = `${"中".repeat(20)} ${"a".repeat(400)}`;

    expect(detectPostSourceLanguage(title, body)).toBe("zh");
  });

  it("returns zh when han share crosses the mid-range zh threshold without crossing the upper one", () => {
    const title = "Title";
    const body = `${"中".repeat(10)} ${"a".repeat(80)}`;

    expect(detectPostSourceLanguage(title, body)).toBe("zh");
  });

  it("returns null when han share lands inside the ambiguous middle band", () => {
    const title = "Title";
    const body = `${"中".repeat(8)} ${"a".repeat(180)}`;

    expect(detectPostSourceLanguage(title, body)).toBeNull();
  });
});

describe("normalizeSelectedSourceLanguage", () => {
  it("uses the selected language when it is valid", () => {
    expect(normalizeSelectedSourceLanguage("en", "zh", "zh")).toBe("en");
  });

  it("falls back to detected language when the value is invalid", () => {
    expect(normalizeSelectedSourceLanguage("fr", "zh", "en")).toBe("zh");
  });

  it("falls back to the provided fallback language when detection is unclear", () => {
    expect(normalizeSelectedSourceLanguage(undefined, null, "en")).toBe("en");
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