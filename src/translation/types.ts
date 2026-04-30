import type { TranslationLang } from "../utils/i18n";

export type TranslationJobTrigger = "create" | "update";

export type TranslationJobMessage = {
  postId: number;
  authorId: number | null;
  sourceLang: TranslationLang;
  targetLang: TranslationLang;
  sourceHash: string;
  trigger: TranslationJobTrigger;
};

export type TranslationResult = {
  translatedTitle: string | null;
  translatedBody: string;
  provider: string;
  translatedAt: string;
};

export type TranslationProvider = {
  translatePost: (input: {
    sourceLang: TranslationLang;
    targetLang: TranslationLang;
    title: string | null;
    body: string;
  }) => Promise<TranslationResult>;
};