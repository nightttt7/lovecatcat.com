import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { SiteConfig } from "../config";
import { t, type Lang } from "../utils/i18n";

type LayoutUser = {
  username: string;
} | null;

export type LayoutProps = {
  title: string;
  description: string;
  site: SiteConfig;
  isAdmin: boolean;
  currentUser?: LayoutUser;
  lang?: Lang;
  aboutPostId?: number;
  body: string | HtmlEscapedString | Promise<string | HtmlEscapedString>;
  activePath?: string;
};

export const resolveResponsivePaginationMode = ({
  rootWidth,
  fullWidth,
  compactWidth,
  hasCompactPagination
}: {
  rootWidth: number;
  fullWidth: number;
  compactWidth: number;
  hasCompactPagination: boolean;
}) => {
  if (!hasCompactPagination) {
    return "full";
  }

  if (fullWidth <= rootWidth) {
    return "full";
  }

  return compactWidth <= rootWidth ? "compact" : "minimal";
};

export const renderLayout = ({ title, description, site, isAdmin, currentUser = null, lang = "zh", aboutPostId, body, activePath }: LayoutProps) => {
  const navLinks = site.navLinks.filter((link) => !link.requiresAdmin || isAdmin);
  const directoryLinks = [
    { href: "/labels", label: t("labels", lang), active: activePath === "/labels" },
    { href: "/authors", label: t("authors", lang), active: activePath === "/authors" }
  ];
  const getNavLabel = (label: string, labelKey?: keyof typeof import("../utils/i18n").translations["zh"]) => {
    return labelKey ? t(labelKey, lang) : label;
  };
  const authLinks = currentUser
    ? [
        { href: "/account", label: currentUser.username, active: activePath === "/account" },
        { href: "/logout", label: t("logout", lang), active: false }
      ]
    : [
        { href: "/login", label: t("login", lang), active: activePath === "/login" },
        { href: "/signup", label: t("signup", lang), active: activePath === "/signup" }
      ];
  const mobileMenuLinks = [
    ...navLinks.map((link) => ({
      href: link.href,
      label: getNavLabel(link.label, link.labelKey),
      active: activePath === link.href
    })),
    ...authLinks.map((link) => ({
      href: link.href,
      label: link.label,
      active: link.active
    })),
    {
      href: `/api/lang?to=${t("switchLangTo", lang)}`,
      label: t("switchLang", lang),
      active: false
    }
  ];

  return html`
    <!doctype html>
    <html lang="${t("langCode", lang)}" data-color-mode="light" data-light-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content=${description} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="stylesheet" href="/static/primer.css" />
        <style>
          html {
            scrollbar-gutter: stable;
          }

          .action-card-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .action-card-main {
            flex: 1 1 auto;
            min-width: 0;
          }

          .action-card-title-link,
          .action-card-main h1,
          .action-card-main h2,
          .action-card-main h3,
          .action-card-main a,
          .action-card-main span {
            overflow-wrap: anywhere;
            word-break: break-word;
          }

          .action-card-title-link {
            text-decoration: none;
          }

          .action-card-title-link:hover {
            text-decoration: underline dashed !important;
          }

          .action-card-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 0.25rem 0.75rem;
          }

          .action-card-meta > * {
            margin-right: 0 !important;
            margin-bottom: 0 !important;
          }

          .action-card-actions {
            flex: 0 0 auto;
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            white-space: nowrap;
          }

          .action-card-actions > * {
            margin-bottom: 0 !important;
          }

          .comment-card-row {
            align-items: center;
          }

          .comment-card-body {
            margin-top: 0.5rem;
          }

          .comment-card-actions {
            align-self: center;
          }

          .mobile-menu-summary {
            list-style: none;
          }

          .mobile-menu-summary::-webkit-details-marker {
            display: none;
          }

          .mobile-menu-panel {
            position: absolute;
            right: 0;
            top: calc(100% + 0.5rem);
            min-width: 12rem;
            z-index: 100;
          }

          .mobile-menu-link {
            display: block;
            padding: 0.625rem 0.75rem;
            color: var(--fgColor-default);
            text-decoration: none;
            white-space: nowrap;
          }

          .mobile-menu-link + .mobile-menu-link {
            border-top: var(--borderWidth-thin) solid var(--borderColor-muted);
          }

          .mobile-menu-link:hover {
            background: var(--bgColor-muted);
            text-decoration: none;
          }

          .mobile-menu-link[aria-current="page"] {
            font-weight: var(--base-text-weight-semibold, 600);
          }

          .pagination {
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.5rem;
          }

          .responsive-pagination .pagination > * {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          .responsive-pagination {
            position: relative;
          }

          .responsive-pagination[data-pagination-mode="compact"] [data-pagination-full] {
            display: none;
          }

          .responsive-pagination[data-pagination-mode="compact"] [data-pagination-compact] {
            display: flex;
          }

          .responsive-pagination[data-pagination-mode="compact"] [data-pagination-minimal] {
            display: none;
          }

          .responsive-pagination[data-pagination-mode="full"] [data-pagination-compact] {
            display: none;
          }

          .responsive-pagination[data-pagination-mode="full"] [data-pagination-minimal] {
            display: none;
          }

          .responsive-pagination[data-pagination-mode="minimal"] [data-pagination-full],
          .responsive-pagination[data-pagination-mode="minimal"] [data-pagination-compact] {
            display: none;
          }

          .responsive-pagination[data-pagination-mode="minimal"] [data-pagination-minimal] {
            display: flex;
          }

          @media (max-width: 543px) {
            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-full],
            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-compact] {
              display: none;
            }

            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-minimal] {
              display: flex;
            }
          }

          @media (min-width: 544px) and (max-width: 767px) {
            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-full],
            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-minimal] {
              display: none;
            }

            .responsive-pagination[data-pagination-mode="full"][data-pagination-has-responsive-variants="true"] [data-pagination-compact] {
              display: flex;
            }
          }

          .pagination-measure {
            position: absolute;
            left: 0;
            top: 0;
            visibility: hidden;
            pointer-events: none;
            flex-wrap: nowrap;
            inline-size: 0;
            block-size: 0;
            overflow: hidden;
            max-width: none;
            white-space: nowrap;
          }

          .pagination-measure > * {
            flex: none;
          }

          .pagination-ellipsis,
          .pagination-control-disabled {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.375rem 0.5rem;
            color: var(--fgColor-muted);
          }

          .pagination-control,
          .pagination-control-disabled {
            white-space: nowrap;
          }

          .delete-confirm {
            position: relative;
          }

          .delete-confirm-trigger {
            list-style: none;
            cursor: pointer;
          }

          .delete-confirm-trigger::-webkit-details-marker {
            display: none;
          }

          .delete-confirm-panel {
            position: absolute;
            right: 0;
            top: calc(100% + 0.5rem);
            width: min(20rem, calc(100vw - 2rem));
            z-index: 120;
            white-space: normal;
            border: var(--borderWidth-thin) solid var(--borderColor-default, var(--color-border-default));
            border-radius: var(--borderRadius-medium, 0.375rem);
            padding: 0.75rem;
          }

          .delete-confirm-actions {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .delete-confirm-actions > * {
            margin: 0 !important;
          }

          .delete-confirm-submit {
            border: var(--borderWidth-thin) solid var(--button-danger-borderColor-rest, var(--color-btn-danger-hover-border));
          }
        </style>
      </head>
      <body class="bg-gray-light">
        <header>
          <div class="Header Header--dark hide-sm hide-md">
            <div class="container-lg d-flex flex-items-center width-full">
              <div class="Header-item">
                <a href="/" class="Header-link f4 text-bold">${site.siteName}</a>
              </div>
              ${
                aboutPostId
                  ? html`
                      <div class="Header-item">
                        <a
                          href="/posts/${aboutPostId}"
                          class="Header-link ${activePath === "/posts/" + aboutPostId ? "text-bold" : ""}"
                          ${activePath === "/posts/" + aboutPostId ? 'aria-current="page"' : ""}
                          >${t("about", lang)}</a
                        >
                      </div>
                    `
                  : html``
              }
              ${directoryLinks.map((link) =>
                link.active
                  ? html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link text-bold" aria-current="page">${link.label}</a>
                      </div>
                    `
                  : html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link">${link.label}</a>
                      </div>
                    `
              )}
              <div class="Header-item Header-item--full"></div>
              ${navLinks.map((link) =>
                activePath === link.href
                  ? html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link text-bold" aria-current="page">${getNavLabel(link.label, link.labelKey)}</a>
                      </div>
                    `
                  : html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link">${getNavLabel(link.label, link.labelKey)}</a>
                      </div>
                    `
              )}
              ${authLinks.map((link) =>
                link.active
                  ? html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link text-bold" aria-current="page">${link.label}</a>
                      </div>
                    `
                  : html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link">${link.label}</a>
                      </div>
                    `
              )}
              <div class="Header-item">
                <a href="/api/lang?to=${t("switchLangTo", lang)}" class="Header-link">${t("switchLang", lang)}</a>
              </div>
            </div>
          </div>
          <div class="Header Header--dark hide-lg hide-xl">
            <div class="container-lg d-flex flex-items-center width-full">
              <div class="Header-item">
                <a href="/" class="Header-link f4 text-bold">${site.siteName}</a>
              </div>
              ${
                aboutPostId
                  ? html`
                      <div class="Header-item">
                        <a
                          href="/posts/${aboutPostId}"
                          class="Header-link ${activePath === "/posts/" + aboutPostId ? "text-bold" : ""}"
                          ${activePath === "/posts/" + aboutPostId ? 'aria-current="page"' : ""}
                          >${t("about", lang)}</a
                        >
                      </div>
                    `
                  : html``
              }
              ${directoryLinks.map((link) =>
                link.active
                  ? html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link text-bold" aria-current="page">${link.label}</a>
                      </div>
                    `
                  : html`
                      <div class="Header-item">
                        <a href=${link.href} class="Header-link">${link.label}</a>
                      </div>
                    `
              )}
              <div class="Header-item Header-item--full"></div>
              <div class="Header-item">
                <details class="details-reset position-relative">
                  <summary class="Header-link mobile-menu-summary" aria-label="${t("openMenu", lang)}">☰</summary>
                  <div class="mobile-menu-panel Box color-bg-default color-shadow-large overflow-hidden">
                    ${mobileMenuLinks.map((link) =>
                      link.active
                        ? html`<a href=${link.href} class="mobile-menu-link" aria-current="page">${link.label}</a>`
                        : html`<a href=${link.href} class="mobile-menu-link">${link.label}</a>`
                    )}
                  </div>
                </details>
              </div>
            </div>
          </div>
        </header>
        <main class="container-lg mb-3 pb-6">
          <div class="mt-6 ml-3 mr-3 mb-6">${body}</div>
        </main>
        <footer class="footer mt-3 pt-6 mb-3">
          <div class="container-lg">
            <p class="text-center f6 text-gray">
              © ${new Date().getFullYear()} ${site.siteName} · Powered by Hono, Primer CSS, & GitHub Copilot
            </p>
          </div>
        </footer>
        <script>
          (() => {
            const roots = Array.from(document.querySelectorAll("[data-pagination-root]"));

            if (roots.length === 0) {
              return;
            }

            const updatePaginationMode = (root) => {
              const fullMeasure = root.querySelector("[data-pagination-measure-full]");
              const compactMeasure = root.querySelector("[data-pagination-measure-compact]");
              const compact = root.querySelector("[data-pagination-compact]");

              root.dataset.paginationMode = ${String(resolveResponsivePaginationMode)}({
                rootWidth: root.clientWidth,
                fullWidth: fullMeasure?.scrollWidth ?? 0,
                compactWidth: compactMeasure?.scrollWidth ?? 0,
                hasCompactPagination: Boolean(compact)
              });
            };

            const refreshAll = () => {
              roots.forEach((root) => updatePaginationMode(root));
            };

            refreshAll();
            window.addEventListener("load", refreshAll);
            window.addEventListener("resize", refreshAll, { passive: true });

            if (typeof ResizeObserver === "function") {
              const observer = new ResizeObserver((entries) => {
                entries.forEach((entry) => updatePaginationMode(entry.target));
              });

              roots.forEach((root) => observer.observe(root));
            }
          })();
        </script>
      </body>
    </html>
  `;
};
