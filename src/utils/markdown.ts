import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true
});

export const normalizeStoredMarkdown = (content: string | null): string => {
  if (!content) {
    return "";
  }

  if (content.includes("\\r\\n")) {
    return content.replace(/\\r\\n/g, "\n");
  }

  if (!content.includes("\n") && content.includes("\\n")) {
    return content.replace(/\\n/g, "\n");
  }

  return content;
};

export const renderMarkdown = (content: string | null): string => {
  return marked.parse(normalizeStoredMarkdown(content)) as string;
};
