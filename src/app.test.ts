import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "./app";
import type { AppOptions } from "./app";
import type { SiteConfig } from "./config";
import type { BlogDb, PostListRow, PostDetailRow } from "./db/types";
import { createAppTestContext } from "./test/app-test-factory";
import {
  expectDeleteConfirmationPanel,
  expectHtmlFragmentsInOrder,
  expectHtmlToContainAll,
  expectNoPaginationMarkup,
  expectResponsivePaginationMarkup
} from "./test/html-assertions";

describe("createApp", () => {
  let mockDb: BlogDb;
  let mockSite: SiteConfig;
  let mockOptions: AppOptions;
  let request: ReturnType<typeof createAppTestContext>["request"];
  let createComment: ReturnType<typeof createAppTestContext>["createComment"];
  let createPostDetail: ReturnType<typeof createAppTestContext>["createPostDetail"];
  let createPostTranslation: ReturnType<typeof createAppTestContext>["createPostTranslation"];
  let setSignedInUser: ReturnType<typeof createAppTestContext>["setSignedInUser"];
  let setSignedInAdmin: ReturnType<typeof createAppTestContext>["setSignedInAdmin"];

  beforeEach(() => {
    const context = createAppTestContext();
    mockDb = context.mockDb;
    mockSite = context.mockSite;
    mockOptions = context.mockOptions;
    request = context.request;
    createComment = context.createComment;
    createPostDetail = context.createPostDetail;
    createPostTranslation = context.createPostTranslation;
    setSignedInUser = context.setSignedInUser;
    setSignedInAdmin = context.setSignedInAdmin;
  });

  describe("middleware setup", () => {
    it("sets db and isAdmin variables on context", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res).toBeDefined();
      expect(res.status).toBeDefined();
    });
  });

  describe("GET /static/primer.css", () => {
    it("returns CSS with correct content-type", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/static/primer.css");
      
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
      
      const text = await res.text();
      expect(text).toBeTruthy();
      expect(text).toContain("Primer CSS");
    });
  });

  describe("GET /static/post-editor-preview.js", () => {
    it("returns the client-side markdown preview script", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/static/post-editor-preview.js");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

      const text = await res.text();
      expect(text).toContain("(min-width: 1012px)");
      expect(text).toContain("data-post-editor-root");
      expect(text).toContain("data-post-editor-switch");
      expect(text).toContain("requestAnimationFrame");
      expect(text).toContain("scrollHeight");
      expect(text).toContain("scrollTop");
      expect(text).toContain("renderMarkdownToHtml");
      expect(text).not.toContain("__name(");
    });
  });

  describe("GET /favicon.ico", () => {
    it("returns the site favicon with cache headers", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/favicon.ico");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/x-icon");
      expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
      expect(Array.from(bytes.slice(0, 4))).toEqual([0, 0, 1, 0]);
    });
  });

  describe("GET /", () => {
    it("returns home page with no posts", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("所有博文");
      expectHtmlFragmentsInOrder(html, ['href="/posts"', '>所有博文<', 'href="/labels"', '>标签<', 'href="/authors"', '>作者<']);
      expect(html).toContain("暂无博文内容");
    });

    it("renders about and tools links in the header while keeping labels and authors out of it", async () => {
      mockDb.getPostByTitle = async (title) => {
        if (title === "About") {
          return createPostDetail({ id: 21, title: "About" });
        }

        if (title === "Tools") {
          return createPostDetail({ id: 22, title: "Tools" });
        }

        return null;
      };

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      expectHtmlFragmentsInOrder(html, ['href=/posts/21', 'href=/posts/22']);
      expect(html).toContain(">关于<");
      expect(html).toContain(">工具<");
      expect(html).not.toMatch(/<header>[\s\S]*href=\/labels/);
      expect(html).not.toMatch(/<header>[\s\S]*href=\/authors/);
    });

    it("displays list of posts", async () => {
      const mockPosts: PostListRow[] = [
        {
          id: 1,
          title: "Test Post 1",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author 1",
          is_draft: 0
        },
        {
          id: 2,
          title: "Test Post 2",
          timestamp: "2024-01-02 11:00:00",
          tag: "life",
          author_id: 2,
          author_name: "Author 2",
          is_draft: 0
        }
      ];

      mockDb.listPosts = async () => mockPosts;
      mockDb.countPosts = async () => mockPosts.length;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("Test Post 1");
      expect(html).toContain("Test Post 2");
      expect(html).toContain("Author 1");
      expect(html).toContain("Author 2");
    });

    it("allows homepage post titles to wrap instead of forcing a single-line ellipsis", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "A very long homepage title that should still wrap on narrow mobile screens without widening the page layout",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author 1",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      const titleStyleMatch = html.match(/\.post-title-link\s*\{([\s\S]*?)\}/);

      expect(titleStyleMatch?.[1]).toContain("max-width: 100%");
      expect(titleStyleMatch?.[1]).toContain("overflow-wrap: anywhere");
      expect(titleStyleMatch?.[1]).toContain("word-break: break-word");
      expect(titleStyleMatch?.[1]).not.toContain("white-space: nowrap");
      expect(titleStyleMatch?.[1]).not.toContain("text-overflow: ellipsis");
    });

    it("renders hashtag labels next to the published date", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Tagged Post",
          timestamp: "2024-01-01 10:00:00",
          tag: "news,draft,updates",
          author_id: 1,
          author_name: "Author",
          is_draft: 1
        }
      ];
      mockDb.countPosts = async () => 1;
      mockOptions.getIsAdmin = () => true;

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("#news");
      expect(html).toContain("#updates");
      expect(html).not.toContain("#draft");
      expect(html).toContain('href="/posts?tag=news"');
      expect(html).toContain('href="/posts?tag=updates"');
    });

    it("renders homepage meta as tags first, author name, and @ date", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Tagged Post",
          timestamp: "2024-06-25 10:00:00",
          tag: "news,updates",
          author_id: 7,
          author_name: "lian",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("#news");
      expect(html).toContain(">lian</a>");
      expect(html).toContain("@ 2024年6月25日");
      expect(html).not.toContain("Published 2024年6月25日");

      expectHtmlFragmentsInOrder(html, ["#news", ">lian</a>", "@ 2024年6月25日"]);
    });

    it("renders homepage date in English as yyyy-mm-dd", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Tagged Post",
          timestamp: "2024-06-25 10:00:00",
          tag: "news,updates",
          author_id: 7,
          author_name: "lian",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;

      const res = await request("/", {
        headers: {
          cookie: "lang=en"
        }
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("All posts");
      expect(html).toContain("@ 2024-06-25");
      expect(html).not.toContain("2024年6月25日");
    });

    it("uses the original title when a completed translation is unpublished", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Original title",
          timestamp: "2024-06-25 10:00:00",
          tag: "news",
          author_id: 7,
          author_name: "lian",
          source_lang: "zh",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;
      mockDb.getPostTranslation = async () => createPostTranslation({
        post_id: 1,
        lang: "en",
        translated_title: "Unpublished translated title",
        translated_body: "Unpublished translated body",
        status: "completed",
        is_published: 0
      });

      const res = await request("/", {
        headers: {
          cookie: "lang=en"
        }
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Original title");
      expect(html).not.toContain("Unpublished translated title");
    });

    it("uses published translated titles for non-authors when the UI language differs from the source", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Original title",
          timestamp: "2024-06-25 10:00:00",
          tag: "news",
          author_id: 7,
          author_name: "lian",
          source_lang: "zh",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;
      mockDb.getPostTranslation = async () => createPostTranslation({
        post_id: 1,
        lang: "en",
        translated_title: "Published translated title",
        translated_body: "Published translated body",
        status: "completed",
        is_published: 1
      });

      const res = await request("/", {
        headers: {
          cookie: "lang=en"
        }
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Published translated title");
      expect(html).not.toContain("Original title");
    });

    it("uses original titles for authors on the home page regardless of UI language", async () => {
      setSignedInUser({ id: 7 });
      let translationLookups = 0;
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Original title",
          timestamp: "2024-06-25 10:00:00",
          tag: "news",
          author_id: 7,
          author_name: "lian",
          source_lang: "zh",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;
      mockDb.getPostTranslation = async () => {
        translationLookups += 1;
        return createPostTranslation({
          post_id: 1,
          lang: "en",
          translated_title: "Published translated title",
          translated_body: "Published translated body",
          status: "completed",
          is_published: 1
        });
      };

      const app = createApp(mockOptions);
      const res = await app.request("/", {
        headers: {
          cookie: "lang=en; lovecatcat_session=test-session-token"
        }
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Original title");
      expect(html).not.toContain("Published translated title");
      expect(translationLookups).toBe(0);
    });

    it("renders author names as links on the home page", async () => {
      mockDb.listPosts = async () => [
        {
          id: 1,
          title: "Post",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 7,
          author_name: "Author",
          is_draft: 0
        }
      ];
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('href="/posts?authorId=7"');
      expect(html).toContain(">Author</a>");
    });

    it("filters posts by author id and preserves the filter in pagination links", async () => {
      const mockPosts: PostListRow[] = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        title: `Post ${index + 1}`,
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 7,
        author_name: "Author",
        is_draft: 0
      }));

      let listOptions: Parameters<BlogDb["listPosts"]>[0] | null = null;
      let countOptions: Parameters<BlogDb["countPosts"]>[0] | null = null;
      mockDb.listPosts = async (options) => {
        listOptions = options;
        return mockPosts;
      };
      mockDb.countPosts = async (options) => {
        countOptions = options;
        return 25;
      };
      mockDb.getUserById = async (id) => (id === 7
        ? { id: 7, username: "Author", email: "author@example.com", is_blocked: 0 }
        : null);

      const app = createApp(mockOptions);
      const res = await app.request("/posts?authorId=7");

      expect(res.status).toBe(200);
      expect(listOptions).toMatchObject({ authorId: 7, includeDrafts: false, limit: 10, offset: 0 });
      expect(countOptions).toMatchObject({ authorId: 7, includeDrafts: false });

      const html = await res.text();
      expect(html).toContain(">作者: Author<");
      expect(html).toContain("/posts?authorId=7&amp;page=2");
    });

    it("filters posts by tag and preserves spaced label filters in pagination links", async () => {
      const mockPosts: PostListRow[] = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        title: `Post ${index + 1}`,
        timestamp: "2024-01-01 10:00:00",
        tag: "markdown,test",
        author_id: 7,
        author_name: "Author",
        is_draft: 0
      }));

      let listOptions: Parameters<BlogDb["listPosts"]>[0] | null = null;
      let countOptions: Parameters<BlogDb["countPosts"]>[0] | null = null;
      mockDb.listPosts = async (options) => {
        listOptions = options;
        return mockPosts;
      };
      mockDb.countPosts = async (options) => {
        countOptions = options;
        return 25;
      };

      const app = createApp(mockOptions);
      const res = await app.request("/posts?tag=Markdown%20Test");

      expect(res.status).toBe(200);
      expect(listOptions).toMatchObject({ tag: "markdown test", includeDrafts: false, limit: 10, offset: 0 });
      expect(countOptions).toMatchObject({ tag: "markdown test", includeDrafts: false });

      const html = await res.text();
      expect(html).toContain(">#markdown test<");
      expect(html).toContain("/posts?tag=markdown+test&amp;page=2");
    });

    it("shows draft badge for draft posts when admin", async () => {
      const mockPosts: PostListRow[] = [
        {
          id: 1,
          title: "Draft Post",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author",
          is_draft: 1
        }
      ];

      mockDb.listPosts = async () => mockPosts;
      mockDb.countPosts = async () => 1;
      mockOptions.getIsAdmin = () => true;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("草稿");
    });

    it("does not show draft badge for non-draft posts", async () => {
      const mockPosts: PostListRow[] = [
        {
          id: 1,
          title: "Published Post",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author",
          is_draft: 0
        }
      ];

      mockDb.listPosts = async () => mockPosts;
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).not.toContain("草稿");
    });

    it("handles pagination with page query parameter", async () => {
      const mockPosts: PostListRow[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Post ${i + 1}`,
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      }));

      mockDb.listPosts = async ({ offset }) => mockPosts.slice(offset, offset + 10);
      mockDb.countPosts = async () => 25;

      const app = createApp(mockOptions);
      const res = await app.request("/?page=2");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("pagination");
    });

    it("defaults to page 1 for invalid page numbers", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 0;

      const app = createApp(mockOptions);
      const res = await app.request("/?page=0");
      
      expect(res.status).toBe(200);
    });

    it("shows Unknown for posts without author name", async () => {
      const mockPosts: PostListRow[] = [
        {
          id: 1,
          title: "Post",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: null,
          is_draft: 0
        }
      ];

      mockDb.listPosts = async () => mockPosts;
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("未知作者");
      expect(html).not.toContain("authorId=1");
    });

    it("shows 无标题 for posts without title", async () => {
      const mockPosts: PostListRow[] = [
        {
          id: 1,
          title: null,
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author",
          is_draft: 0
        }
      ];

      mockDb.listPosts = async () => mockPosts;
      mockDb.countPosts = async () => 1;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("无标题");
    });

    it("shows pagination for multiple pages", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 25;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expectResponsivePaginationMarkup(html, [
        'data-pagination-has-responsive-variants="false"',
        "?page=2",
        "?page=3",
        "上一页",
        "下一页"
      ]);
    });

    it("renders full and compact pagination markup for larger result sets", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 100;

      const app = createApp(mockOptions);
      const res = await app.request("/?page=6");

      expect(res.status).toBe(200);

      const html = await res.text();
      expectResponsivePaginationMarkup(html, [
        'data-pagination-has-responsive-variants="true"',
        'data-pagination-compact',
        'data-pagination-minimal',
        'data-pagination-measure-full',
        'data-pagination-measure-compact',
        'href="/posts?page=1"',
        'href="/posts?page=4"',
        'href="/posts?page=5"',
        'href="/posts?page=7"',
        'href="/posts?page=8"',
        'href="/posts?page=10"',
        '>...<'
      ]);
    });

    it("renders a minimal pagination variant with the current page neighborhood", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 100;

      const app = createApp(mockOptions);
      const res = await app.request("/?page=6");

      expect(res.status).toBe(200);

      const html = await res.text();
      const minimalPaginationMatch = html.match(/<nav class="pagination" data-pagination-minimal[\s\S]*?<\/nav>/);
      const minimalPaginationHtml = minimalPaginationMatch?.[0] ?? "";

      expectResponsivePaginationMarkup(html, ['data-pagination-minimal']);
      expect(minimalPaginationHtml).toContain('>...<');
      expect(minimalPaginationHtml).toContain('href="/posts?page=5"');
      expect(minimalPaginationHtml).toContain('aria-current="page">6</span>');
      expect(minimalPaginationHtml).toContain('href="/posts?page=7"');
    });

    it("renders a trailing ellipsis in the minimal pagination variant on the first page", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 100;

      const app = createApp(mockOptions);
      const res = await app.request("/");

      expect(res.status).toBe(200);

      const html = await res.text();
      const minimalPaginationMatch = html.match(/<nav class="pagination" data-pagination-minimal[\s\S]*?<\/nav>/);
      const minimalPaginationHtml = minimalPaginationMatch?.[0] ?? "";

      expect(minimalPaginationHtml).toContain('aria-current="page">1</span>');
      expect(minimalPaginationHtml).toContain('href="/posts?page=2"');
      expect(minimalPaginationHtml).toContain('>...<');
      expect(minimalPaginationHtml).not.toContain('href="/posts?page=3"');
    });

    it("does not show pagination for single page", async () => {
      mockDb.listPosts = async () => [];
      mockDb.countPosts = async () => 5;

      const app = createApp(mockOptions);
      const res = await app.request("/");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expectNoPaginationMarkup(html);
    });
  });

  describe("GET /labels", () => {
    it("lists all visible labels and links them to the existing tag filter", async () => {
      mockDb.listPostTags = async () => [{ tag: "news,updates" }, { tag: "updates,guide" }, { tag: "draft" }];

      const app = createApp(mockOptions);
      const res = await app.request("/labels");

      expect(res.status).toBe(200);

      const html = await res.text();
      expectHtmlFragmentsInOrder(html, ['href="/posts"', '>所有博文<', 'href="/labels"', '>标签<', 'href="/authors"', '>作者<']);
      expect(html).toContain("全部标签");
      expect(html).toContain('href="/posts?tag=news"');
      expect(html).toContain('href="/posts?tag=updates"');
      expect(html).toContain('href="/posts?tag=guide"');
      expect(html).toContain('class="Counter f3">2<');
      expect(html).not.toContain("#draft");
    });
  });

  describe("GET /authors", () => {
    it("lists all visible authors and links them to the existing author filter", async () => {
      mockDb.listAuthors = async () => [
        { id: 7, username: "lian", post_count: 3 },
        { id: 8, username: "alice", post_count: 1 }
      ];

      const app = createApp(mockOptions);
      const res = await app.request("/authors");

      expect(res.status).toBe(200);

      const html = await res.text();
      expectHtmlFragmentsInOrder(html, ['href="/posts"', '>所有博文<', 'href="/labels"', '>标签<', 'href="/authors"', '>作者<']);
      expect(html).toContain("全部作者");
      expect(html).toContain('href="/posts?authorId=7"');
      expect(html).toContain('href="/posts?authorId=8"');
      expect(html).toContain(">lian</a>");
      expect(html).toContain('class="Counter f3">3<');
    });
  });

  describe("GET /posts/:id/original", () => {
    it("returns not found page for invalid post ID", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/posts/abc/original");

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("页面不存在");
    });

    it("returns not found page for non-existent post", async () => {
      mockDb.getPostById = async () => null;

      const app = createApp(mockOptions);
      const res = await app.request("/posts/999/original");

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("页面不存在");
    });

    it("hides private posts from non-owners and shows them to the owner", async () => {
      const privatePost: PostDetailRow = {
        id: 1,
        title: "Private Post",
        body: "Secret",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 5,
        author_name: "Author",
        is_draft: 0,
        is_private: 1
      };

      mockDb.getPostById = async (_id, options) => (options.viewerId === 5 ? privatePost : null);
      mockDb.listComments = async () => [];

      const anonymousRes = await request("/posts/1/original");
      expect(anonymousRes.status).toBe(404);

      setSignedInUser({ id: 5 });
      const ownerRes = await request("/posts/1/original", undefined, true);

      expect(ownerRes.status).toBe(200);
      const html = await ownerRes.text();
      expect(html).toContain("Private Post");
      expect(html).toContain("私密");
    });

    it("displays post detail with content", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "# Hello\n\nThis is content.",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0,
        is_private: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("Test Post");
      expect(html).toContain("Author");
      expect(html).toContain("<h1");
      expect(html).toContain("Hello");
    });

    it("renders post detail meta in the same style as the homepage", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-06-25 10:00:00",
        tag: "news,updates",
        author_id: 7,
        author_name: "lian",
        is_draft: 0,
        is_private: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('href="/posts?tag=news"');
      expect(html).toContain('href="/posts?authorId=7"');
      expect(html).toContain(">lian</a>");
      expect(html).toContain("@ 2024年6月25日");
      expect(html).not.toContain("Published 2024年6月25日");

      expectHtmlFragmentsInOrder(html, ["#news", ">lian</a>", "@ 2024年6月25日"]);
    });

    it("displays comments for post", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0,
        is_private: 0
      };

      const mockComments = [
        createComment(),
        createComment({
          id: 2,
          name: "Commenter 2",
          body: "Thanks for sharing.",
          is_user: 0,
          timestamp: "2024-01-01 12:00:00",
          user_id: null
        })
      ];

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => mockComments;

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("评论区");
      expect(html).toContain("(2)");
      expect(html).toContain("Commenter 1");
      expect(html).toContain("Great post!");
      expect(html).toContain("Commenter 2");
      expect(html).toContain("Thanks for sharing.");
    });

    it("renders the signed-in comment form at full content width", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0,
        is_private: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];
      setSignedInUser();

      const res = await request("/posts/1/original", undefined, true);

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('id="comment-body" name="body"');
      expect(html).toContain('class="form-control width-full"');
      expect(html).toContain('maxlength="2000"');
    });

    it("keeps long post titles and comment links in a dedicated action layout for admins", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Very long post title ".repeat(10).trim(),
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 5,
        author_name: "Author",
        is_draft: 0,
        is_private: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [
        createComment({
          post_id: 1,
          post_title: "Extremely long linked post title ".repeat(8).trim(),
          user_id: 5
        })
      ];

      setSignedInAdmin();

      const res = await request("/posts/1/original", undefined, true);

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("action-card-row");
      expect(html).toContain("action-card-main");
      expect(html).toContain("action-card-actions");
      expect(html).toContain("action-card-title-link");
      expectDeleteConfirmationPanel(html, { actionPath: "/posts/1/delete" });
      expectDeleteConfirmationPanel(html, { actionPath: "/comments/1/delete" });
    });

    it("shows no comments message when no comments", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("评论区 (0)");
      expect(html).toContain("暂无评论");
    });

    it("shows draft badge for draft posts when admin", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Draft Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 1
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];
      mockOptions.getIsAdmin = () => true;

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("草稿");
    });

    it("hides draft posts from non-admin users", async () => {
      mockDb.getPostById = async (id, options) => {
        if (!options.includeDrafts) return null;
        return {
          id: 1,
          title: "Draft Post",
          body: "Content",
          timestamp: "2024-01-01 10:00:00",
          tag: "tech",
          author_id: 1,
          author_name: "Author",
          is_draft: 1
        };
      };
      mockOptions.getIsAdmin = () => false;

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("页面不存在");
    });

    it("shows Unknown for posts without author name", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: null,
        is_draft: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("未知作者");
    });

    it("shows 无标题 for posts without title", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: null,
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("无标题");
    });

    it("shows 匿名 for comments without name", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "Test Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      };

      const mockComments = [
        createComment({
          name: null,
          body: "Anonymous comment",
          is_user: 0,
          user_id: null
        })
      ];

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => mockComments;

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("匿名");
      expect(html).toContain("Anonymous comment");
    });

    it("uses post title in page title", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: "My Awesome Post",
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("<title>My Awesome Post</title>");
    });

    it("uses site name in page title when post has no title", async () => {
      const mockPost: PostDetailRow = {
        id: 1,
        title: null,
        body: "Content",
        timestamp: "2024-01-01 10:00:00",
        tag: "tech",
        author_id: 1,
        author_name: "Author",
        is_draft: 0
      };

      mockDb.getPostById = async () => mockPost;
      mockDb.listComments = async () => [];

      const app = createApp(mockOptions);
      const res = await app.request("/posts/1/original");
      
      expect(res.status).toBe(200);
      
      const html = await res.text();
      expect(html).toContain("<title>Test Blog</title>");
    });
  });

  describe("404 handler", () => {
    it("returns custom 404 page for unknown routes", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/unknown-route");

      expect(res.status).toBe(404);
    });

    it("displays 404 message in Chinese", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/unknown-route");
      
      const html = await res.text();
      expect(html).toContain("页面不存在");
    });

    it("includes site name in 404 page title", async () => {
      const app = createApp(mockOptions);
      const res = await app.request("/unknown-route");
      
      const html = await res.text();
      expect(html).toContain("<title>404 | Test Blog</title>");
    });
  });

  describe("admin access control", () => {
    it("passes includeDrafts true to db when user is admin", async () => {
      let capturedOptions: any = null;
      mockDb.listPosts = async (options) => {
        capturedOptions = options;
        return [];
      };
      mockDb.countPosts = async (options) => {
        capturedOptions = options;
        return 0;
      };
      mockOptions.getIsAdmin = () => true;

      const app = createApp(mockOptions);
      await app.request("/");
      
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.includeDrafts).toBe(true);
    });

    it("passes includeDrafts false to db when user is not admin", async () => {
      let capturedOptions: any = null;
      mockDb.listPosts = async (options) => {
        capturedOptions = options;
        return [];
      };
      mockDb.countPosts = async (options) => {
        capturedOptions = options;
        return 0;
      };
      mockOptions.getIsAdmin = () => false;

      const app = createApp(mockOptions);
      await app.request("/");
      
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.includeDrafts).toBe(false);
    });

    it("passes includeDrafts true for post detail when user is admin", async () => {
      let capturedOptions: any = null;
      mockDb.getPostById = async (id, options) => {
        capturedOptions = options;
        return null;
      };
      mockOptions.getIsAdmin = () => true;

      const app = createApp(mockOptions);
      await app.request("/posts/1/original");
      
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.includeDrafts).toBe(true);
    });

    it("passes includeDrafts false for post detail when user is not admin", async () => {
      let capturedOptions: any = null;
      mockDb.getPostById = async (id, options) => {
        capturedOptions = options;
        return null;
      };
      mockOptions.getIsAdmin = () => false;

      const app = createApp(mockOptions);
      await app.request("/posts/1/original");
      
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.includeDrafts).toBe(false);
    });
  });
});
