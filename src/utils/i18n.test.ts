import { describe, expect, it } from "vitest";
import { t, translations, type Lang } from "./i18n";

describe("i18n utilities", () => {
  it("returns the requested translation for supported languages", () => {
    expect(t("latestPosts", "zh")).toBe("最新博文");
    expect(t("latestPosts", "en")).toBe("Latest posts");
  });

  it("falls back to Chinese when the language code is unsupported", () => {
    expect(t("latestPosts", "fr" as Lang)).toBe("最新博文");
  });

  it("keeps the translation key sets aligned across locales", () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.zh).sort());
  });
});