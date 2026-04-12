import { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input || []), ["checked", true]]
  }
};