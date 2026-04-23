import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { faviconIco } from "./assets/favicon";
import { postEditorPreviewScript } from "./assets/post-editor-preview.generated";
import { primerCss } from "./assets/primer";
import type { SiteConfig } from "./config";
import type { BlogDb, CommentRow, PostDetailRow, PostListRow, PostTranslationRow, PostTranslationStatus, UserRow } from "./db/types";
import { renderMarkdown } from "./markdown/render";
import { renderLayout } from "./render/layout";
import { canDeleteComment, canDeletePost, canEditOwnPost, canManageUser, hasAccess, type AccessUser } from "./utils/access";
import { createSessionToken, hashPassword, hashSessionToken, normalizeEmail, verifyPassword } from "./utils/auth";
import { formatDate } from "./utils/date";
import { isLang, siteLanguages, t, type Lang } from "./utils/i18n";
import { buildTagValue, DEFAULT_POST_TAG, displayTagValues, isDraftTag, normalizeTagFilterValue, tagInputValue } from "./utils/post-tags";
import { detectPostSourceLanguage, getTranslationTargetLanguages, hashPostTranslationSource, normalizeSelectedSourceLanguage } from "./translation/content";
import type { TranslationJobMessage, TranslationJobTrigger } from "./translation/types";

type CurrentUser = {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
};

type FormBodyValue = string | File | (string | File)[];
type FormBody = Record<string, FormBodyValue>;

export type AppEnv<TBindings extends Record<string, unknown> = Record<string, unknown>> = {
  Bindings: TBindings;
  Variables: {
    db: BlogDb;
    currentUser: CurrentUser | null;
    isAdmin: boolean;
    lang: Lang;
    aboutPostId?: number;
    toolsPostId?: number;
  };
};

export type AppOptions<TBindings extends Record<string, unknown> = Record<string, unknown>> = {
  getSite: (c: Context<AppEnv<TBindings>>) => SiteConfig;
  getDb: (c: Context<AppEnv<TBindings>>) => BlogDb;
  getIsAdmin?: (c: Context<AppEnv<TBindings>>) => boolean;
  getAdminEmails?: (c: Context<AppEnv<TBindings>>) => string[];
  enqueueTranslationJobs?: (c: Context<AppEnv<TBindings>>, jobs: TranslationJobMessage[]) => Promise<void>;
};

const PAGE_SIZE = 10;
const FULL_PAGINATION_PAGE_THRESHOLD = 9;
const EDGE_PAGINATION_PAGE_COUNT = 7;
const MIDDLE_PAGINATION_SIBLING_COUNT = 2;
const SESSION_COOKIE_NAME = "lovecatcat_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MIN_PASSWORD_LENGTH = 8;
const MAX_COMMENT_LENGTH = 2000;

type PaginationItem =
  | {
      type: "page";
      pageNumber: number;
    }
  | {
      type: "ellipsis";
      key: string;
    };

type PaginationRenderOptions = {
  page: number;
  totalPages: number;
  lang: Lang;
  getPageHref: (pageNumber: number) => string;
  items: PaginationItem[];
};

const getTrimmedFormValue = (body: FormBody, key: string) => {
  const value = body[key];

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }

  return "";
};

const getRawFormValue = (body: FormBody, key: string) => {
  const value = body[key];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
};

const isChecked = (body: FormBody, key: string) => {
  return getRawFormValue(body, key) !== "";
};

const getPostVisibilityValue = (body: FormBody) => {
  return getTrimmedFormValue(body, "visibility") === "private" ? "private" : "public";
};

const getSourceLanguageValue = (body: FormBody, detectedLanguage: Lang | null, fallbackLanguage: Lang) => {
  return normalizeSelectedSourceLanguage(getTrimmedFormValue(body, "sourceLang"), detectedLanguage, fallbackLanguage);
};

const getLanguageLabelKey = (value: Lang) => {
  return value === "zh" ? "postSourceLanguageZh" : "postSourceLanguageEn";
};

const getLanguageLabel = (value: Lang | null, lang: Lang) => {
  return value ? t(getLanguageLabelKey(value), lang) : t("postSourceLanguageUndetermined", lang);
};

const getTranslationTargetLanguage = (sourceLang: Lang) => {
  return getTranslationTargetLanguages(sourceLang)[0] ?? (sourceLang === "zh" ? "en" : "zh");
};

const getStoredSourceLanguage = (value: string | null | undefined, fallbackLanguage: Lang) => {
  return value && isLang(value) ? value : fallbackLanguage;
};

const getTranslationStatusLabelKey = (status: PostTranslationStatus | null | undefined) => {
  switch (status) {
    case "pending":
      return "translationStatusPending";
    case "processing":
      return "translationStatusProcessing";
    case "completed":
      return "translationStatusCompleted";
    case "failed":
      return "translationStatusFailed";
    case "stale":
      return "translationStatusStale";
    default:
      return "translationStatusMissing";
  }
};

const buildPostViewHref = (postId: number, view: "original" | "translation") => {
  return view === "original" ? `/posts/${postId}?view=original` : `/posts/${postId}?view=translation`;
};

const formatTranslatedPostTitle = ({
  translatedTitle,
  originalTitle,
  lang
}: {
  translatedTitle: string | null;
  originalTitle: string | null;
  lang: Lang;
}) => {
  const normalizedTranslatedTitle = translatedTitle?.trim() ?? "";
  const normalizedOriginalTitle = originalTitle?.trim() ?? "";

  if (!normalizedTranslatedTitle) {
    return normalizedOriginalTitle || null;
  }

  if (!normalizedOriginalTitle || normalizedTranslatedTitle === normalizedOriginalTitle) {
    return normalizedTranslatedTitle;
  }

  const wrappedOriginalTitle = `${t("originalTitleLabel", lang)} [${normalizedOriginalTitle}]`;
  return `${normalizedTranslatedTitle} (${wrappedOriginalTitle})`;
};

const syncPostTranslationState = async <TBindings extends Record<string, unknown>>({
  c,
  db,
  postId,
  title,
  body,
  sourceLang,
  trigger,
  options
}: {
  c: Context<AppEnv<TBindings>>;
  db: BlogDb;
  postId: number;
  title: string | null;
  body: string;
  sourceLang: Lang;
  trigger: TranslationJobTrigger;
  options: AppOptions<TBindings>;
}) => {
  const sourceHash = hashPostTranslationSource({ title, body, sourceLang });
  const jobs: TranslationJobMessage[] = [];

  for (const targetLang of getTranslationTargetLanguages(sourceLang)) {
    const existingTranslation = await db.getPostTranslation(postId, targetLang);

    if (existingTranslation?.source_hash === sourceHash && existingTranslation.status === "completed") {
      continue;
    }

    await db.upsertPostTranslation({
      postId,
      lang: targetLang,
      translatedTitle: existingTranslation?.translated_title ?? null,
      translatedBody: existingTranslation?.translated_body ?? null,
      status: existingTranslation?.translated_body || existingTranslation?.translated_title ? "stale" : "pending",
      sourceHash,
      provider: existingTranslation?.provider ?? "workers-ai:@cf/meta/m2m100-1.2b",
      errorMessage: null,
      isMachineTranslation: true,
      translatedAt: existingTranslation?.translated_at ?? null
    });

    jobs.push({
      postId,
      sourceLang,
      targetLang,
      sourceHash,
      trigger
    });
  }

  if (jobs.length > 0) {
    await options.enqueueTranslationJobs?.(c, jobs);
  }

  return jobs.length;
};

const markPostTranslationsStale = async ({
  db,
  postId,
  title,
  body,
  sourceLang
}: {
  db: BlogDb;
  postId: number;
  title: string | null;
  body: string;
  sourceLang: Lang;
}) => {
  const sourceHash = hashPostTranslationSource({ title, body, sourceLang });
  const translations = await db.listPostTranslations(postId);

  for (const translation of translations) {
    if (translation.lang === sourceLang || translation.source_hash === sourceHash) {
      continue;
    }

    const hasTranslatedContent = Boolean(translation.translated_title?.trim() || translation.translated_body?.trim());

    await db.upsertPostTranslation({
      postId,
      lang: translation.lang,
      translatedTitle: translation.translated_title,
      translatedBody: translation.translated_body,
      status: hasTranslatedContent ? "stale" : "pending",
      sourceHash,
      provider: translation.provider,
      errorMessage: null,
      isMachineTranslation: translation.is_machine_translation !== 0,
      translatedAt: translation.translated_at
    });
  }
};

const getRequestProtocol = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>) => {
  const forwardedHeader = c.req.header("forwarded");
  const forwardedProto = forwardedHeader
    ?.split(",")[0]
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("proto="))
    ?.split("=")[1]
    ?.trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();

  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  const forwardedProtoHeader = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim()?.toLowerCase();
  if (forwardedProtoHeader === "http" || forwardedProtoHeader === "https") {
    return forwardedProtoHeader;
  }

  const cfVisitorHeader = c.req.header("cf-visitor");
  if (cfVisitorHeader) {
    try {
      const parsed = JSON.parse(cfVisitorHeader) as { scheme?: string };
      const scheme = parsed.scheme?.toLowerCase();
      if (scheme === "http" || scheme === "https") {
        return scheme;
      }
    } catch {
      // Ignore malformed proxy metadata and fall back to the request URL.
    }
  }

  return new URL(c.req.url).protocol === "https:" ? "https" : "http";
};

const getCookieOptions = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>) => {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: getRequestProtocol(c) === "https",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
};

const clearSessionCookie = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
};

const AUTH_PAGE_PATHS = new Set(["/login", "/signup", "/logout"]);

const sanitizeNextPath = (value: string | undefined, fallback: string) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
};

const getLocalPathFromUrl = (value: string | undefined, requestUrl: string) => {
  if (!value) {
    return null;
  }

  try {
    const resolvedUrl = new URL(value, requestUrl);

    if (!resolvedUrl.pathname.startsWith("/")) {
      return null;
    }

    return `${resolvedUrl.pathname}${resolvedUrl.search}`;
  } catch {
    return null;
  }
};

