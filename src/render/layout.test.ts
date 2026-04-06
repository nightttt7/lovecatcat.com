import { describe, expect, it } from "vitest";
import { renderLayout, resolveResponsivePaginationMode } from "./layout";
import type { SiteConfig } from "../config";
import { expectHtmlFragmentsInOrder } from "../test/html-assertions";

describe("renderLayout", () => {
  const mockSiteConfig: SiteConfig = {
    siteName: "Test Blog",
    siteDescription: "Test Description",
    navLinks: [
      { label: "Post", labelKey: "newPost", href: "/post", requiresAdmin: true },
      { label: "Admin", labelKey: "adminDashboard", href: "/admin", requiresAdmin: true }
    ]
  };

  it("renders basic layout structure", () => {
    const result = renderLayout({
      title: "Test Title",
      description: "Test Description",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Test Body"
    });

    const html = result.toString();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain('<body class="bg-gray-light">');
    expect(html).toContain("Test Title");
    expect(html).toContain("Test Body");
  });

  it("includes site name in banner", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain("Test Blog");
  });

  it("filters out admin-only nav links for non-admin users", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).not.toContain("发布文章");
    expect(html).not.toContain("管理后台");
    expect(html).toContain("登录");
    expect(html).toContain("注册");
  });

  it("shows admin nav links for admin users", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: true,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain("新建文章");
    expect(html).toContain("管理后台");
  });

  it("localizes about and menu labels in English", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: true,
      lang: "en",
      aboutPostId: 9,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toMatch(/href="\/posts\/9"[\s\S]*>About<\/a/);
    expect(html).toContain('href=/labels');
    expect(html).toContain('href=/authors');
    expect(html).toContain(">Labels<");
    expect(html).toContain(">Authors<");
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("New post");
    expect(html).toContain("Admin dashboard");
  });

  it("renders labels and authors links next to about in the header", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      aboutPostId: 9,
      body: "Body"
    });

    const html = result.toString();
    expectHtmlFragmentsInOrder(html, ['href="/posts/9"', 'href=/labels', 'href=/authors']);
  });

  it("localizes labels and authors links in Chinese by default", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain(">标签<");
    expect(html).toContain(">作者<");
  });

  it("renders a dedicated mobile menu panel instead of dropdown-menu styles", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: true,
      body: "Body"
    });

    const html = result.toString();
    const mobilePanelMatch = html.match(/<div class="mobile-menu-panel Box color-bg-default color-shadow-large overflow-hidden">[\s\S]*?<\/div>/);

    expect(html).toContain('class="Header-link mobile-menu-summary"');
    expect(html).toContain('class="mobile-menu-panel Box color-bg-default color-shadow-large overflow-hidden"');
    expect(html).toContain('class="mobile-menu-link"');
    expect(html).not.toContain('class="dropdown-menu dropdown-menu-sw"');
    expect(mobilePanelMatch?.[0]).not.toContain('href=/labels');
    expect(mobilePanelMatch?.[0]).not.toContain('href=/authors');
  });

  it("shows account and logout links for signed-in users", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      currentUser: { username: "alice" },
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain("alice");
    expect(html).toContain("退出");
    expect(html).not.toContain("登录");
  });

  it("marks active path with aria-current", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: true,
      body: "Body",
      activePath: "/post"
    });

    const html = result.toString();
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('class="Header-link text-bold"');
  });

  it("marks the matching mobile menu link as current", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body",
      activePath: "/login"
    });

    const html = result.toString();
    expect(html).toMatch(/<a href=\/login class="mobile-menu-link" aria-current="page">登录<\/a>/);
  });

  it("does not set aria-current when activePath is undefined", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: true,
      body: "Body"
    });

    const html = result.toString();
    expect(html).not.toMatch(/<a [^>]*class="Header-link text-bold"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/<a [^>]*class="mobile-menu-link"[^>]*aria-current="page"/);
  });

  it("includes current year in footer", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    const currentYear = new Date().getFullYear();
    expect(html).toContain(currentYear.toString());
    expect(html).toContain("Powered by Hono, Primer CSS, & GitHub Copilot");
  });

  it("includes meta tags", () => {
    const result = renderLayout({
      title: "My Title",
      description: "My Description",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain('<meta charset="utf-8"');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain("My Description");
  });

  it("includes stylesheet link", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain('<link rel="stylesheet" href="/static/primer.css"');
  });

  it("includes favicon link", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
  });

  it("keeps scrollbar gutter stable and includes responsive pagination script", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Body"
    });

    const html = result.toString();
    expect(html).toContain("scrollbar-gutter: stable");
    expect(html).toContain("data-pagination-root");
    expect(html).toContain("ResizeObserver");
    expect(html).toContain('@media (max-width: 543px)');
    expect(html).toContain('@media (min-width: 544px) and (max-width: 767px)');
    expect(html).toContain('inline-size: 0');
    expect(html).toContain('overflow: hidden');
  });

  it("keeps full pagination when the container can fit every link", () => {
    expect(
      resolveResponsivePaginationMode({
        rootWidth: 720,
        fullWidth: 720,
        compactWidth: 480,
        hasCompactPagination: true
      })
    ).toBe("full");

    expect(
      resolveResponsivePaginationMode({
        rootWidth: 721,
        fullWidth: 720,
        compactWidth: 480,
        hasCompactPagination: true
      })
    ).toBe("full");
  });

  it("switches to compact pagination when full pagination overflows but the compact variant still fits", () => {
    expect(
      resolveResponsivePaginationMode({
        rootWidth: 719,
        fullWidth: 720,
        compactWidth: 480,
        hasCompactPagination: true
      })
    ).toBe("compact");
  });

  it("switches to minimal pagination when the compact variant also overflows", () => {
    expect(
      resolveResponsivePaginationMode({
        rootWidth: 319,
        fullWidth: 720,
        compactWidth: 480,
        hasCompactPagination: true
      })
    ).toBe("minimal");
  });

  it("forces full pagination when there is no compact variant", () => {
    expect(
      resolveResponsivePaginationMode({
        rootWidth: 320,
        fullWidth: 960,
        compactWidth: 0,
        hasCompactPagination: false
      })
    ).toBe("full");
  });

  it("renders body content inside main container", () => {
    const result = renderLayout({
      title: "Test",
      description: "Test",
      site: mockSiteConfig,
      isAdmin: false,
      body: "Custom Body Content"
    });

    const html = result.toString();
    expect(html).toContain('<main class="container-lg mb-3 pb-6">');
    expect(html).toContain("Custom Body Content");
  });
});
