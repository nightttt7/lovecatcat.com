import type { TranslationLang } from "../utils/i18n";
import { buildBodyTranslationPrompt, buildTitleTranslationPrompt } from "./prompts";
import type { TranslationProvider } from "./types";

export const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_REQUEST_TIMEOUT_MS = 60_000;

type DeepSeekChatMessage = {
  role: "system" | "user";
  content: string;
};

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type DeepSeekTranslationProviderOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

const callDeepSeekChat = async ({
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
  messages: DeepSeekChatMessage[];
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
        messages,
        // Thinking mode is enabled by default on DeepSeek V4; disable it so
        // translation returns the final text directly without reasoning tokens.
        thinking: { type: "disabled" }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`DeepSeek request failed with ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const payload = (await response.json()) as DeepSeekChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("DeepSeek response did not contain translated content");
  }

  return content;
};

const translateTitle = async (
  config: { apiKey: string; model: string; endpoint: string; fetchImpl: typeof fetch; timeoutMs: number },
  targetLang: TranslationLang,
  title: string
) => {
  return callDeepSeekChat({
    ...config,
    messages: [
      { role: "system", content: buildTitleTranslationPrompt(targetLang) },
      { role: "user", content: title }
    ]
  });
};

const translateBody = async (
  config: { apiKey: string; model: string; endpoint: string; fetchImpl: typeof fetch; timeoutMs: number },
  targetLang: TranslationLang,
  body: string
) => {
  return callDeepSeekChat({
    ...config,
    messages: [
      { role: "system", content: buildBodyTranslationPrompt(targetLang) },
      { role: "user", content: body }
    ]
  });
};

export const createDeepSeekTranslationProvider = (
  options: DeepSeekTranslationProviderOptions
): TranslationProvider => {
  const { apiKey } = options;
  if (!apiKey) {
    throw new Error("DeepSeek translation provider requires an apiKey");
  }

  const model = options.model?.trim();
  if (!model) {
    throw new Error("DeepSeek translation provider requires a model");
  }

  const endpoint = options.endpoint ?? DEEPSEEK_CHAT_COMPLETIONS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEEPSEEK_REQUEST_TIMEOUT_MS;
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
        provider: `deepseek:${model}`,
        translatedAt: now().toISOString()
      };
    }
  };
};

export const DEEPSEEK_TRANSLATION_PROVIDER_ID_PREFIX = "deepseek:";
