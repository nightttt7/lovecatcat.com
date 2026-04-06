import { describe, expect, it } from "vitest";
import { buildTagValue, coerceStoredTagValue, displayTagValues, isDraftTag, normalizeTagFilterValue, tagInputValue } from "./post-tags";

describe("post tag utilities", () => {
  it("detects draft tags", () => {
    expect(isDraftTag("news,draft")).toBe(true);
    expect(isDraftTag("news updates")).toBe(false);
  });

  it("removes the draft token from editable tag input", () => {
    expect(tagInputValue("news,draft,updates")).toBe("news, updates");
  });

  it("returns display tags without the draft token", () => {
    expect(displayTagValues("news,draft,updates,news")).toEqual(["news", "updates"]);
  });

  it("normalizes filter values and stored tags", () => {
    expect(normalizeTagFilterValue(" Markdown Test ")).toBe("markdown test");
    expect(buildTagValue("Markdown Test", false)).toBe("markdown test");
  });

  it("coerces missing migrated tags to a safe default", () => {
    expect(coerceStoredTagValue(null)).toBe("general");
    expect(coerceStoredTagValue("draft")).toBe("general,draft");
  });

  it("builds stored tag values with optional draft state", () => {
    expect(buildTagValue("news updates", true)).toBe("news updates,draft");
    expect(buildTagValue("news, product updates", false)).toBe("news,product updates");
    expect(buildTagValue("news,draft,updates", false)).toBe("news,updates");
    expect(buildTagValue("", false)).toBeNull();
  });
});