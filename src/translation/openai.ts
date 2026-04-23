import type { Lang } from "../utils/i18n";
import { buildBodyTranslationPrompt, buildTitleTranslationPrompt } from "./prompts";
import type { TranslationProvider } from "./types";

export const DEFAULT_OPENAI_TRANSLATION_MODEL = "gpt-5.4-mini";
export const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_REQUEST_TIMEOUT_MS = 60_000;

type OpenAiChatMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type OpenAiTranslationProviderOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

const callOpenAiChat = async ({
  apiKey,
  model,
  endpoint,
  fetchImpl,
  messages,
  timeoutMs
}: {
  apiKey: string;
  model: string;
  endpoint: string;
  fetchImpl: typeof fetch;
  messages: OpenAiChatMessage[];
  timeoutMs: number;
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages
      }),
      signal: controller.signal
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const payload = (await response.json()) as OpenAiChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI response did not contain translated content");
  }

  return content;
};

const translateTitle = async (
  config: { apiKey: string; model: string; endpoint: string; fetchImpl: typeof fetch; timeoutMs: number },
  targetLang: Lang,
  title: string
) => {
  return callOpenAiChat({
    ...config,
    messages: [
      { role: "system", content: buildTitleTranslationPrompt(targetLang) },
      { role: "user", content: title }
    ]
  });
};

const translateBody = async (
  config: { apiKey: string; model: string; endpoint: string; fetchImpl: typeof fetch; timeoutMs: number },
  targetLang: Lang,
  body: string
) => {
  return callOpenAiChat({
    ...config,
    messages: [
      { role: "system", content: buildBodyTranslationPrompt(targetLang) },
      { role: "user", content: body }
    ]
  });
};

export const createOpenAiTranslationProvider = (
  options: OpenAiTranslationProviderOptions
): TranslationProvider => {
  const { apiKey } = options;
  if (!apiKey) {
    throw new Error("OpenAI translation provider requires an apiKey");
  }

  const model = options.model ?? DEFAULT_OPENAI_TRANSLATION_MODEL;
  const endpoint = options.endpoint ?? OPENAI_CHAT_COMPLETIONS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? OPENAI_REQUEST_TIMEOUT_MS;
  const config = { apiKey, model, endpoint, fetchImpl, timeoutMs };

  return {
    async translatePost(input) {
      const trimmedTitle = input.title?.trim() ?? "";
      const [translatedTitle, translatedBody] = await Promise.all([
        trimmedTitle ? translateTitle(config, input.targetLang, trimmedTitle) : Promise.resolve<string | null>(null),
        translateBody(config, input.targetLang, input.body)
      ]);

      return {
        translatedTitle: translatedTitle ?? null,
        translatedBody,
        provider: `openai:${model}`,
        translatedAt: now().toISOString()
      };
    }
  };
};

export const OPENAI_TRANSLATION_PROVIDER_ID_PREFIX = "openai:";