const sanitizeLocalReturnPath = (
  value: string | undefined,
  requestUrl: string,
  fallback: string,
  options: { allowAuthPages?: boolean; allowExternalAbsolute?: boolean } = {}
) => {
  const isAbsoluteValue = Boolean(value && (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith("//")));
  if (value?.startsWith("//")) {
    return fallback;
  }

  const localPath = getLocalPathFromUrl(value, requestUrl);

  if (!localPath) {
    return fallback;
  }

  if (!options.allowExternalAbsolute && isAbsoluteValue) {
    try {
      if (new URL(value as string, requestUrl).origin !== new URL(requestUrl).origin) {
        return fallback;
      }
    } catch {
      return fallback;
    }
  }

  if (!options.allowAuthPages) {
    const pathname = new URL(localPath, "https://lovecatcat.local").pathname;

    if (AUTH_PAGE_PATHS.has(pathname)) {
      return fallback;
    }
  }

  return localPath;
};

const getRefererReturnPath = <TBindings extends Record<string, unknown>>(
  c: Context<AppEnv<TBindings>>,
  fallback: string,
  options: { allowAuthPages?: boolean } = {}
) => {
  return sanitizeLocalReturnPath(c.req.header("referer"), c.req.url, fallback, {
    ...options,
    allowExternalAbsolute: true
  });
};

const getAuthNextPath = <TBindings extends Record<string, unknown>>(
  c: Context<AppEnv<TBindings>>,
  explicitValue: string | undefined,
  fallback = "/"
) => {
  return sanitizeLocalReturnPath(explicitValue, c.req.url, getRefererReturnPath(c, fallback), {
    allowAuthPages: false
  });
};

const redirectToLogin = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>, fallback = "/") => {
  const nextPath = getRefererReturnPath(c, fallback);
  return c.redirect(`/login?next=${encodeURIComponent(nextPath)}`);
};

const getAdminEmailSet = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>, options: AppOptions<TBindings>) => {
  return new Set((options.getAdminEmails?.(c) ?? []).map((email) => normalizeEmail(email)).filter(Boolean));
};

const getAccessUser = <TBindings extends Record<string, unknown>>(c: Context<AppEnv<TBindings>>): AccessUser => {
  const currentUser = c.get("currentUser");

  if (currentUser) {
    return {
      id: currentUser.id,
      isAdmin: c.get("isAdmin")
    };
  }

  if (c.get("isAdmin")) {
    return {
      id: 0,
      isAdmin: true
    };
  }

  return null;
};

const getUnknownAuthorLabel = (lang: Lang) => t("unknownAuthor", lang);

const getPositiveIntegerQueryValue = (value: string | undefined) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const renderAuthorText = (authorId: number | null, authorName: string | null, lang: Lang) => {
  const label = authorName ?? getUnknownAuthorLabel(lang);

  if (authorId === null || authorName === null) {
    return html`${t("author", lang)} ${label}`;
  }

  return html`${t("author", lang)} <a href="/?authorId=${authorId}" class="text-bold color-fg-default">${label}</a>`;
};

const renderHomeAuthorText = (authorId: number | null, authorName: string | null, lang: Lang) => {
  const label = authorName ?? getUnknownAuthorLabel(lang);

  if (authorId === null || authorName === null) {
    return html`${label}`;
  }

  return html`<a href="/?authorId=${authorId}" class="text-bold color-fg-default">${label}</a>`;
};

const renderNotice = (message: string) => {
  return html`
    <div class="Box mb-4">
      <div class="Box-body">
        <p class="mb-0">${message}</p>
      </div>
    </div>
  `;
};

const renderTranslationMessage = (message: string, variant: "success" | "warn") => {
  const flashClass = variant === "success" ? "flash-success" : "flash-warn";

  return html`
    <div class="flash ${flashClass} mb-3">
      <p class="mb-0">${message}</p>
    </div>
  `;
};

const renderPostTranslationSection = ({
  lang,
  postId,
  sourceLang,
  detectedSourceLang,
  translation,
  error,
  notice
}: {
  lang: Lang;
  postId: number;
  sourceLang: Lang;
  detectedSourceLang: Lang | null;
  translation: PostTranslationRow | null;
  error?: string;
  notice?: string;
}) => {
  const targetLang = getTranslationTargetLanguage(sourceLang);
  const actionLabel = translation ? t("translationRegenerateAction", lang) : t("translationGenerateAction", lang);

  return html`
    <div class="Box box-shadow mt-4">
      <div class="Box-header">
        <h2 class="h3 mb-0">${t("translationManagerTitle", lang)}</h2>
      </div>
      <div class="Box-body">
        <p class="f6 text-gray mt-0 mb-3">${t("translationManagerHint", lang)}</p>
        ${notice ? renderTranslationMessage(notice, "success") : html``}
        ${error ? renderTranslationMessage(error, "warn") : html``}
        <form method="post" action="/post/${postId}/translation/generate" class="mb-4">
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="translation-source-lang">${t("postSourceLanguageLabel", lang)}</label>
            <select id="translation-source-lang" name="sourceLang" class="form-select width-full">
              ${siteLanguages.map((language) => html`<option value="${language}" ${sourceLang === language ? "selected" : ""}>${t(getLanguageLabelKey(language), lang)}</option>`)}
            </select>
            <p class="f6 text-gray mt-2 mb-0">${t("translationSourceLanguageHint", lang)} ${t("postSourceLanguageDetected", lang)}: ${getLanguageLabel(detectedSourceLang, lang)}</p>
          </div>
          <div class="mb-3">
            <p class="text-bold mb-1">${t("translationTargetLanguageLabel", lang)}</p>
            <p class="mb-0">${getLanguageLabel(targetLang, lang)}</p>
          </div>
          <div class="mb-3">
            <p class="text-bold mb-1">${t("translationStatusLabel", lang)}</p>
            <p class="mb-0">${t(getTranslationStatusLabelKey(translation?.status), lang)}</p>
          </div>
          <button type="submit" class="btn">${actionLabel}</button>
        </form>
        <form method="post" action="/post/${postId}/translation">
          <p class="f6 text-gray mt-0 mb-3">${t("translationManualEditHint", lang)}</p>
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="translated-title">${t("translationTranslatedTitleLabel", lang)}</label>
            <input id="translated-title" name="translatedTitle" type="text" class="form-control width-full" maxlength="200" value="${translation?.translated_title ?? ""}" />
          </div>
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="translated-body">${t("translationTranslatedBodyLabel", lang)}</label>
            <textarea id="translated-body" name="translatedBody" class="form-control width-full" rows="18" required>${translation?.translated_body ?? ""}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">${t("translationSaveAction", lang)}</button>
        </form>
      </div>
    </div>
  `;
};

