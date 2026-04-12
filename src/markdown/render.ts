import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { markdownSanitizeSchema } from "./schema";

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkRehype)
  .use(rehypeSanitize, markdownSanitizeSchema)
  .use(rehypeStringify);

export const renderMarkdownToHtml = (content: string): string => {
  return String(markdownProcessor.processSync(content));
};

export const renderMarkdown = (content: string | null): string => {
  return renderMarkdownToHtml(content ?? "");
};