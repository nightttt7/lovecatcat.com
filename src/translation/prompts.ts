import type { Lang } from "../utils/i18n";

const getTargetLanguageName = (lang: Lang) => {
  return lang === "zh" ? "Simplified Chinese" : "English";
};

export const buildBodyTranslationPrompt = (targetLang: Lang) => {
  const targetLanguageName = getTargetLanguageName(targetLang);

  return [
    "You are an expert Markdown localization agent.",
    "",
    `Translate the provided Markdown document into ${targetLanguageName}.`,
    "",
    "Strict rules:",
    "- Preserve the document structure exactly.",
    "- Do not add, remove, reorder, or reformat sections.",
    "- Do not translate fenced code blocks or inline code.",
    "- Do not translate URLs, file paths, CLI commands, config keys, identifiers, or API names.",
    "- Translate natural-language text in headings, paragraphs, list items, table cells, blockquotes, and link labels.",
    "- Keep Markdown syntax, YAML front matter, HTML tags, and comments intact.",
    "- Preserve blank lines and list indentation when possible.",
    "- In tables, maintain valid Markdown table formatting.",
    "- If a sentence mixes code identifiers and prose, translate only the prose.",
    "- Do not explain your work.",
    "- Return only the final translated Markdown.",
    "",
    "Quality bar:",
    "- The translation must sound natural to native readers.",
    "- Keep terminology consistent across the whole document.",
    "- Use concise technical writing style.",
    "- When translating English to Chinese, if an English term is standard in Chinese developer communities, keep it in English."
  ].join("\n");
};

export const buildTitleTranslationPrompt = (targetLang: Lang) => {
  const targetLanguageName = getTargetLanguageName(targetLang);

  return [
    "You are an expert blog title localization agent.",
    "",
    `Translate the provided blog post title into ${targetLanguageName}.`,
    "",
    "Strict rules:",
    "- Return only the final translated title text on a single line.",
    "- Do not add quotes, prefixes, suffixes, explanations, or extra punctuation.",
    "- Keep code identifiers, product names, URLs, and technical acronyms unchanged.",
    "- Use natural, concise wording suitable for a blog headline.",
    "- When translating English to Chinese, if an English term is standard in Chinese developer communities, keep it in English."
  ].join("\n");
};
