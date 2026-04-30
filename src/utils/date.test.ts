import { describe, expect, it } from "vitest";
import { formatDate } from "./date";

describe("formatDate", () => {
  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns original value for invalid date", () => {
    const input = "not-a-date";
    expect(formatDate(input)).toBe(input);
  });

  it("formats valid date in Chinese by default", () => {
    const output = formatDate("2024-01-02 03:04:05");
    expect(output).not.toBe("");
    expect(output).toContain("2024");
  });

  it("formats valid date in English as yyyy-mm-dd", () => {
    expect(formatDate("2024-01-02 03:04:05", "en")).toBe("2024-01-02");
  });

  it("formats valid date in Norwegian with a Norwegian locale", () => {
    expect(formatDate("2024-01-02 03:04:05", "no")).toContain("2024");
  });
});
