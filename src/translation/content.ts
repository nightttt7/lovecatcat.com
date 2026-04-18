import { sha256 } from "@noble/hashes/sha2.js";
import type { Lang } from "../utils/i18n";
import { isLang, siteLanguages } from "../utils/i18n";

const encoder = new TextEncoder();
const HAN_REGEX = /[\u3400-\u9fff]/g;
const LATIN_WORD_REGEX = /[A-Za-z]{2,}/g;

const toHex = (bytes: Uint8Array) => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const countMatches = (value: string, pattern: RegExp) => {
  return value.match(pattern)?.length ?? 0;
};

export const detectPostSourceLanguage = (title: string, body: string, fallback: Lang = "zh"): Lang => {
  const combined = `${title}\n${body}`;
  const hanCount = countMatches(combined, HAN_REGEX);
  const latinWordCount = countMatches(combined, LATIN_WORD_REGEX);

  if (hanCount === 0 && latinWordCount === 0) {
    return fallback;
  }

  return hanCount >= latinWordCount ? "zh" : "en";
};

export const normalizeSelectedSourceLanguage = (value: string | undefined, detectedLanguage: Lang) => {
  return value && isLang(value) ? value : detectedLanguage;
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