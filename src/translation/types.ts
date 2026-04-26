import type { Lang } from "../utils/i18n";

export type TranslationJobTrigger = "create" | "update";

export type TranslationJobMessage = {
  postId: number;
  sourceLang: Lang;
  targetLang: Lang;
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
    sourceLang: Lang;
    targetLang: Lang;
    title: string | null;
    body: string;
  }) => Promise<TranslationResult>;
};