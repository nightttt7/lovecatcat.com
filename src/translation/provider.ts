import type { Lang } from "../utils/i18n";
import { getWorkersAiLanguageName } from "./content";
import type { TranslationProvider } from "./types";

const WORKERS_AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";
const TOKEN_PATTERN = /```[\s\S]*?```|`[^`\n]+`|\]\(([^)]+)\)|https?:\/\/[^\s)]+/g;

type WorkersAiTranslationResponse = {
  translated_text?: string;
  result?: {
    translated_text?: string;
  };
};

const protectTranslatableContent = (value: string) => {
  const tokens: string[] = [];
  const protectedText = value.replace(TOKEN_PATTERN, (match) => {
    const token = `__LCC_TOKEN_${tokens.length}__`;
    tokens.push(match);
    return token;
  });

  return { protectedText, tokens };
};

const restoreProtectedContent = (value: string, tokens: string[]) => {
  return tokens.reduce((result, original, index) => {
    return result.replaceAll(`__LCC_TOKEN_${index}__`, original);
  }, value);
};

const readTranslatedText = (response: unknown) => {
  const typedResponse = response as WorkersAiTranslationResponse;
  return typedResponse.translated_text ?? typedResponse.result?.translated_text ?? null;
};

const translateText = async (ai: Ai, sourceLang: Lang, targetLang: Lang, value: string) => {
  if (!value.trim()) {
    return value;
  }

  const { protectedText, tokens } = protectTranslatableContent(value);
  const response = await ai.run(WORKERS_AI_TRANSLATION_MODEL, {
    text: protectedText,
    source_lang: getWorkersAiLanguageName(sourceLang),
    target_lang: getWorkersAiLanguageName(targetLang)
  });
  const translatedText = readTranslatedText(response);

  if (!translatedText) {
    throw new Error("Workers AI did not return translated_text");
  }

  return restoreProtectedContent(translatedText, tokens);
};

export const createWorkersAiTranslationProvider = (ai: Ai): TranslationProvider => {
  return {
    async translatePost(input) {
      const [translatedTitle, translatedBody] = await Promise.all([
        input.title ? translateText(ai, input.sourceLang, input.targetLang, input.title) : Promise.resolve<string | null>(null),
        translateText(ai, input.sourceLang, input.targetLang, input.body)
      ]);

      return {
        translatedTitle,
        translatedBody,
        provider: `workers-ai:${WORKERS_AI_TRANSLATION_MODEL}`,
        translatedAt: new Date().toISOString()
      };
    }
  };
};

export const LOCAL_DEV_TRANSLATION_PROVIDER_ID = "local-dev:mock-translation";

const getLocalDevTranslationNotice = (targetLang: Lang) => {
  return targetLang === "zh"
    ? "(由于当前运行于 DEV 环境，真实翻译未执行，以下为占位译文。)"
    : "(Running in a DEV environment, real translation was not executed. The following is placeholder translation.)";
};

const wrapLocalDevTranslation = (targetLang: Lang, value: string | null) => {
  if (!value) {
    return null;
  }

  return `${getLocalDevTranslationNotice(targetLang)}\n\n${value}`;
};

export type LocalDevTranslationProviderOptions = {
  failureRate?: number;
  random?: () => number;
  now?: () => Date;
};

export class LocalDevTranslationFailureError extends Error {
  constructor(message = "Simulated local dev translation failure") {
    super(message);
    this.name = "LocalDevTranslationFailureError";
  }
}

export const createLocalDevTranslationProvider = (
  options: LocalDevTranslationProviderOptions = {}
): TranslationProvider => {
  const { failureRate = 0, random = Math.random, now = () => new Date() } = options;
  const normalizedFailureRate = Number.isFinite(failureRate) ? Math.min(1, Math.max(0, failureRate)) : 0;

  return {
    async translatePost(input) {
      if (normalizedFailureRate > 0 && random() < normalizedFailureRate) {
        throw new LocalDevTranslationFailureError();
      }

      return {
        translatedTitle: wrapLocalDevTranslation(input.targetLang, input.title),
        translatedBody: wrapLocalDevTranslation(input.targetLang, input.body) ?? "",
        provider: LOCAL_DEV_TRANSLATION_PROVIDER_ID,
        translatedAt: now().toISOString()
      };
    }
  };
};