import { sha256 } from "@noble/hashes/sha2.js";
import type { Lang } from "../utils/i18n";
import { isLang, siteLanguages } from "../utils/i18n";

const encoder = new TextEncoder();
const HAN_REGEX = /[\u3400-\u9fff]/g;
const LATIN_LETTER_REGEX = /[A-Za-z]/g;
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
const INLINE_CODE_REGEX = /`[^`\n]+`/g;
const URL_REGEX = /https?:\/\/[^\s)]+/g;
const HTML_TAG_REGEX = /<[^>]+>/g;
const MARKDOWN_LINK_TARGET_REGEX = /\]\(([^)]+)\)/g;
const WHITESPACE_REGEX = /\s+/g;

const toHex = (bytes: Uint8Array) => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const countMatches = (value: string, pattern: RegExp) => {
  return value.match(pattern)?.length ?? 0;
};

const normalizeTextForLanguageDetection = (value: string) => {
  return value
    .replace(FENCED_CODE_BLOCK_REGEX, " ")
    .replace(INLINE_CODE_REGEX, " ")
    .replace(URL_REGEX, " ")
    .replace(MARKDOWN_LINK_TARGET_REGEX, "]")
    .replace(HTML_TAG_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim();
};

const getLanguageSignal = (value: string) => {
  const normalizedValue = normalizeTextForLanguageDetection(value);

  return {
    hanCount: countMatches(normalizedValue, HAN_REGEX),
    latinLetterCount: countMatches(normalizedValue, LATIN_LETTER_REGEX)
  };
};

export const detectPostSourceLanguage = (title: string, body: string): Lang | null => {
  const titleSignal = getLanguageSignal(title);
  const bodySignal = getLanguageSignal(body);
  const weightedHanCount = titleSignal.hanCount * 3 + bodySignal.hanCount;
  const weightedLatinLetterCount = titleSignal.latinLetterCount * 2 + bodySignal.latinLetterCount;

  if (weightedHanCount === 0 && weightedLatinLetterCount === 0) {
    return null;
  }

  if (weightedHanCount === 0) {
    return "en";
  }

  if (weightedLatinLetterCount === 0) {
    return "zh";
  }

  const hanShare = weightedHanCount / (weightedHanCount + weightedLatinLetterCount);

  // Treat Chinese as the default once there is meaningful Han content; technical Chinese posts often embed a lot of English.
  if (titleSignal.hanCount >= 2) {
    return "zh";
  }

  // English posts usually contain very little Chinese, so a tiny Han signal should not flip the result.
  if (weightedHanCount <= 4 && hanShare < 0.03) {
    return "en";
  }

  if (weightedHanCount >= 18 && hanShare >= 0.025) {
    return "zh";
  }

  if (hanShare >= 0.08) {
    return "zh";
  }

  if (hanShare <= 0.02) {
    return "en";
  }

  return null;
};

export const normalizeSelectedSourceLanguage = (
  value: string | undefined,
  detectedLanguage: Lang | null,
  fallbackLanguage: Lang
) => {
  if (value && isLang(value)) {
    return value;
  }

  return detectedLanguage ?? fallbackLanguage;
};

export const getTranslationTargetLanguages = (sourceLang: Lang) => {
  return siteLanguages.filter((lang) => lang !== sourceLang);
};

export const hashPostTranslationSource = ({
  title,
  body,
  sourceLang
}: {
  title: string | null;
  body: string;
  sourceLang: Lang;
}) => {
  return toHex(sha256(encoder.encode(JSON.stringify({ title, body, sourceLang }))));
};

export const getWorkersAiLanguageName = (lang: Lang) => {
  return lang === "zh" ? "chinese" : "english";
};