const renderPostTagLabels = (tagValue: string | null | undefined) => {
  const tags = displayTagValues(tagValue);

  if (tags.length === 0) {
    return html``;
  }

  return html`${tags.map(
    (tag) => html`<a href="/?tag=${encodeURIComponent(tag)}" class="mr-2 mb-1 d-inline-flex flex-items-center rounded-2 border px-2 text-mono color-fg-accent">#${tag}</a>`
  )}`;
};

const renderPrivateBadge = (isPrivate: number | null | undefined, lang: Lang) => {
  if (!isPrivate) {
    return html``;
  }

  return html`<span class="mr-3 mb-1 d-inline-block text-bold">${t("privatePostBadge", lang)}</span>`;
};

const renderLabelDirectory = (labels: Array<{ tag: string; postCount: number }>, lang: Lang) => {
  return html`
    ${renderHomeSectionNav("labels", lang)}
    <div class="d-flex flex-justify-between flex-items-center mb-4 flex-wrap">
      <h1 class="h2 mb-2">${t("labelsTitle", lang)}</h1>
    </div>
    ${labels.length === 0
      ? renderNotice(t("noLabels", lang))
      : html`${labels.map(
          (label) => html`
            <article class="Box box-shadow mb-3">
              <div class="Box-body d-flex flex-justify-between flex-items-center flex-wrap">
                 <a href="/?tag=${encodeURIComponent(label.tag)}" class="f3 d-inline-flex flex-items-center rounded-2 border px-2 text-mono text-bold color-fg-accent">#${label.tag}</a>
                <span class="Counter f3">${label.postCount}</span>
              </div>
            </article>
          `
        )}`}
  `;
};

type HomeSectionNavKey = "posts" | "labels" | "authors";

const renderHomeSectionNavLink = (href: string, label: string, isCurrent: boolean) => {
  return html`<a href="${href}"${raw(isCurrent ? ' aria-current="page"' : "")} class="home-section-link h2 mb-2 mb-sm-0 text-bold color-fg-default">${label}</a>`;
};

const renderHomeSectionNav = (currentSection: HomeSectionNavKey, lang: Lang) => {
  return html`
    <style>
      .home-section-link {
        display: inline-block;
        text-decoration: none;
      }
      .home-section-link:hover {
        color: var(--fgColor-default);
        text-decoration: underline dashed !important;
      }
      .home-section-separator {
        color: var(--fgColor-muted);
        font-weight: 400;
      }
    </style>
    <nav class="d-flex flex-wrap flex-items-center mb-4" aria-label="${t("latestPosts", lang)}">
      ${renderHomeSectionNavLink("/", t("latestPosts", lang), currentSection === "posts")}
      <span class="home-section-separator h2 mb-2 mb-sm-0 mx-2" aria-hidden="true">|</span>
      ${renderHomeSectionNavLink("/labels", t("labels", lang), currentSection === "labels")}
      <span class="home-section-separator h2 mb-2 mb-sm-0 mx-2" aria-hidden="true">|</span>
      ${renderHomeSectionNavLink("/authors", t("authors", lang), currentSection === "authors")}
    </nav>
  `;
};

const renderHomeSelectedFilters = ({
  selectedTag,
  selectedAuthorName,
  lang
}: {
  selectedTag: string | null;
  selectedAuthorName: string | null;
  lang: Lang;
}) => {
  if (!selectedTag && !selectedAuthorName) {
    return html``;
  }

  return html`
    ${selectedTag
      ? html`<div class="mb-4"><h1 class="h2 mb-2">#${selectedTag}</h1></div>`
      : html``}
    ${selectedAuthorName
      ? html`<div class="mb-4"><h1 class="h2 mb-2">${t("author", lang)}: ${selectedAuthorName}</h1></div>`
      : html``}
  `;
};

const renderAuthorDirectory = (authors: Array<{ id: number; username: string | null; post_count: number }>, lang: Lang) => {
  return html`
    ${renderHomeSectionNav("authors", lang)}
    <div class="d-flex flex-justify-between flex-items-center mb-4 flex-wrap">
      <h1 class="h2 mb-2">${t("authorsTitle", lang)}</h1>
    </div>
    ${authors.length === 0
      ? renderNotice(t("noAuthors", lang))
      : html`${authors.map(
          (author) => html`
            <article class="Box box-shadow mb-3">
              <div class="Box-body d-flex flex-justify-between flex-items-center flex-wrap">
                <a href="/?authorId=${author.id}" class="f3 text-bold color-fg-default">${author.username ?? getUnknownAuthorLabel(lang)}</a>
                <span class="Counter f3">${author.post_count}</span>
              </div>
            </article>
          `
        )}`}
  `;
};

const renderDeleteConfirmation = ({
  lang,
  actionPath,
  redirectTo,
  triggerLabel
}: {
  lang: Lang;
  actionPath: string;
  redirectTo: string;
  triggerLabel: string;
}) => {
  return html`
    <details
      class="details-reset position-relative delete-confirm"
      ontoggle="if (this.open) { this.querySelector('.delete-confirm-submit')?.focus(); }"
      onkeydown="if (event.key === 'Escape') { this.removeAttribute('open'); this.querySelector('summary')?.focus(); event.preventDefault(); }"
    >
      <summary class="btn btn-danger delete-confirm-trigger">${triggerLabel}</summary>
      <div class="delete-confirm-panel Box color-bg-default color-shadow-large overflow-hidden">
        <div class="Box-header">
          <h4 class="h4 mb-0">${t("deleteConfirmTitle", lang)}</h4>
        </div>
        <div class="Box-body">
          <p class="mb-3">${t("deleteConfirmBody", lang)}</p>
          <div class="delete-confirm-actions">
            <button type="button" class="btn" onclick="this.closest('details')?.removeAttribute('open')">${t("cancelAction", lang)}</button>
            <form method="post" action="${actionPath}">
              <input type="hidden" name="redirectTo" value="${redirectTo}" />
              <button type="submit" class="btn btn-danger delete-confirm-submit">${t("confirmDeleteAction", lang)}</button>
            </form>
          </div>
        </div>
      </div>
    </details>
  `;
};

const renderPaginationLinks = ({ page, totalPages, lang, getPageHref, items }: PaginationRenderOptions) => {
  return html`
    ${page > 1
      ? html`<a href="${getPageHref(page - 1)}" class="pagination-control" rel="prev">${t("paginationPrevious", lang)}</a>`
      : html`<span class="pagination-control-disabled" aria-disabled="true">${t("paginationPrevious", lang)}</span>`}
    ${items.map((item) => {
      if (item.type === "ellipsis") {
        return html`<span class="pagination-ellipsis" aria-hidden="true">...</span>`;
      }

      return item.pageNumber === page
        ? html`<span class="current" aria-current="page">${item.pageNumber}</span>`
        : html`<a href="${getPageHref(item.pageNumber)}">${item.pageNumber}</a>`;
    })}
    ${page < totalPages
      ? html`<a href="${getPageHref(page + 1)}" class="pagination-control" rel="next">${t("paginationNext", lang)}</a>`
      : html`<span class="pagination-control-disabled" aria-disabled="true">${t("paginationNext", lang)}</span>`}
  `;
};

const buildPaginationItems = (page: number, totalPages: number): PaginationItem[] => {
  if (totalPages <= FULL_PAGINATION_PAGE_THRESHOLD) {
    return Array.from({ length: totalPages }, (_, index) => ({ type: "page" as const, pageNumber: index + 1 }));
  }

  if (page <= 5) {
    return [
      ...Array.from({ length: EDGE_PAGINATION_PAGE_COUNT }, (_, index) => ({ type: "page" as const, pageNumber: index + 1 })),
      { type: "ellipsis" as const, key: "end" },
      { type: "page" as const, pageNumber: totalPages }
    ];
  }

  if (page >= totalPages - 4) {
    return [
      { type: "page" as const, pageNumber: 1 },
      { type: "ellipsis" as const, key: "start" },
      ...Array.from({ length: EDGE_PAGINATION_PAGE_COUNT }, (_, index) => ({
        type: "page" as const,
        pageNumber: totalPages - EDGE_PAGINATION_PAGE_COUNT + 1 + index
      }))
    ];
  }

  return [
    { type: "page" as const, pageNumber: 1 },
    { type: "ellipsis" as const, key: "start" },
    ...Array.from({ length: MIDDLE_PAGINATION_SIBLING_COUNT * 2 + 1 }, (_, index) => ({
      type: "page" as const,
      pageNumber: page - MIDDLE_PAGINATION_SIBLING_COUNT + index
    })),
    { type: "ellipsis" as const, key: "end" },
    { type: "page" as const, pageNumber: totalPages }
  ];
};

const buildMinimalPaginationItems = (page: number, totalPages: number): PaginationItem[] => {
  const startPage = Math.max(1, page - 1);
  const endPage = Math.min(totalPages, page + 1);

  const pageItems = Array.from({ length: endPage - startPage + 1 }, (_, index) => ({
    type: "page" as const,
    pageNumber: startPage + index
  }));

  return [
    ...(startPage > 1 ? [{ type: "ellipsis" as const, key: "start" }] : []),
    ...pageItems,
    ...(endPage < totalPages ? [{ type: "ellipsis" as const, key: "end" }] : [])
  ];
};

const renderPagination = (basePath: string, page: number, totalPages: number, lang: Lang, pageParam = "page") => {
  if (totalPages <= 1) {
    return html``;
  }

  const separator = basePath.includes("?") ? "&" : "?";
  const fullItems = Array.from({ length: totalPages }, (_, index) => ({ type: "page" as const, pageNumber: index + 1 }));
  const hasResponsiveVariants = totalPages > FULL_PAGINATION_PAGE_THRESHOLD;
  const compactItems = hasResponsiveVariants ? buildPaginationItems(page, totalPages) : fullItems;
  const minimalItems = hasResponsiveVariants ? buildMinimalPaginationItems(page, totalPages) : fullItems;
  const getPageHref = (pageNumber: number) => `${basePath}${separator}${pageParam}=${pageNumber}`;

  return html`
    <div
      class="paginate-container mt-4 responsive-pagination"
      data-pagination-root
      data-pagination-mode="full"
      data-pagination-has-responsive-variants="${hasResponsiveVariants ? "true" : "false"}"
    >
      <nav class="pagination" data-pagination-full role="navigation" aria-label="${t("paginationNav", lang)}">
        ${renderPaginationLinks({ page, totalPages, lang, getPageHref, items: fullItems })}
      </nav>
      ${hasResponsiveVariants
        ? html`
            <nav class="pagination" data-pagination-compact role="navigation" aria-label="${t("paginationNav", lang)}">
              ${renderPaginationLinks({ page, totalPages, lang, getPageHref, items: compactItems })}
            </nav>
            <nav class="pagination" data-pagination-minimal role="navigation" aria-label="${t("paginationNav", lang)}">
              ${renderPaginationLinks({ page, totalPages, lang, getPageHref, items: minimalItems })}
            </nav>
            <div class="pagination pagination-measure" data-pagination-measure-full aria-hidden="true">
              ${renderPaginationLinks({ page, totalPages, lang, getPageHref, items: fullItems })}
            </div>
            <div class="pagination pagination-measure" data-pagination-measure-compact aria-hidden="true">
              ${renderPaginationLinks({ page, totalPages, lang, getPageHref, items: compactItems })}
            </div>
          `
        : html``}
    </div>
  `;
};

const renderManagedPosts = (posts: PostListRow[], lang: Lang, accessUser: AccessUser, redirectTo: string, emptyLabel: string) => {
  if (posts.length === 0) {
    return renderNotice(emptyLabel);
  }

  return html`${posts.map((post) => {
    const canEdit = canEditOwnPost(accessUser, post.author_id);
    const canDelete = canDeletePost(accessUser);

    return html`
      <article class="Box mb-3">
        <div class="Box-body">
          <div class="action-card-row">
            <div class="action-card-main">
              <h3 class="h4 mb-1">
                <a href="/posts/${post.id}" class="text-bold color-fg-default action-card-title-link">${post.title || t("untitled", lang)}</a>
              </h3>
              <div class="f6 text-gray action-card-meta">
                <span>${t("author", lang)} ${post.author_name ?? getUnknownAuthorLabel(lang)}</span>
                <span>${t("published", lang)} ${formatDate(post.timestamp, lang)}</span>
                ${post.is_draft ? html`<span class="text-bold">${t("draft", lang)}</span>` : html``}
                ${post.is_private ? html`<span class="text-bold">${t("privatePostBadge", lang)}</span>` : html``}
              </div>
            </div>
            <div class="action-card-actions">
              ${canEdit
                ? html`
                    <a href="/post/${post.id}/edit" class="btn">${t("editAction", lang)}</a>
                  `
                : html``}
              ${canDelete
                ? html`
                    ${renderDeleteConfirmation({
                      lang,
                      actionPath: `/admin/posts/${post.id}/delete`,
                      redirectTo,
                      triggerLabel: t("deletePostAction", lang)
                    })}
                  `
                : html``}
            </div>
          </div>
        </div>
      </article>
    `;
  })}`;
};

const renderCommentCards = (
  comments: CommentRow[],
  lang: Lang,
  accessUser: AccessUser,
  redirectTo: string,
  emptyLabel: string,
  showPostLink: boolean
) => {
  if (comments.length === 0) {
    return renderNotice(emptyLabel);
  }

  return html`${comments.map((comment) => {
    const canDelete = canDeleteComment(accessUser, comment.user_id);

    return html`
      <article class="Box mb-3">
        <div class="Box-body">
          <div class="action-card-row comment-card-row">
            <div class="action-card-main">
              <div class="action-card-meta f6 text-gray">
                <span>${comment.name || t("anonymous", lang)}</span>
                <span>${formatDate(comment.timestamp, lang)}</span>
                ${showPostLink && comment.post_id
                  ? html`
                      <a href="/posts/${comment.post_id}" class="action-card-title-link text-bold color-fg-default">${comment.post_title || t("untitled", lang)}</a>
                    `
                  : html``}
              </div>
              <div class="comment-card-body f5 color-fg-default">${comment.body ?? ""}</div>
            </div>
            ${canDelete
              ? html`
                  <div class="action-card-actions comment-card-actions">
                    ${renderDeleteConfirmation({
                      lang,
                      actionPath: `/comments/${comment.id}/delete`,
                      redirectTo,
                      triggerLabel: t("deleteAction", lang)
                    })}
                  </div>
                `
              : html``}
          </div>
        </div>
      </article>
    `;
  })}`;
};

const renderUserCards = (
  users: UserRow[],
  lang: Lang,
  accessUser: AccessUser,
  adminEmails: Set<string>,
  redirectTo: string
) => {
  if (users.length === 0) {
    return renderNotice(t("noAccounts", lang));
  }

  return html`${users.map((user) => {
    const isAdminAccount = Boolean(user.email && adminEmails.has(normalizeEmail(user.email)));
    const canManage = canManageUser(accessUser, user.id, isAdminAccount);
    const isBlocked = Boolean(user.is_blocked);

    return html`
      <article class="Box mb-3">
        <div class="Box-body">
          <div class="d-flex flex-justify-between flex-items-start flex-wrap">
            <div class="mr-3 mb-2">
              <h3 class="h4 mb-1">${user.username || user.email || `#${user.id}`}</h3>
              <div class="f6 text-gray">
                <span class="mr-3 mb-1 d-inline-block">${t("email", lang)} ${user.email || "-"}</span>
                <span class="mr-3 mb-1 d-inline-block">${t("role", lang)} ${isAdminAccount ? t("roleAdmin", lang) : t("roleUser", lang)}</span>
                <span class="mr-3 mb-1 d-inline-block">${t("status", lang)} ${isBlocked ? t("statusBlocked", lang) : t("statusActive", lang)}</span>
              </div>
            </div>
            ${canManage
              ? html`
                  <div class="d-flex flex-items-center flex-wrap">
                    <form method="post" action="/admin/users/${user.id}/${isBlocked ? "unblock" : "block"}" class="mr-2 mb-2">
                      <input type="hidden" name="redirectTo" value="${redirectTo}" />
                      <button type="submit" class="btn">${isBlocked ? t("unblockAction", lang) : t("blockAction", lang)}</button>
                    </form>
                    <div class="mb-2">${renderDeleteConfirmation({
                      lang,
                      actionPath: `/admin/users/${user.id}/delete`,
                      redirectTo,
                      triggerLabel: t("deleteUserAction", lang)
                    })}</div>
                  </div>
                `
              : html``}
          </div>
        </div>
      </article>
    `;
  })}`;
};

const renderPostPageBody = ({
  post,
  comments,
  lang,
  currentUser,
  accessUser,
  renderedTitle,
  renderedBody,
  translationNotice,
  commentError,
  commentValue
}: {
  post: PostDetailRow;
  comments: CommentRow[];
  lang: Lang;
  currentUser: CurrentUser | null;
  accessUser: AccessUser;
  renderedTitle: string | null;
  renderedBody: string;
  translationNotice?: ReturnType<typeof html>;
  commentError?: string;
  commentValue?: string;
}) => {
  const contentHtml = renderMarkdown(renderedBody);

  return html`
    <article class="Box box-shadow mb-4">
      <div class="Box-header">
        <div class="action-card-row">
          <div class="action-card-main">
            <h1 class="h1 mb-2">${renderedTitle || t("untitled", lang)}</h1>
            <div class="f5 text-gray action-card-meta">
              ${renderPostTagLabels(post.tag)}
              <span>${renderHomeAuthorText(post.author_id, post.author_name, lang)}</span>
              <span>@ ${formatDate(post.timestamp, lang)}</span>
              ${post.is_draft ? html`<span class="text-bold">${t("draft", lang)}</span>` : html``}
              ${renderPrivateBadge(post.is_private, lang)}
            </div>
          </div>
          ${accessUser?.isAdmin
            ? html`
                <div class="action-card-actions">
                  ${canEditOwnPost(accessUser, post.author_id)
                    ? html`<a href="/post/${post.id}/edit" class="btn">${t("editAction", lang)}</a>`
                    : html``}
                  ${canDeletePost(accessUser)
                    ? html`
                        ${renderDeleteConfirmation({
                          lang,
                          actionPath: `/admin/posts/${post.id}/delete`,
                          redirectTo: `/posts/${post.id}`,
                          triggerLabel: t("deletePostAction", lang)
                        })}
                      `
                    : html``}
                </div>
              `
            : html``}
        </div>
      </div>
      <div class="Box-body">
        ${translationNotice ?? html``}
        <div class="markdown-body mt-3">${raw(contentHtml)}</div>
      </div>
    </article>

    <div class="d-flex flex-justify-between flex-items-center mb-3">
      <h2 class="h3 mb-0">${t("comments", lang)} (${comments.length})</h2>
    </div>

    ${commentError ? renderNotice(commentError) : html``}

    ${currentUser
      ? html`
          <div class="Box box-shadow mb-4">
            <div class="Box-body">
              <form method="post" action="/posts/${post.id}/comments">
                <div class="mb-3">
                  <label class="d-block text-bold mb-2" for="comment-body">${t("addComment", lang)}</label>
                  <textarea id="comment-body" name="body" class="form-control width-full" rows="5" maxlength="${MAX_COMMENT_LENGTH}" required>${commentValue || ""}</textarea>
                </div>
                <button type="submit" class="btn btn-primary">${t("submitComment", lang)}</button>
              </form>
            </div>
          </div>
        `
      : html`
          <div class="Box box-shadow mb-4">
            <div class="Box-body">
              <p class="mb-2">${t("commentLoginPrompt", lang)}</p>
              <p class="mb-0">
                <a href="/login?next=/posts/${post.id}" class="mr-3">${t("login", lang)}</a>
                <a href="/signup?next=/posts/${post.id}">${t("signup", lang)}</a>
              </p>
            </div>
          </div>
        `}

    ${renderCommentCards(comments, lang, accessUser, `/posts/${post.id}`, t("noComments", lang), false)}
  `;
};

const renderAuthPageBody = ({
  mode,
  lang,
  emailValue,
  usernameValue,
  nextPath,
  error
}: {
  mode: "login" | "signup";
  lang: Lang;
  emailValue?: string;
  usernameValue?: string;
  nextPath: string;
  error?: string;
}) => {
  const isLogin = mode === "login";

  return html`
    <div class="d-flex flex-justify-between flex-items-center mb-4 flex-wrap">
      <h1 class="h2 mb-2">${isLogin ? t("loginTitle", lang) : t("signupTitle", lang)}</h1>
      <p class="mb-2 f6 text-gray">
        ${isLogin ? t("needAccountPrompt", lang) : t("haveAccountPrompt", lang)}
        <a href="${isLogin ? `/signup?next=${encodeURIComponent(nextPath)}` : `/login?next=${encodeURIComponent(nextPath)}`}">
          ${isLogin ? t("signup", lang) : t("login", lang)}
        </a>
      </p>
    </div>
    ${error ? renderNotice(error) : html``}
    <div class="Box box-shadow">
      <div class="Box-body">
        <form method="post" action="/${mode}">
          <input type="hidden" name="next" value="${nextPath}" />
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="email">${t("email", lang)}</label>
            <input id="email" name="email" type="email" class="form-control" maxlength="64" autocomplete="username" required value="${emailValue || ""}" />
          </div>
          ${isLogin
            ? html``
            : html`
                <div class="mb-3">
                  <label class="d-block text-bold mb-2" for="username">${t("username", lang)}</label>
                  <input id="username" name="username" type="text" class="form-control" maxlength="64" required value="${usernameValue || ""}" />
                </div>
              `}
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="password">${t("password", lang)}</label>
            <input id="password" name="password" type="password" class="form-control" maxlength="128" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />
          </div>
          <button type="submit" class="btn btn-primary">${isLogin ? t("loginSubmit", lang) : t("signupSubmit", lang)}</button>
        </form>
      </div>
    </div>
  `;
};

const renderPostEditorBody = ({
  lang,
  mode,
  error,
  titleValue,
  bodyValue,
  tagValue,
  isDraft,
  visibility,
  actionPath,
  selectedSourceLang,
  detectedSourceLang,
  translationSection
}: {
  lang: Lang;
  mode: "create" | "edit";
  error?: string;
  titleValue?: string;
  bodyValue?: string;
  tagValue?: string;
  isDraft: boolean;
  visibility: "public" | "private";
  actionPath: string;
  selectedSourceLang: Lang;
  detectedSourceLang: Lang | null;
  translationSection?: ReturnType<typeof html>;
}) => {
  return html`
    <div class="d-flex flex-justify-between flex-items-center mb-4 flex-wrap">
      <h1 class="h2 mb-2">${mode === "create" ? t("createPostTitle", lang) : t("editPostTitle", lang)}</h1>
    </div>
    ${error ? renderNotice(error) : html``}
    <div class="Box box-shadow">
      <div class="Box-body">
        <form method="post" action="${actionPath}">
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="title">${t("postTitleLabel", lang)}</label>
            <input id="title" name="title" type="text" class="form-control width-full" maxlength="200" value="${titleValue || ""}" />
          </div>
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="tag">${t("postTagsLabel", lang)} <span class="text-normal text-italic f6 text-gray">${t("postTagsHint", lang)}</span></label>
            <input id="tag" name="tag" type="text" class="form-control width-full" maxlength="200" required value="${tagValue || ""}" />
          </div>
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="visibility">${t("postVisibilityLabel", lang)}</label>
            <select id="visibility" name="visibility" class="form-select width-full">
              <option value="public" ${visibility === "public" ? "selected" : ""}>${t("postVisibilityPublic", lang)}</option>
              <option value="private" ${visibility === "private" ? "selected" : ""}>${t("postVisibilityPrivate", lang)}</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="d-inline-flex flex-items-center" for="is-draft">
              <input id="is-draft" name="isDraft" type="checkbox" ${isDraft ? "checked" : ""} />
              <span class="ml-2">${t("postDraftLabel", lang)}</span>
            </label>
          </div>
          <div class="mb-3">
            <label class="d-block text-bold mb-2" for="source-lang">${t("postSourceLanguageLabel", lang)}</label>
            <select id="source-lang" name="sourceLang" class="form-select width-full">
              ${siteLanguages.map((language) => html`<option value="${language}" ${selectedSourceLang === language ? "selected" : ""}>${t(getLanguageLabelKey(language), lang)}</option> `)}
            </select>
            <p class="f6 text-gray mt-2 mb-0">${t("postSourceLanguageHint", lang)} ${t("postSourceLanguageDetected", lang)}: ${getLanguageLabel(detectedSourceLang, lang)}</p>
          </div>
          <div class="mb-3 post-editor-breakout-shell">
            <div class="post-editor-breakout" data-post-editor-root>
              <div class="d-flex flex-justify-between flex-items-center mb-2 flex-wrap">
                <p class="f6 text-gray mb-0">${t("postEditorLiveHint", lang)}</p>
              </div>
              <div class="BtnGroup post-editor-mobile-toggle" aria-label="${t("postBodyLabel", lang)}">
                <button type="button" class="btn BtnGroup-item btn-primary" data-post-editor-switch="input" aria-pressed="true">
                  ${t("postEditorMarkdownTab", lang)}
                </button>
                <button type="button" class="btn BtnGroup-item" data-post-editor-switch="preview" aria-pressed="false">
                  ${t("postEditorPreviewTab", lang)}
                </button>
              </div>
              <div class="post-editor-grid">
                <section class="post-editor-pane" data-post-editor-pane="input">
                  <div class="Box color-bg-default post-editor-panel">
                    <div class="Box-header d-flex flex-items-center">
                      <label class="text-bold mb-0" for="body">${t("postEditorMarkdownTab", lang)}</label>
                    </div>
                    <div class="Box-body post-editor-pane-body">
                      <textarea id="body" name="body" class="form-control width-full post-editor-input" rows="18" required data-post-editor-input>${bodyValue || ""}</textarea>
                    </div>
                  </div>
                </section>
                <section class="post-editor-pane" data-post-editor-pane="preview">
                  <div class="Box color-bg-default post-editor-panel">
                    <div class="Box-header d-flex flex-items-center">
                      <h2 class="h4 mb-0">${t("postEditorPreviewTab", lang)}</h2>
                    </div>
                    <div class="Box-body post-editor-pane-body">
                      <div class="markdown-body post-editor-preview-frame" data-post-editor-preview data-post-editor-empty-state="${t("postEditorPreviewEmpty", lang)}"></div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">${t("savePost", lang)}</button>
        </form>
      </div>
    </div>
    ${translationSection ?? html``}
    <script src="/static/post-editor-preview.js" defer></script>
  `;
};

const getPostEditorTranslationNotice = (value: string | undefined, lang: Lang) => {
  switch (value) {
    case "queued":
      return t("translationGenerateQueued", lang);
    case "ready":
      return t("translationReadyNotice", lang);
    case "saved":
      return t("translationSavedNotice", lang);
    default:
      return undefined;
  }
};

const renderEditPostPage = <TBindings extends Record<string, unknown>>({
  c,
  options,
  post,
  titleValue,
  tagValue,
  bodyValue,
  selectedSourceLang,
  detectedSourceLang,
  translation,
  translationSourceLang,
  translationError,
  translationNotice,
  status,
  error,
  isDraft,
  visibility
}: {
  c: Context<AppEnv<TBindings>>;
  options: AppOptions<TBindings>;
  post: PostDetailRow;
  titleValue: string;
  tagValue: string;
  bodyValue: string;
  selectedSourceLang: Lang;
  detectedSourceLang: Lang | null;
  translation: PostTranslationRow | null;
  translationSourceLang?: Lang;
  translationError?: string;
  translationNotice?: string;
  status?: 200 | 400 | 403;
  error?: string;
  isDraft: boolean;
  visibility: "public" | "private";
}) => {
  const site = options.getSite(c);
  const lang = c.get("lang");

  return c.html(
    renderLayout({
      title: t("editPostTitle", lang),
      description: site.siteDescription,
      site,
      isAdmin: c.get("isAdmin"),
      currentUser: c.get("currentUser"),
      lang,
      aboutPostId: c.get("aboutPostId"),
      toolsPostId: c.get("toolsPostId"),
      body: renderPostEditorBody({
        lang,
        mode: "edit",
        isDraft,
        visibility,
        titleValue,
        tagValue,
        bodyValue,
        error,
        actionPath: `/post/${post.id}/edit`,
        selectedSourceLang,
        detectedSourceLang,
        translationSection: renderPostTranslationSection({
          lang,
          postId: post.id,
          sourceLang: translationSourceLang ?? selectedSourceLang,
          detectedSourceLang,
          translation,
          error: translationError,
          notice: translationNotice
        })
      }),
      activePath: "/post"
    }),
    status
  );
};

export const createApp = <TBindings extends Record<string, unknown> = Record<string, unknown>>(
  options: AppOptions<TBindings>
) => {
  const app = new Hono<AppEnv<TBindings>>();

  app.use("*", async (c, next) => {
    const db = options.getDb(c);
    await db.ensureSchema();
    c.set("db", db);

    let lang = getCookie(c, "lang") as Lang | undefined;
    if (lang !== "en" && lang !== "zh") {
      lang = "zh";
    }
    c.set("lang", lang);

    const adminEmailSet = getAdminEmailSet(c, options);
    const adminOverride = options.getIsAdmin?.(c) ?? false;
    const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
    let currentUser: CurrentUser | null = null;

    if (sessionToken) {
      const tokenHash = await hashSessionToken(sessionToken);
      const sessionUser = await db.getSessionUserByTokenHash(tokenHash, new Date().toISOString());

      if (!sessionUser || sessionUser.is_blocked) {
        await db.deleteSessionByTokenHash(tokenHash);
        clearSessionCookie(c);
      } else {
        const email = sessionUser.email ?? "";
        currentUser = {
          id: sessionUser.id,
          email,
          username: sessionUser.username ?? email,
          isAdmin: adminEmailSet.has(normalizeEmail(email))
        };
      }
    }

    const isAdmin = Boolean(adminOverride || currentUser?.isAdmin);
    if (currentUser) {
      currentUser = { ...currentUser, isAdmin };
    }

    c.set("currentUser", currentUser);
    c.set("isAdmin", isAdmin);

    const [aboutPost, toolsPost] = await Promise.all([
      db.getPostByTitle("About", { includeDrafts: isAdmin, viewerId: currentUser?.id ?? null }),
      db.getPostByTitle("Tools", { includeDrafts: isAdmin, viewerId: currentUser?.id ?? null })
    ]);
    if (aboutPost) {
      c.set("aboutPostId", aboutPost.id);
    }
    if (toolsPost) {
      c.set("toolsPostId", toolsPost.id);
    }

    await next();
  });

  app.get("/api/lang", (c) => {
    const to = c.req.query("to");
    if (to === "en" || to === "zh") {
      setCookie(c, "lang", to, { path: "/", maxAge: 31536000 });
    }
    return c.redirect(getRefererReturnPath(c, "/", { allowAuthPages: true }));
  });

  app.get("/static/primer.css", (c) => {
    return c.text(primerCss, 200, {
      "content-type": "text/css; charset=utf-8"
    });
  });

  app.get("/static/post-editor-preview.js", (c) => {
    return c.text(postEditorPreviewScript, 200, {
      "content-type": "text/javascript; charset=utf-8"
    });
  });

  app.get("/favicon.ico", () => {
    return new Response(faviconIco, {
      headers: {
        "content-type": "image/x-icon",
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  });

  app.get("/login", (c) => {
    const currentUser = c.get("currentUser");
    if (currentUser) {
      return c.redirect("/account");
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const nextPath = getAuthNextPath(c, c.req.query("next"));

    return c.html(
      renderLayout({
        title: t("loginTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin: c.get("isAdmin"),
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderAuthPageBody({ mode: "login", lang, nextPath }),
        activePath: "/login"
      })
    );
  });

  app.post("/login", async (c) => {
    const currentUser = c.get("currentUser");
    if (currentUser) {
      return c.redirect("/account");
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const body = (await c.req.parseBody()) as FormBody;
    const loginValue = getTrimmedFormValue(body, "email");
    const emailValue = normalizeEmail(loginValue);
    const passwordValue = getRawFormValue(body, "password");
    const nextPath = getAuthNextPath(c, getTrimmedFormValue(body, "next"));

    if (!emailValue || !passwordValue) {
      return c.html(
        renderLayout({
          title: t("loginTitle", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderAuthPageBody({
            mode: "login",
            lang,
            nextPath,
            emailValue,
            error: t("loginRequired", lang)
          }),
          activePath: "/login"
        }),
        400
      );
    }

    const db = c.get("db");
    const user = (await db.getUserByEmail(emailValue)) ?? (loginValue ? await db.getUserByUsername(loginValue) : null);
    const isValidPassword = await verifyPassword(passwordValue, user?.password_hash);

    if (!user || user.is_blocked || !isValidPassword) {
      return c.html(
        renderLayout({
          title: t("loginTitle", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderAuthPageBody({
            mode: "login",
            lang,
            nextPath,
            emailValue,
            error: user?.is_blocked ? t("accountBlocked", lang) : t("invalidCredentials", lang)
          }),
          activePath: "/login"
        }),
        400
      );
    }

    const sessionToken = createSessionToken();
    const tokenHash = await hashSessionToken(sessionToken);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
    await db.createSession({
      userId: user.id,
      tokenHash,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
    setCookie(c, SESSION_COOKIE_NAME, sessionToken, getCookieOptions(c));

    return c.redirect(nextPath);
  });

  app.get("/signup", (c) => {
    const currentUser = c.get("currentUser");
    if (currentUser) {
      return c.redirect("/account");
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const nextPath = getAuthNextPath(c, c.req.query("next"));

    return c.html(
      renderLayout({
        title: t("signupTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin: c.get("isAdmin"),
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderAuthPageBody({ mode: "signup", lang, nextPath }),
        activePath: "/signup"
      })
    );
  });

  app.post("/signup", async (c) => {
    const currentUser = c.get("currentUser");
    if (currentUser) {
      return c.redirect("/account");
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const body = (await c.req.parseBody()) as FormBody;
    const emailValue = normalizeEmail(getTrimmedFormValue(body, "email"));
    const usernameValue = getTrimmedFormValue(body, "username");
    const passwordValue = getRawFormValue(body, "password");
    const nextPath = getAuthNextPath(c, getTrimmedFormValue(body, "next"));

    let error = "";

    if (!emailValue) {
      error = t("emailRequired", lang);
    } else if (!usernameValue) {
      error = t("usernameRequired", lang);
    } else if (!passwordValue) {
      error = t("passwordRequired", lang);
    } else if (passwordValue.length < MIN_PASSWORD_LENGTH) {
      error = t("passwordTooShort", lang);
    }

    if (error) {
      return c.html(
        renderLayout({
          title: t("signupTitle", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderAuthPageBody({
            mode: "signup",
            lang,
            nextPath,
            emailValue,
            usernameValue,
            error
          }),
          activePath: "/signup"
        }),
        400
      );
    }

    const db = c.get("db");

    try {
      const passwordHash = await hashPassword(passwordValue);
      const user = await db.createUser({
        email: emailValue,
        username: usernameValue,
        passwordHash
      });

      const sessionToken = createSessionToken();
      const tokenHash = await hashSessionToken(sessionToken);
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
      await db.createSession({
        userId: user.id,
        tokenHash,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      });
      setCookie(c, SESSION_COOKIE_NAME, sessionToken, getCookieOptions(c));

      return c.redirect(nextPath);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message.toLowerCase() : "";
      const duplicateMessage = message.includes("username") ? t("usernameExists", lang) : t("emailExists", lang);

      return c.html(
        renderLayout({
          title: t("signupTitle", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderAuthPageBody({
            mode: "signup",
            lang,
            nextPath,
            emailValue,
            usernameValue,
            error: duplicateMessage
          }),
          activePath: "/signup"
        }),
        400
      );
    }
  });

  app.get("/logout", async (c) => {
    const db = c.get("db");
    const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
    if (sessionToken) {
      const tokenHash = await hashSessionToken(sessionToken);
      await db.deleteSessionByTokenHash(tokenHash);
    }
    clearSessionCookie(c);
    return c.redirect("/");
  });

  app.get("/", async (c) => {
    const db = c.get("db");
    const isAdmin = c.get("isAdmin");
    const lang = c.get("lang");
    const site = options.getSite(c);
    const currentUser = c.get("currentUser");
    const viewerId = currentUser?.id ?? null;
    const page = getPositiveIntegerQueryValue(c.req.query("page")) ?? 1;
    const authorId = getPositiveIntegerQueryValue(c.req.query("authorId"));
    const tag = normalizeTagFilterValue(c.req.query("tag"));
    const offset = (page - 1) * PAGE_SIZE;
    const paginationParams = new URLSearchParams();
    if (authorId !== null) {
      paginationParams.set("authorId", String(authorId));
    }
    if (tag) {
      paginationParams.set("tag", tag);
    }
    const paginationBasePath = paginationParams.size > 0 ? `/?${paginationParams.toString()}` : "/";

    const [posts, total, selectedAuthor] = await Promise.all([
      db.listPosts({ includeDrafts: isAdmin, limit: PAGE_SIZE, offset, authorId, tag, viewerId }),
      db.countPosts({ includeDrafts: isAdmin, authorId, tag, viewerId }),
      authorId !== null ? db.getUserById(authorId) : Promise.resolve(null)
    ]);
    const postTitleDisplays = await Promise.all(
      posts.map(async (post) => {
        const sourceLang = post.source_lang && isLang(post.source_lang) ? post.source_lang : "zh";
        if (sourceLang === lang) {
          return { postId: post.id, title: post.title };
        }

        const translation = await db.getPostTranslation(post.id, lang);
        if (translation?.status === "completed" && translation.translated_title) {
          return { postId: post.id, title: translation.translated_title };
        }

        return { postId: post.id, title: post.title };
      })
    );
    const postTitleDisplayMap = new Map(postTitleDisplays.map((entry) => [entry.postId, entry.title]));

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const selectedAuthorName = authorId !== null
      ? selectedAuthor?.username ?? posts.find((post) => post.author_id === authorId)?.author_name ?? getUnknownAuthorLabel(lang)
      : null;

    const body = html`
      <style>
        .post-title-link {
          text-decoration: none;
          display: block;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .post-title-link:hover {
          text-decoration: underline dashed !important;
        }
      </style>
      ${renderHomeSectionNav("posts", lang)}
      ${renderHomeSelectedFilters({
        selectedTag: tag,
        selectedAuthorName,
        lang
      })}
      ${posts.length === 0
        ? renderNotice(t("noPosts", lang))
        : html`
            ${posts.map((post) =>
              html`<article class="Box box-shadow mb-3">
                <div class="Box-body">
                  <h2 class="h3 mb-2">
                    <a href="/posts/${post.id}" class="text-bold color-fg-default post-title-link" title="${postTitleDisplayMap.get(post.id) || post.title || t("untitled", lang)}">${postTitleDisplayMap.get(post.id) || post.title || t("untitled", lang)}</a>
                  </h2>
                  <div class="f6 text-gray">
                    ${renderPostTagLabels(post.tag)}
                    <span class="mr-3 mb-1 d-inline-block">${renderHomeAuthorText(post.author_id, post.author_name, lang)}</span>
                    <span class="mr-3 mb-1 d-inline-block">@ ${formatDate(post.timestamp, lang)}</span>
                    ${post.is_draft ? html`<span class="mr-3 mb-1 d-inline-block text-bold">${t("draft", lang)}</span>` : html``}
                    ${renderPrivateBadge(post.is_private, lang)}
                  </div>
                </div>
              </article>`
            )}
          `}
      ${renderPagination(paginationBasePath, page, totalPages, lang)}
    `;

    return c.html(
      renderLayout({
        title: site.siteName,
        description: site.siteDescription,
        site,
        isAdmin,
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body,
        activePath: "/"
      })
    );
  });

  app.get("/labels", async (c) => {
    const db = c.get("db");
    const isAdmin = c.get("isAdmin");
    const lang = c.get("lang");
    const site = options.getSite(c);
    const currentUser = c.get("currentUser");
    const tagRows = await db.listPostTags(isAdmin, currentUser?.id ?? null);

    const labelCounts = new Map<string, number>();
    for (const row of tagRows) {
      for (const tag of displayTagValues(row.tag)) {
        labelCounts.set(tag, (labelCounts.get(tag) ?? 0) + 1);
      }
    }

    const labels = Array.from(labelCounts.entries())
      .map(([tag, postCount]) => ({ tag, postCount }))
      .sort((left, right) => left.tag.localeCompare(right.tag));

    return c.html(
      renderLayout({
        title: t("labelsTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin,
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderLabelDirectory(labels, lang),
        activePath: "/labels"
      })
    );
  });

  app.get("/authors", async (c) => {
    const db = c.get("db");
    const isAdmin = c.get("isAdmin");
    const lang = c.get("lang");
    const site = options.getSite(c);
    const currentUser = c.get("currentUser");
    const authors = await db.listAuthors(isAdmin, currentUser?.id ?? null);

    return c.html(
      renderLayout({
        title: t("authorsTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin,
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderAuthorDirectory(authors, lang),
        activePath: "/authors"
      })
    );
  });

  app.get("/posts/:id", async (c) => {
    const db = c.get("db");
    const isAdmin = c.get("isAdmin");
    const lang = c.get("lang");
    const site = options.getSite(c);
    const currentUser = c.get("currentUser");
    const postId = Number(c.req.param("id"));

    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    const post = await db.getPostById(postId, { includeDrafts: isAdmin, viewerId: currentUser?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    const sourceLang = post.source_lang && isLang(post.source_lang) ? post.source_lang : "zh";
    const viewMode = c.req.query("view") === "original" ? "original" : "translation";
    const preferredTranslation = lang !== sourceLang ? await db.getPostTranslation(postId, lang) : null;
    const canRenderTranslation = preferredTranslation?.status === "completed" && Boolean(preferredTranslation.translated_body);
    const shouldUseTranslation = lang !== sourceLang && viewMode !== "original" && canRenderTranslation;
    const translatedNoticeKey = preferredTranslation?.is_machine_translation === 0 ? "translatedPostEditedNotice" : "translatedPostNotice";
    const renderedTitle = shouldUseTranslation
      ? formatTranslatedPostTitle({
          translatedTitle: preferredTranslation?.translated_title ?? null,
          originalTitle: post.title,
          lang
        })
      : post.title;
    const renderedBody = shouldUseTranslation ? preferredTranslation?.translated_body ?? post.body ?? "" : post.body ?? "";
    const comments = await db.listComments(postId);
    const accessUser = getAccessUser(c);
    const translationNotice = lang !== sourceLang && canRenderTranslation
      ? html`
          <div class="flash flash-warn mb-3">
            <div class="d-flex flex-justify-between flex-items-center flex-wrap">
              <span>${t(shouldUseTranslation ? translatedNoticeKey : "originalPostNotice", lang)}</span>
              <span class="mt-2 mt-sm-0">
                ${shouldUseTranslation
                  ? html`<a href="${buildPostViewHref(post.id, "original")}" class="btn btn-sm">${t("readOriginalPost", lang)}</a>`
                  : html`<a href="${buildPostViewHref(post.id, "translation")}" class="btn btn-sm">${t("readTranslatedPost", lang)}</a>`}
              </span>
            </div>
          </div>
        `
      : undefined;

    return c.html(
      renderLayout({
        title: renderedTitle || site.siteName,
        description: site.siteDescription,
        site,
        isAdmin,
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderPostPageBody({
          post,
          comments,
          lang,
          currentUser,
          accessUser,
          renderedTitle,
          renderedBody,
          translationNotice
        }),
        activePath: "/posts/" + post.id
      })
    );
  });

  app.post("/posts/:id/comments", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "user")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const isAdmin = c.get("isAdmin");
    const lang = c.get("lang");
    const site = options.getSite(c);
    const currentUser = c.get("currentUser");
    const postId = Number(c.req.param("id"));

    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    const post = await db.getPostById(postId, { includeDrafts: isAdmin, viewerId: currentUser?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    const body = (await c.req.parseBody()) as FormBody;
    const commentValue = getTrimmedFormValue(body, "body");

    if (!commentValue) {
      const comments = await db.listComments(postId);
      return c.html(
        renderLayout({
          title: post.title || site.siteName,
          description: site.siteDescription,
          site,
          isAdmin,
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderPostPageBody({
            post,
            comments,
            lang,
            currentUser,
            accessUser,
            renderedTitle: post.title,
            renderedBody: post.body ?? "",
            commentError: t("commentRequired", lang),
            commentValue
          }),
          activePath: "/posts/" + post.id
        }),
        400
      );
    }

    await db.createComment({
      postId,
      name: currentUser?.username || t("anonymous", lang),
      body: commentValue.slice(0, MAX_COMMENT_LENGTH),
      isUser: true,
      userId: currentUser?.id ?? null,
      timestamp: new Date().toISOString()
    });

    return c.redirect(`/posts/${postId}`);
  });

  app.post("/comments/:id/delete", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "user")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const commentId = Number(c.req.param("id"));
    if (Number.isNaN(commentId)) {
      return c.notFound();
    }

    const comment = await db.getCommentById(commentId);
    if (!comment) {
      return c.notFound();
    }

    if (!canDeleteComment(accessUser, comment.user_id)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/account"
        }),
        403
      );
    }

    await db.deleteComment(commentId);

    const body = (await c.req.parseBody()) as FormBody;
    const redirectTo = sanitizeNextPath(getTrimmedFormValue(body, "redirectTo"), comment.post_id ? `/posts/${comment.post_id}` : "/account");
    return c.redirect(redirectTo);
  });

  app.get("/account", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "user")) {
      return redirectToLogin(c, "/account");
    }

    const db = c.get("db");
    const site = options.getSite(c);
    const lang = c.get("lang");
    const currentUser = c.get("currentUser");
    const adminEmails = getAdminEmailSet(c, options);

    if (!currentUser) {
      return redirectToLogin(c, "/account");
    }

    const userComments = await db.listUserComments(currentUser.id);

    const body = html`
      <div class="mb-4">
        <h1 class="h2 mb-2">${t("accountTitle", lang)}</h1>
      </div>

      <section class="Box box-shadow mb-4">
        <div class="Box-header">
          <h2 class="h3 mb-0">${t("accountInfo", lang)}</h2>
        </div>
        <div class="Box-body pt-3">
          <div class="f5 text-gray">
            <div class="mb-2"><span class="text-bold color-fg-default">${t("email", lang)}</span> ${currentUser.email}</div>
            <div class="mb-2"><span class="text-bold color-fg-default">${t("username", lang)}</span> ${currentUser.username}</div>
            <div><span class="text-bold color-fg-default">${t("role", lang)}</span> ${currentUser.isAdmin ? t("roleAdmin", lang) : t("roleUser", lang)}</div>
          </div>
        </div>
      </section>

      <section class="mb-4">
        <div class="d-flex flex-justify-between flex-items-center mb-3">
          <h2 class="h3 mb-0">${t("yourComments", lang)}</h2>
        </div>
        ${renderCommentCards(userComments, lang, accessUser, "/account", t("noUserComments", lang), true)}
      </section>
    `;

    return c.html(
      renderLayout({
        title: t("accountTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin: currentUser.isAdmin,
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body,
        activePath: "/account"
      })
    );
  });

  app.get("/post", (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c, "/post");
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const currentUser = c.get("currentUser");

    return c.html(
      renderLayout({
        title: t("createPostTitle", lang),
        description: site.siteDescription,
        site,
        isAdmin: c.get("isAdmin"),
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body: renderPostEditorBody({ lang, mode: "create", isDraft: false, visibility: "public", actionPath: "/post", selectedSourceLang: lang, detectedSourceLang: null }),
        activePath: "/post"
      })
    );
  });

  app.post("/post", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const site = options.getSite(c);
    const lang = c.get("lang");
    const currentUser = c.get("currentUser");
    const body = (await c.req.parseBody()) as FormBody;
    const titleValue = getTrimmedFormValue(body, "title");
    const tagValue = getTrimmedFormValue(body, "tag");
    const postBodyValue = getRawFormValue(body, "body").trim();
    const detectedSourceLang = detectPostSourceLanguage(titleValue, postBodyValue);
    const sourceLang = getSourceLanguageValue(body, detectedSourceLang, lang);
    const draft = isChecked(body, "isDraft");
    const visibility = getPostVisibilityValue(body);
    const error = !tagValue ? t("postTagRequired", lang) : !postBodyValue ? t("postBodyRequired", lang) : null;

    if (error || !currentUser) {
      return c.html(
        renderLayout({
          title: t("createPostTitle", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser,
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderPostEditorBody({
            lang,
            mode: "create",
            isDraft: draft,
            visibility,
            titleValue,
            tagValue,
            bodyValue: postBodyValue,
            error: error ?? t("postBodyRequired", lang),
            actionPath: "/post",
            selectedSourceLang: sourceLang,
            detectedSourceLang
          }),
          activePath: "/post"
        }),
        400
      );
    }

    const db = c.get("db");
    const newPostId = await db.createPost({
      title: titleValue || null,
      body: postBodyValue,
      timestamp: new Date().toISOString(),
      authorId: currentUser.id,
      sourceLang,
      tag: buildTagValue(tagValue, draft) ?? DEFAULT_POST_TAG,
      isPrivate: visibility === "private"
    });

    return c.redirect(`/posts/${newPostId}`);
  });

  app.get("/post/:id/edit", async (c) => {
    const accessUser = getAccessUser(c);
    const postId = Number(c.req.param("id"));
    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c, `/post/${postId}/edit`);
    }

    const db = c.get("db");
    const post = await db.getPostById(postId, { includeDrafts: true, viewerId: c.get("currentUser")?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    if (!canEditOwnPost(accessUser, post.author_id)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/post"
        }),
        403
      );
    }

    const lang = c.get("lang");
    const detectedSourceLang = detectPostSourceLanguage(post.title ?? "", post.body ?? "");
    const selectedSourceLang = getStoredSourceLanguage(post.source_lang, lang);
    const translationNotice = getPostEditorTranslationNotice(c.req.query("translation"), lang);
    const translation = await db.getPostTranslation(post.id, getTranslationTargetLanguage(selectedSourceLang));

    return renderEditPostPage({
      c,
      options,
      post,
      titleValue: post.title || "",
      tagValue: tagInputValue(post.tag),
      bodyValue: post.body ?? "",
      selectedSourceLang,
      detectedSourceLang,
      translation,
      translationNotice,
      isDraft: isDraftTag(post.tag),
      visibility: post.is_private ? "private" : "public"
    });
  });

  app.post("/post/:id/edit", async (c) => {
    const accessUser = getAccessUser(c);
    const postId = Number(c.req.param("id"));
    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const post = await db.getPostById(postId, { includeDrafts: true, viewerId: c.get("currentUser")?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    if (!canEditOwnPost(accessUser, post.author_id)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/post"
        }),
        403
      );
    }

    const lang = c.get("lang");
    const body = (await c.req.parseBody()) as FormBody;
    const titleValue = getTrimmedFormValue(body, "title");
    const tagValue = getTrimmedFormValue(body, "tag");
    const postBodyValue = getRawFormValue(body, "body").trim();
    const detectedSourceLang = detectPostSourceLanguage(titleValue, postBodyValue);
    const fallbackSourceLang = getStoredSourceLanguage(post.source_lang, lang);
    const sourceLang = getSourceLanguageValue(body, detectedSourceLang, fallbackSourceLang);
    const draft = isChecked(body, "isDraft");
    const visibility = getPostVisibilityValue(body);
    const error = !tagValue ? t("postTagRequired", lang) : !postBodyValue ? t("postBodyRequired", lang) : null;
    const translation = await db.getPostTranslation(postId, getTranslationTargetLanguage(fallbackSourceLang));

    if (error) {
      return renderEditPostPage({
        c,
        options,
        post,
        titleValue,
        tagValue,
        bodyValue: postBodyValue,
        selectedSourceLang: sourceLang,
        detectedSourceLang,
        translation,
        error,
        isDraft: draft,
        visibility,
        status: 400
      });
    }

    await db.updatePost({
      id: postId,
      title: titleValue || null,
      body: postBodyValue,
      sourceLang,
      tag: buildTagValue(tagValue, draft) ?? DEFAULT_POST_TAG,
      isPrivate: visibility === "private"
    });

    await markPostTranslationsStale({
      db,
      postId,
      title: titleValue || null,
      body: postBodyValue,
      sourceLang
    });

    return c.redirect(`/posts/${postId}`);
  });

  app.post("/post/:id/translation/generate", async (c) => {
    const accessUser = getAccessUser(c);
    const postId = Number(c.req.param("id"));
    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c, `/post/${postId}/edit`);
    }

    const db = c.get("db");
    const post = await db.getPostById(postId, { includeDrafts: true, viewerId: c.get("currentUser")?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    if (!canEditOwnPost(accessUser, post.author_id)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/post"
        }),
        403
      );
    }

    const lang = c.get("lang");
    const currentSourceLang = getStoredSourceLanguage(post.source_lang, lang);
    const detectedSourceLang = detectPostSourceLanguage(post.title ?? "", post.body ?? "");
    const body = (await c.req.parseBody()) as FormBody;
    const requestedSourceLang = getTrimmedFormValue(body, "sourceLang");
    const sourceLang = requestedSourceLang && isLang(requestedSourceLang) ? requestedSourceLang : detectedSourceLang;

    if (!sourceLang) {
      const translation = await db.getPostTranslation(postId, getTranslationTargetLanguage(currentSourceLang));
      return renderEditPostPage({
        c,
        options,
        post,
        titleValue: post.title || "",
        tagValue: tagInputValue(post.tag),
        bodyValue: post.body ?? "",
        selectedSourceLang: currentSourceLang,
        detectedSourceLang,
        translation,
        translationSourceLang: currentSourceLang,
        translationError: t("translationSourceLanguageRequired", lang),
        isDraft: isDraftTag(post.tag),
        visibility: post.is_private ? "private" : "public",
        status: 400
      });
    }

    if (sourceLang !== currentSourceLang) {
      await db.updatePost({
        id: postId,
        title: post.title ?? null,
        body: post.body ?? "",
        sourceLang,
        tag: post.tag ?? DEFAULT_POST_TAG,
        isPrivate: Boolean(post.is_private)
      });
    }

    const queuedCount = await syncPostTranslationState({
      c,
      db,
      postId,
      title: post.title ?? null,
      body: post.body ?? "",
      sourceLang,
      trigger: "update",
      options
    });

    return c.redirect(`/post/${postId}/edit?translation=${queuedCount > 0 ? "queued" : "ready"}`);
  });

  app.post("/post/:id/translation", async (c) => {
    const accessUser = getAccessUser(c);
    const postId = Number(c.req.param("id"));
    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c, `/post/${postId}/edit`);
    }

    const db = c.get("db");
    const post = await db.getPostById(postId, { includeDrafts: true, viewerId: c.get("currentUser")?.id ?? null });
    if (!post) {
      return c.notFound();
    }

    if (!canEditOwnPost(accessUser, post.author_id)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/post"
        }),
        403
      );
    }

    const lang = c.get("lang");
    const sourceLang = getStoredSourceLanguage(post.source_lang, lang);
    const detectedSourceLang = detectPostSourceLanguage(post.title ?? "", post.body ?? "");
    const targetLang = getTranslationTargetLanguage(sourceLang);
    const existingTranslation = await db.getPostTranslation(postId, targetLang);
    const body = (await c.req.parseBody()) as FormBody;
    const translatedTitle = getTrimmedFormValue(body, "translatedTitle") || null;
    const translatedBody = getRawFormValue(body, "translatedBody").trim();

    if (!translatedBody) {
      return renderEditPostPage({
        c,
        options,
        post,
        titleValue: post.title || "",
        tagValue: tagInputValue(post.tag),
        bodyValue: post.body ?? "",
        selectedSourceLang: sourceLang,
        detectedSourceLang,
        translation: existingTranslation
          ? {
              ...existingTranslation,
              translated_title: translatedTitle,
              translated_body: translatedBody
            }
          : null,
        translationError: t("postBodyRequired", lang),
        isDraft: isDraftTag(post.tag),
        visibility: post.is_private ? "private" : "public",
        status: 400
      });
    }

    await db.upsertPostTranslation({
      postId,
      lang: targetLang,
      translatedTitle,
      translatedBody,
      status: "completed",
      sourceHash: hashPostTranslationSource({
        title: post.title ?? null,
        body: post.body ?? "",
        sourceLang
      }),
      provider: "manual:editor",
      errorMessage: null,
      isMachineTranslation: false,
      translatedAt: new Date().toISOString()
    });

    return c.redirect(`/post/${postId}/edit?translation=saved`);
  });

  app.get("/admin", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c, "/admin");
    }

    const db = c.get("db");
    const site = options.getSite(c);
    const lang = c.get("lang");
    const currentUser = c.get("currentUser");
    const adminEmails = getAdminEmailSet(c, options);
    const requestedUsersPage = getPositiveIntegerQueryValue(c.req.query("usersPage")) ?? 1;
    const requestedCommentsPage = getPositiveIntegerQueryValue(c.req.query("commentsPage")) ?? 1;
    const [allComments, users] = await Promise.all([db.listAllComments(), db.listUsers()]);
    const totalUserPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    const totalCommentPages = Math.max(1, Math.ceil(allComments.length / PAGE_SIZE));
    const usersPage = Math.min(requestedUsersPage, totalUserPages);
    const commentsPage = Math.min(requestedCommentsPage, totalCommentPages);
    const paginatedUsers = users.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);
    const paginatedComments = allComments.slice((commentsPage - 1) * PAGE_SIZE, commentsPage * PAGE_SIZE);
    const usersPaginationParams = new URLSearchParams();
    const commentsPaginationParams = new URLSearchParams();

    if (commentsPage > 1) {
      usersPaginationParams.set("commentsPage", String(commentsPage));
    }

    if (usersPage > 1) {
      commentsPaginationParams.set("usersPage", String(usersPage));
    }

    const usersPaginationBasePath = usersPaginationParams.size > 0 ? `/admin?${usersPaginationParams.toString()}` : "/admin";
    const commentsPaginationBasePath = commentsPaginationParams.size > 0 ? `/admin?${commentsPaginationParams.toString()}` : "/admin";

    const body = html`
      <div class="mb-4">
        <h1 class="h2 mb-2">${t("adminDashboard", lang)}</h1>
      </div>

      <div class="Box box-shadow mb-4">
        <div class="Box-body">
          <p class="mb-0 text-gray">${t("adminDashboardHint", lang)}</p>
        </div>
      </div>

      <section class="mb-4">
        <div class="d-flex flex-justify-between flex-items-center mb-3">
          <h2 class="h3 mb-0">${t("allAccounts", lang)}</h2>
        </div>
        ${renderUserCards(paginatedUsers, lang, accessUser, adminEmails, "/admin")}
        ${renderPagination(usersPaginationBasePath, usersPage, totalUserPages, lang, "usersPage")}
      </section>

      <section>
        <div class="d-flex flex-justify-between flex-items-center mb-3">
          <h2 class="h3 mb-0">${t("allComments", lang)}</h2>
        </div>
        ${renderCommentCards(paginatedComments, lang, accessUser, "/admin", t("noComments", lang), true)}
        ${renderPagination(commentsPaginationBasePath, commentsPage, totalCommentPages, lang, "commentsPage")}
      </section>
    `;

    return c.html(
      renderLayout({
        title: t("adminDashboard", lang),
        description: site.siteDescription,
        site,
        isAdmin: c.get("isAdmin"),
        currentUser,
        lang,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body,
        activePath: "/admin"
      })
    );
  });

  app.post("/admin/posts/:id/delete", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const postId = Number(c.req.param("id"));
    if (Number.isNaN(postId)) {
      return c.notFound();
    }

    const db = c.get("db");
    await db.deletePost(postId);

    const body = (await c.req.parseBody()) as FormBody;
    const redirectTo = sanitizeNextPath(getTrimmedFormValue(body, "redirectTo"), "/admin");
    return c.redirect(redirectTo === `/posts/${postId}` ? "/admin" : redirectTo);
  });

  app.post("/admin/users/:id/block", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const targetUserId = Number(c.req.param("id"));
    if (Number.isNaN(targetUserId)) {
      return c.notFound();
    }

    const targetUser = await db.getUserById(targetUserId);
    if (!targetUser) {
      return c.notFound();
    }

    const adminEmails = getAdminEmailSet(c, options);
    const targetIsAdmin = Boolean(targetUser.email && adminEmails.has(normalizeEmail(targetUser.email)));
    if (!canManageUser(accessUser, targetUser.id, targetIsAdmin)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/account"
        }),
        403
      );
    }

    await db.updateUserBlocked(targetUser.id, true);
    await db.deleteSessionsByUserId(targetUser.id);

    const body = (await c.req.parseBody()) as FormBody;
    return c.redirect(sanitizeNextPath(getTrimmedFormValue(body, "redirectTo"), "/account"));
  });

  app.post("/admin/users/:id/unblock", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const targetUserId = Number(c.req.param("id"));
    if (Number.isNaN(targetUserId)) {
      return c.notFound();
    }

    const targetUser = await db.getUserById(targetUserId);
    if (!targetUser) {
      return c.notFound();
    }

    const adminEmails = getAdminEmailSet(c, options);
    const targetIsAdmin = Boolean(targetUser.email && adminEmails.has(normalizeEmail(targetUser.email)));
    if (!canManageUser(accessUser, targetUser.id, targetIsAdmin)) {
      const site = options.getSite(c);
      const lang = c.get("lang");
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/account"
        }),
        403
      );
    }

    await db.updateUserBlocked(targetUser.id, false);

    const body = (await c.req.parseBody()) as FormBody;
    return c.redirect(sanitizeNextPath(getTrimmedFormValue(body, "redirectTo"), "/account"));
  });

  app.post("/admin/users/:id/delete", async (c) => {
    const accessUser = getAccessUser(c);
    if (!hasAccess(accessUser, "admin")) {
      return redirectToLogin(c);
    }

    const db = c.get("db");
    const targetUserId = Number(c.req.param("id"));
    if (Number.isNaN(targetUserId)) {
      return c.notFound();
    }

    const targetUser = await db.getUserById(targetUserId);
    if (!targetUser) {
      return c.notFound();
    }

    const adminEmails = getAdminEmailSet(c, options);
    const targetIsAdmin = Boolean(targetUser.email && adminEmails.has(normalizeEmail(targetUser.email)));
    const site = options.getSite(c);
    const lang = c.get("lang");

    if (!canManageUser(accessUser, targetUser.id, targetIsAdmin)) {
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("notAuthorized", lang)),
          activePath: "/account"
        }),
        403
      );
    }

    const authoredPosts = await db.countPostsByAuthor(targetUser.id);
    if (authoredPosts > 0) {
      return c.html(
        renderLayout({
          title: t("notAuthorized", lang),
          description: site.siteDescription,
          site,
          isAdmin: c.get("isAdmin"),
          currentUser: c.get("currentUser"),
          lang,
          aboutPostId: c.get("aboutPostId"),
          toolsPostId: c.get("toolsPostId"),
          body: renderNotice(t("userHasPosts", lang)),
          activePath: "/account"
        }),
        400
      );
    }

    await db.deleteUser(targetUser.id);

    const body = (await c.req.parseBody()) as FormBody;
    return c.redirect(sanitizeNextPath(getTrimmedFormValue(body, "redirectTo"), "/account"));
  });

  app.notFound((c) => {
    const site = options.getSite(c);
    const lang = c.get("lang") || "zh";
    const currentUser = c.get("currentUser") || null;
    const body = html`
      <div class="Box box-shadow">
        <div class="Box-body">
          <p class="mb-0 text-gray">${t("pageNotFound", lang)}</p>
        </div>
      </div>
    `;
    return c.html(
      renderLayout({
        title: `404 | ${site.siteName}`,
        description: site.siteDescription,
        site,
        lang,
        isAdmin: c.get("isAdmin") || false,
        currentUser,
        aboutPostId: c.get("aboutPostId"),
        toolsPostId: c.get("toolsPostId"),
        body
      }),
      404
    );
  });

  return app;
};
