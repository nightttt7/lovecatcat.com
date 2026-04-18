import { beforeEach, describe, expect, it } from "vitest";
import type { BlogDb } from "./db/types";
import { createAppTestContext } from "./test/app-test-factory";
import {
  expectHtmlFragmentsInOrder,
  expectHtmlToContainAll,
  expectHtmlToExcludeAll,
  getMainHtml,
  getSectionHtmlByHeading,
  expectNoPaginationMarkup
} from "./test/html-assertions";

describe("createApp admin and post editor routes", () => {
  let request: ReturnType<typeof createAppTestContext>["request"];
  let submitForm: ReturnType<typeof createAppTestContext>["submitForm"];
  let createPostDetail: ReturnType<typeof createAppTestContext>["createPostDetail"];
  let createPostTranslation: ReturnType<typeof createAppTestContext>["createPostTranslation"];
  let createComment: ReturnType<typeof createAppTestContext>["createComment"];
  let createUser: ReturnType<typeof createAppTestContext>["createUser"];
  let setSignedInAdmin: ReturnType<typeof createAppTestContext>["setSignedInAdmin"];
  let mockDb: BlogDb;
  let state: ReturnType<typeof createAppTestContext>["state"];

  beforeEach(() => {
    const context = createAppTestContext();
    request = context.request;
    submitForm = context.submitForm;
    createPostDetail = context.createPostDetail;
    createPostTranslation = context.createPostTranslation;
    createComment = context.createComment;
    createUser = context.createUser;
    setSignedInAdmin = context.setSignedInAdmin;
    mockDb = context.mockDb;
    state = context.state;
  });

  it("renders the create post form for admins", async () => {
    setSignedInAdmin();

    const res = await request("/post", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const mainSection = getMainHtml(html);
    expect(html).toContain("发布文章");
    expect(html).toContain('form method="post" action="/post"');
    expect(html).toContain('id="title" name="title" type="text" class="form-control width-full" maxlength="200"');
    expect(html).toContain('id="tag" name="tag" type="text" class="form-control width-full" maxlength="200" required');
    expect(html).toContain('id="visibility" name="visibility" class="form-select width-full"');
    expect(html).toContain('id="source-lang" name="sourceLang" class="form-select width-full"');
    expect(html).toContain("系统判定");
    expect(html).toContain('option value="public" selected');
    expect(html).toContain('id="body" name="body" class="form-control width-full post-editor-input" rows="18" required data-post-editor-input');
    expect(html).toContain('class="mb-3 post-editor-breakout-shell"');
    expect(html).toContain('class="post-editor-breakout" data-post-editor-root');
    expect(html).toContain('data-post-editor-root');
    expect(html).toContain('data-post-editor-pane="input"');
    expect(html).toContain('data-post-editor-pane="preview"');
    expect(html).toContain('data-post-editor-preview');
    expect(html).toContain('data-post-editor-switch="input"');
    expect(html).toContain('data-post-editor-switch="preview"');
    expect(html).toContain('class="Box-body post-editor-pane-body"');
    expect(html).toContain('src="/static/post-editor-preview.js"');
    expect(html).not.toContain('class="f6 text-gray">正文</span>');
    expect(mainSection).not.toContain('href="/account"');
  });

  it("redirects to login when admin access exists but the account page has no current user", async () => {
    state.overrideIsAdmin = true;

    const res = await request("/account");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Faccount");
  });

  it("shows the create-post validation error when the label is empty", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post",
      {
        title: "Hello",
        tag: "   ",
        body: "Body"
      },
      true
    );

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("标签不能为空");
    expect(html).toContain('name="title" type="text" class="form-control width-full" maxlength="200" value="Hello"');
  });

  it("shows the create-post validation error when the body is empty", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post",
      {
        title: "Hello",
        tag: "news",
        isDraft: "on",
        body: "   "
      },
      true
    );

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("正文不能为空");
    expect(html).toContain('name="title" type="text" class="form-control width-full" maxlength="200" value="Hello"');
  });

  it("shows the create-post fallback error when admin access exists but there is no current user", async () => {
    state.overrideIsAdmin = true;

    const res = await submitForm(
      "/post",
      {
        title: "Hello",
        tag: "news",
        body: "Body"
      }
    );

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("正文不能为空");
    expect(html).toContain('name="title" type="text" class="form-control width-full" maxlength="200" value="Hello"');
    expect(state.createdPost).toBeNull();
  });

  it("redirects non-admin users away from the edit page", async () => {
    const res = await request("/post/7/edit");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fpost%2F7%2Fedit");
  });

  it("returns 404 for invalid edit post ids", async () => {
    setSignedInAdmin();

    const res = await request("/post/not-a-number/edit", undefined, true);

    expect(res.status).toBe(404);
  });

  it("returns 404 when editing a missing post", async () => {
    setSignedInAdmin();

    const res = await request("/post/7/edit", undefined, true);

    expect(res.status).toBe(404);
  });

  it("rejects admins editing posts they do not own", async () => {
    setSignedInAdmin({ id: 5 });
    mockDb.getPostById = async () => createPostDetail({ author_id: 8, author_name: "other" });

    const res = await request("/post/7/edit", undefined, true);

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });

  it("renders the edit form with existing draft values", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ is_private: 1 });

    const res = await request("/post/7/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("编辑文章");
    expect(html).toContain('action="/post/7/edit"');
    expect(html).toContain('value="news, updates"');
    expect(html).toContain('option value="private" selected');
    expect(html).toContain('name="isDraft" type="checkbox" checked');
    expect(html).toContain('option value="zh" selected');
    expect(html).toContain('data-post-editor-empty-state="开始输入 Markdown，这里会即时显示预览。"');
    expect(html).toContain(">Existing body<");
  });

  it("renders translated posts with a translation notice and lets readers switch back to the original", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7", { headers: { cookie: "lang=en" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("Translated title");
    expect(html).toContain("Translated body");
    expect(html).toContain("machine-translated version");
    expect(html).toContain('href="/posts/7?view=original"');
  });

  it("renders the original post body when the reader explicitly requests it", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7?view=original", { headers: { cookie: "lang=en" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("原文标题");
    expect(html).toContain("原文内容");
    expect(html).toContain("original version");
    expect(html).not.toContain("machine-translated version");
    expect(html).toContain('href="/posts/7?view=translation"');
  });

  it("shows the edit validation error when the updated body is empty", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        isDraft: "on",
        body: "   "
      },
      true
    );

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("正文不能为空");
    expect(html).toContain('value="Updated"');
  });

  it("shows the edit validation error when the updated label is empty", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "   ",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("标签不能为空");
    expect(html).toContain('value="Updated"');
  });

  it("returns 404 when submitting edits for an invalid post id", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post/not-a-number/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when submitting post edits", async () => {
    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      false,
      {
        headers: {
          referer: "http://127.0.0.1:8787/post/7/edit"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fpost%2F7%2Fedit");
  });

  it("returns 404 when submitting edits for a missing post", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(404);
  });

  it("rejects submitting edits for posts the admin does not own", async () => {
    setSignedInAdmin({ id: 5 });
    mockDb.getPostById = async () => createPostDetail({ author_id: 8, author_name: "other" });

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });

  it("updates owned posts and redirects back to the post page", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7");
    expect(state.updatedPost).toEqual({
      id: 7,
      title: "Updated",
      body: "Updated body",
      sourceLang: "en",
      tag: "notes",
      isPrivate: false
    });
  });

  it("updates owned posts to private visibility", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/post/7/edit",
      {
        title: "Updated",
        tag: "notes",
        visibility: "private",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(state.updatedPost).toEqual({
      id: 7,
      title: "Updated",
      body: "Updated body",
      sourceLang: "en",
      tag: "notes",
      isPrivate: true
    });
  });

  it("renders the admin dashboard moderation sections", async () => {
    setSignedInAdmin();
    mockDb.listAllComments = async () => [createComment({ post_id: 9, post_title: "Admin Post" })];
    mockDb.listUsers = async () => [createUser()];

    const res = await request("/admin", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const usersSection = getSectionHtmlByHeading(html, "全部账号");
    const commentsSection = getSectionHtmlByHeading(html, "全站评论");

    expect(html).toContain("管理后台");
    expect(html).toContain("全站评论");
    expect(html).toContain("全部账号");
    expectHtmlFragmentsInOrder(html, ['<h2 class="h3 mb-0">全部账号</h2>', '<h2 class="h3 mb-0">全站评论</h2>']);
    expect(html).toContain("Admin Post");
    expectNoPaginationMarkup(usersSection);
    expectNoPaginationMarkup(commentsSection);
  });

  it("paginates admin users and comments independently", async () => {
    setSignedInAdmin();
    mockDb.listUsers = async () => Array.from({ length: 11 }, (_, index) =>
      createUser({
        id: index + 1,
        username: `user-${String(index + 1).padStart(2, "0")}`,
        email: `user-${String(index + 1).padStart(2, "0")}@example.com`
      })
    );
    mockDb.listAllComments = async () => Array.from({ length: 11 }, (_, index) =>
      createComment({
        id: index + 1,
        name: `Commenter ${index + 1}`,
        body: `Comment body [${String(index + 1).padStart(2, "0")}]`,
        post_id: index + 1,
        post_title: `Comment Post ${index + 1}`
      })
    );

    const res = await request("/admin", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const usersSection = getSectionHtmlByHeading(html, "全部账号");
    const commentsSection = getSectionHtmlByHeading(html, "全站评论");

    expectHtmlToContainAll(usersSection, ["user-01", "/admin?usersPage=2"]);
    expectHtmlToExcludeAll(usersSection, ["user-11@example.com", "/admin?commentsPage=2"]);
    expectHtmlToContainAll(commentsSection, ["Comment body [01]", "/admin?commentsPage=2"]);
    expectHtmlToExcludeAll(commentsSection, ["Comment body [11]", "/admin?usersPage=2"]);
  });

  it("preserves the other admin section page when switching user or comment pages", async () => {
    setSignedInAdmin();
    mockDb.listUsers = async () => Array.from({ length: 11 }, (_, index) =>
      createUser({
        id: index + 1,
        username: `user-${String(index + 1).padStart(2, "0")}`,
        email: `user-${String(index + 1).padStart(2, "0")}@example.com`
      })
    );
    mockDb.listAllComments = async () => Array.from({ length: 11 }, (_, index) =>
      createComment({
        id: index + 1,
        name: `Commenter ${index + 1}`,
        body: `Comment body [${String(index + 1).padStart(2, "0")}]`,
        post_id: index + 1,
        post_title: `Comment Post ${index + 1}`
      })
    );

    const res = await request("/admin?usersPage=2&commentsPage=2", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const usersSection = getSectionHtmlByHeading(html, "全部账号");
    const commentsSection = getSectionHtmlByHeading(html, "全站评论");

    expectHtmlToContainAll(usersSection, ["user-11@example.com", "/admin?commentsPage=2&amp;usersPage=1"]);
    expectHtmlToExcludeAll(usersSection, ["user-01@example.com", "/admin?usersPage=2&amp;commentsPage=1"]);
    expectHtmlToContainAll(commentsSection, ["Comment body [11]", "/admin?usersPage=2&amp;commentsPage=1"]);
    expectHtmlToExcludeAll(commentsSection, ["Comment body [01]", "/admin?commentsPage=2&amp;usersPage=1"]);
  });

  it("redirects anonymous users to login when opening the admin dashboard", async () => {
    const res = await request("/admin");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin");
  });

  it("deletes posts and normalizes redirects back to the admin dashboard", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/posts/7/delete", { redirectTo: "/posts/7" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(state.deletedPostIds).toEqual([7]);
  });

  it("returns 404 when deleting a post with an invalid id", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/posts/not-a-number/delete", { redirectTo: "/admin" }, true);

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when deleting a post", async () => {
    const res = await submitForm(
      "/admin/posts/7/delete",
      { redirectTo: "/admin" },
      false,
      {
        headers: {
          referer: "http://127.0.0.1:8787/admin"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin");
  });

  it("blocks normal users and clears their sessions", async () => {
    setSignedInAdmin();
    mockDb.getUserById = async () => createUser();

    const res = await submitForm("/admin/users/2/block", { redirectTo: "//evil.example" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/account");
    expect(state.userBlockedUpdates).toEqual([{ userId: 2, blocked: true }]);
    expect(state.deletedSessionUserIds).toEqual([2]);
  });

  it("rejects attempts to block your own admin account", async () => {
    setSignedInAdmin();
    mockDb.getUserById = async () => createUser({ id: 5, email: "alice@example.com" });

    const res = await submitForm("/admin/users/5/block", { redirectTo: "/account" }, true);

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });

  it("returns 404 when blocking a user with an invalid id", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/not-a-number/block", { redirectTo: "/account" }, true);

    expect(res.status).toBe(404);
  });

  it("returns 404 when blocking a missing user", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/2/block", { redirectTo: "/account" }, true);

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when blocking a user", async () => {
    const res = await submitForm(
      "/admin/users/2/block",
      { redirectTo: "/account" },
      false,
      {
        headers: {
          referer: "http://127.0.0.1:8787/admin/users/2"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin%2Fusers%2F2");
  });

  it("returns 404 when unblocking a user with an invalid id", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/not-a-number/unblock", { redirectTo: "/account" }, true);

    expect(res.status).toBe(404);
  });

  it("unblocks normal users", async () => {
    setSignedInAdmin();
    mockDb.getUserById = async () => createUser({ is_blocked: 1 });

    const res = await submitForm("/admin/users/2/unblock", { redirectTo: "/admin" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(state.userBlockedUpdates).toEqual([{ userId: 2, blocked: false }]);
  });

  it("returns 404 when unblocking a missing user", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/2/unblock", { redirectTo: "/account" }, true);

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when unblocking a user", async () => {
    const res = await submitForm(
      "/admin/users/2/unblock",
      { redirectTo: "/account" },
      false,
      {
        headers: {
          referer: "http://127.0.0.1:8787/admin/users/2"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin%2Fusers%2F2");
  });

  it("rejects attempts to unblock another admin account", async () => {
    setSignedInAdmin();
    state.adminEmails = ["alice@example.com", "bob@example.com"];
    mockDb.getUserById = async () => createUser({ email: "bob@example.com", is_blocked: 1 });

    const res = await submitForm("/admin/users/2/unblock", { redirectTo: "/account" }, true);

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });

  it("deletes normal users without authored posts", async () => {
    setSignedInAdmin();
    mockDb.getUserById = async () => createUser();
    mockDb.countPostsByAuthor = async () => 0;

    const res = await submitForm("/admin/users/2/delete", { redirectTo: "/admin" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(state.deletedUserIds).toEqual([2]);
  });

  it("returns 404 when deleting a user with an invalid id", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/not-a-number/delete", { redirectTo: "/admin" }, true);

    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting a missing user", async () => {
    setSignedInAdmin();

    const res = await submitForm("/admin/users/2/delete", { redirectTo: "/account" }, true);

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when deleting a user", async () => {
    const res = await submitForm(
      "/admin/users/2/delete",
      { redirectTo: "/account" },
      false,
      {
        headers: {
          referer: "http://127.0.0.1:8787/admin/users/2"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin%2Fusers%2F2");
  });

  it("rejects deleting another admin account", async () => {
    setSignedInAdmin();
    state.adminEmails = ["alice@example.com", "bob@example.com"];
    mockDb.getUserById = async () => createUser({ email: "bob@example.com" });

    const res = await submitForm("/admin/users/2/delete", { redirectTo: "/account" }, true);

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });
});
