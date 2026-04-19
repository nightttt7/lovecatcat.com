import { beforeEach, describe, expect, it } from "vitest";
import type {
  BlogDb,
  PostDetailRow
} from "./db/types";
import { createAppTestContext } from "./test/app-test-factory";
import { hashPassword } from "./utils/auth";
import { expectDeleteConfirmationPanel } from "./test/html-assertions";

describe("createApp route flows", () => {
  let request: ReturnType<typeof createAppTestContext>["request"];
  let submitForm: ReturnType<typeof createAppTestContext>["submitForm"];
  let createPostDetail: ReturnType<typeof createAppTestContext>["createPostDetail"];
  let createComment: ReturnType<typeof createAppTestContext>["createComment"];
  let createUser: ReturnType<typeof createAppTestContext>["createUser"];
  let setSignedInUser: ReturnType<typeof createAppTestContext>["setSignedInUser"];
  let setSignedInAdmin: ReturnType<typeof createAppTestContext>["setSignedInAdmin"];
  let mockDb: BlogDb;
  let state: ReturnType<typeof createAppTestContext>["state"];

  beforeEach(() => {
    const context = createAppTestContext();
    request = context.request;
    submitForm = context.submitForm;
    createPostDetail = context.createPostDetail;
    createComment = context.createComment;
    createUser = context.createUser;
    setSignedInUser = context.setSignedInUser;
    setSignedInAdmin = context.setSignedInAdmin;
    mockDb = context.mockDb;
    state = context.state;
  });

  it("sets the language cookie and redirects back to the referer", async () => {
    const res = await request("/api/lang?to=en", {
      headers: {
        referer: "/posts/1"
      }
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/1");
    expect(res.headers.get("set-cookie")).toContain("lang=en");
  });

  it("sanitizes the login next path to keep redirects local", async () => {
    const res = await request("/login?next=//evil.example/path");

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('name="next" value="/"');
  });

  it("prefills login next from the previous local page", async () => {
    const res = await request("/login", {
      headers: {
        referer: "/posts/1?from=feed"
      }
    });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('name="next" value="/posts/1?from=feed"');
  });

  it("renders login fields with credential autocomplete hints", async () => {
    const res = await request("/login");

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('name="email" type="email" class="form-control" maxlength="64" autocomplete="username"');
    expect(html).toContain('name="password" type="password" class="form-control" maxlength="128" minlength="8" autocomplete="current-password"');
    expect(html).not.toContain('name="nickname"');
  });

  it("renders signup username field while keeping the email credential field marked for autofill", async () => {
    const res = await request("/signup");

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("用户名");
    expect(html).toContain('id="username" name="username" type="text" class="form-control" maxlength="64" required');
    expect(html).toContain('name="email" type="email" class="form-control" maxlength="64" autocomplete="username"');
    expect(html).toContain('name="password" type="password" class="form-control" maxlength="128" minlength="8" autocomplete="new-password"');
  });

  it("creates a session and redirects after a successful login", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    mockDb.getUserByEmail = async () => ({
      id: 42,
      username: "alice",
      email: "alice@example.com",
      password_hash: passwordHash,
      is_blocked: 0
    });

    const res = await submitForm("/login", {
      email: "ALICE@example.com",
      password: "correct horse battery staple",
      next: "/admin"
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(res.headers.get("set-cookie")).toContain("lovecatcat_session=");
    expect(state.createdSession?.userId).toBe(42);
    expect(state.createdSession?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts username login fallback when email lookup misses", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    mockDb.getUserByEmail = async () => null;
    mockDb.getUserByUsername = async () => ({
      id: 42,
      username: "legacy-user",
      email: "legacy-user@example.com",
      password_hash: passwordHash,
      is_blocked: 0
    });

    const res = await submitForm("/login", {
      email: "legacy-user",
      password: "correct horse battery staple",
      next: "/account"
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/account");
    expect(state.createdSession?.userId).toBe(42);
  });

  it("shows the blocked-account error on login", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    mockDb.getUserByEmail = async () => ({
      id: 42,
      username: "alice",
      email: "alice@example.com",
      password_hash: passwordHash,
      is_blocked: 1
    });

    const res = await submitForm("/login", {
      email: "alice@example.com",
      password: "correct horse battery staple",
      next: "/account"
    });

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("该账号已被封禁");
  });

  it("creates a user from the username signup field", async () => {
    let capturedCreateUserInput: Parameters<BlogDb["createUser"]>[0] | null = null;
    mockDb.createUser = async (input) => {
      capturedCreateUserInput = input;
      return { id: 9, username: input.username, email: input.email, is_blocked: 0 };
    };

    const res = await submitForm("/signup", {
      email: "alice@example.com",
      username: "Alice",
      password: "correct horse battery staple",
      next: "/account"
    });

    expect(res.status).toBe(302);
    expect(capturedCreateUserInput).toMatchObject({
      email: "alice@example.com",
      username: "Alice"
    });
  });

  it("redirects anonymous users to login when posting comments", async () => {
    const res = await submitForm(
      "/posts/1/comments",
      { body: "Hello" },
      false,
      {
        headers: {
          referer: "/posts/1"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fposts%2F1");
  });

  it("does not mark the session cookie as secure when proxy headers say the browser used http", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    mockDb.getUserByEmail = async () => ({
      id: 42,
      username: "alice",
      email: "alice@example.com",
      password_hash: passwordHash,
      is_blocked: 0
    });

    const res = await submitForm(
      "https://remote-preview.example/login",
      {
        email: "alice@example.com",
        password: "correct horse battery staple",
        next: "/posts/1"
      },
      false,
      {
        headers: {
          "x-forwarded-proto": "http"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/1");
    expect(res.headers.get("set-cookie")).toContain("lovecatcat_session=");
    expect(res.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("falls back to the home page when comment login redirect has no previous page", async () => {
    const res = await submitForm("/posts/1/comments", { body: "Hello" });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2F");
  });

  it("creates a comment for a signed-in user and truncates oversized input", async () => {
    const post: PostDetailRow = createPostDetail({
      id: 1,
      title: "Post",
      body: "Content",
      tag: null,
      author_id: 1,
      author_name: "Author",
      is_draft: 0
    });

    setSignedInUser();
    mockDb.getPostById = async () => post;

    const longComment = "x".repeat(2500);
    const res = await submitForm("/posts/1/comments", { body: longComment }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/1");
    expect(state.createdComment).toMatchObject({
      postId: 1,
      name: "alice",
      isUser: true,
      userId: 5
    });
    expect(state.createdComment?.body).toHaveLength(2000);
  });

  it("requires admin access before showing the post editor", async () => {
    const res = await request("/post");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fpost");
  });

  it("creates draft posts for admin users", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post",
      {
        title: "Hello",
        tag: "news",
        isDraft: "on",
        body: "Body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/77");
    expect(state.createdPost).toEqual({
      title: "Hello",
      body: "Body",
      timestamp: state.createdPost?.timestamp ?? "",
      authorId: 5,
      sourceLang: "en",
      tag: "news,draft",
      isPrivate: false
    });
    expect(state.upsertedTranslations).toHaveLength(1);
    expect(state.upsertedTranslations[0]).toMatchObject({
      postId: 77,
      lang: "zh",
      status: "pending",
      isMachineTranslation: true
    });
    expect(state.enqueuedTranslationJobs).toEqual([
      expect.objectContaining({ postId: 77, sourceLang: "en", targetLang: "zh", trigger: "create" })
    ]);
  });

  it("creates private posts for admin users", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/post",
      {
        title: "Secret",
        tag: "notes",
        visibility: "private",
        body: "Body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/77");
    expect(state.createdPost).toEqual({
      title: "Secret",
      body: "Body",
      timestamp: state.createdPost?.timestamp ?? "",
      authorId: 5,
      sourceLang: "en",
      tag: "notes",
      isPrivate: true
    });
    expect(state.upsertedTranslations).toHaveLength(1);
  });

  it("shows the authored-posts guard when deleting a user", async () => {
    const targetUser = createUser();

    setSignedInAdmin();
    mockDb.getUserById = async () => targetUser;
    mockDb.countPostsByAuthor = async () => 3;

    const res = await submitForm("/admin/users/2/delete", { redirectTo: "/account" }, true);

    expect(res.status).toBe(400);

    const html = await res.text();
    expect(html).toContain("该账号仍有关联文章");
  });

  it("keeps the admin account page focused on personal information", async () => {
    setSignedInAdmin();
    mockDb.listUsers = async () => [createUser()];

    const res = await request("/account", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("账户管理");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("我的评论");
    expect(html).not.toContain("全部账号");
    expect(html).not.toContain("全站评论");
    expect(html).not.toContain("我的文章");
  });

  it("keeps long account comment titles in the shared action layout", async () => {
    setSignedInAdmin();
    mockDb.listUserComments = async () => [
      createComment({
        post_id: 9,
        post_title: "Long account comment title ".repeat(8).trim(),
        user_id: 5
      })
    ];

    const res = await request("/account", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("action-card-row");
    expect(html).toContain("action-card-actions");
    expect(html).toContain("Long account comment title");
    expectDeleteConfirmationPanel(html, { actionPath: "/comments/1/delete" });
  });

  it("renders a primer confirmation panel before deleting a post", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () =>
      createPostDetail({
        id: 7,
        title: "Delete me",
        author_id: 5,
        is_draft: 0
      });

    const res = await request("/posts/7", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expectDeleteConfirmationPanel(html, {
      actionPath: "/admin/posts/7/delete",
      includesInteractiveHooks: true
    });
  });

  it("renders a primer confirmation panel before deleting an account", async () => {
    setSignedInAdmin();
    mockDb.listUsers = async () => [createUser()];

    const res = await request("/admin", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expectDeleteConfirmationPanel(html, { actionPath: "/admin/users/2/delete" });
  });
});