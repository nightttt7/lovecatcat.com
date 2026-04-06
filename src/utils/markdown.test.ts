import { describe, expect, it } from "vitest";
import { normalizeStoredMarkdown, renderMarkdown } from "./markdown";

describe("normalizeStoredMarkdown", () => {
  it("returns empty string for null", () => {
    expect(normalizeStoredMarkdown(null)).toBe("");
  });

  it("normalizes literal \\r\\n sequences", () => {
    expect(normalizeStoredMarkdown("line1\\r\\nline2")).toBe("line1\nline2");
  });

  it("normalizes literal \\n sequences when the content has no real newlines", () => {
    expect(normalizeStoredMarkdown("line1\\nline2")).toBe("line1\nline2");
  });

  it("keeps literal \\n examples when the content already has real newlines", () => {
    expect(normalizeStoredMarkdown("real line\ninline \\n example")).toBe("real line\ninline \\n example");
  });
});

describe("renderMarkdown", () => {
  it("returns empty string for null", () => {
    expect(renderMarkdown(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders basic markdown to HTML", () => {
    const result = renderMarkdown("# Hello World");
    expect(result).toContain("<h1");
    expect(result).toContain("Hello World");
  });

  it("renders bold text", () => {
    const result = renderMarkdown("**bold text**");
    expect(result).toContain("<strong");
    expect(result).toContain("bold text");
  });

  it("renders italic text", () => {
    const result = renderMarkdown("*italic text*");
    expect(result).toContain("<em");
    expect(result).toContain("italic text");
  });

  it("renders links", () => {
    const result = renderMarkdown("[link](https://example.com)");
    expect(result).toContain("<a");
    expect(result).toContain("https://example.com");
    expect(result).toContain("link");
  });

  it("unescapes literal \\r\\n sequences", () => {
    const result = renderMarkdown("line1\\r\\nline2");
    expect(result).toContain("line1");
    expect(result).toContain("line2");
  });

  it("unescapes literal \\n sequences", () => {
    const result = renderMarkdown("line1\\nline2");
    expect(result).toContain("line1");
    expect(result).toContain("line2");
  });

  it("preserves inline literal \\n examples when the content already has real newlines", () => {
    const result = renderMarkdown("real line\ninline \\n example");
    expect(result).toContain("inline \\n example");
  });

  it("handles code blocks", () => {
    const result = renderMarkdown("```\ncode block\n```");
    expect(result).toContain("<code");
    expect(result).toContain("code block");
  });

  it("handles inline code", () => {
    const result = renderMarkdown("`inline code`");
    expect(result).toContain("<code");
    expect(result).toContain("inline code");
  });

  it("handles lists", () => {
    const result = renderMarkdown("- item 1\n- item 2");
    expect(result).toContain("<li");
    expect(result).toContain("item 1");
    expect(result).toContain("item 2");
  });

  it("handles paragraphs", () => {
    const result = renderMarkdown("paragraph 1\n\nparagraph 2");
    expect(result).toContain("<p");
    expect(result).toContain("paragraph 1");
    expect(result).toContain("paragraph 2");
  });
});
