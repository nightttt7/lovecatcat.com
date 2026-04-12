import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";

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

  it("keeps literal escaped line examples as-is", () => {
    const result = renderMarkdown("line1\\r\\nline2");
    expect(result).toContain("line1\\r\\nline2");
  });

  it("keeps inline literal escaped newline examples", () => {
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

  it("renders soft line breaks as br tags", () => {
    const result = renderMarkdown("line 1\nline 2");
    expect(result).toContain("<br>");
  });

  it("sanitizes raw html instead of rendering it", () => {
    const result = renderMarkdown("before <script>alert('x')</script> after");
    expect(result).toContain("before ");
    expect(result).toContain(" after");
    expect(result).not.toContain("<script>");
  });

  it("strips unsafe javascript links", () => {
    const result = renderMarkdown("[click](javascript:alert('x'))");
    expect(result).toContain("<a>");
    expect(result).not.toContain("javascript:");
  });

  it("strips data url links", () => {
    const result = renderMarkdown("[payload](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
    expect(result).toContain("<a>payload</a>");
    expect(result).not.toContain("href=");
    expect(result).not.toContain("data:text/html");
  });

  it("strips malicious image protocols from img tags", () => {
    const result = renderMarkdown("![avatar](javascript:alert(1))");
    expect(result).toContain("<img");
    expect(result).toContain('alt="avatar"');
    expect(result).not.toContain("src=");
    expect(result).not.toContain("javascript:");
  });

  it("drops raw html with event handler attributes", () => {
    const result = renderMarkdown('<img src="https://example.com/x.png" onerror="alert(1)">');
    expect(result.trim()).toBe("");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("drops nested raw html payloads entirely", () => {
    const result = renderMarkdown('<div><em>safe</em><script>alert(1)</script><a href="javascript:alert(1)">bad</a></div>');
    expect(result.trim()).toBe("");
    expect(result).not.toContain("safe");
    expect(result).not.toContain("bad");
    expect(result).not.toContain("<script>");
  });

  it("preserves checked task list items", () => {
    const result = renderMarkdown("- [x] done\n- [ ] todo");
    expect(result).toContain('class="contains-task-list"');
    expect(result).toContain('class="task-list-item"');
    expect(result).toContain('type="checkbox"');
    expect(result).toContain("checked");
  });
});