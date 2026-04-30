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

    const res = await request("/posts/new", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const mainSection = getMainHtml(html);
    expect(html).toContain("发布文章");
    expect(html).toContain('form method="post" action="/posts"');
    expect(html).toContain('id="title" name="title" type="text" class="form-control width-full" maxlength="200"');
    expect(html).toContain('id="tag" name="tag" type="text" class="form-control width-full" maxlength="200" required');
    expect(html).toContain('id="visibility" name="visibility" class="form-select width-full"');
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
    expect(html).not.toContain('id="source-lang" name="sourceLang" class="form-select width-full"');
    expect(html).not.toContain("系统判定");
    expect(html).not.toContain("浏览器即时渲染，宽屏双栏，窄屏点击切换。");
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
      "/posts",
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
      "/posts",
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
      "/posts",
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

  it("creates posts and redirects to the original page", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/posts",
      {
        title: "Hello",
        tag: "news",
        body: "Body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/77/original");
    expect(state.createdPost).toEqual({
      title: "Hello",
      body: "Body",
      timestamp: expect.any(String),
      authorId: 5,
      sourceLang: "en",
      tag: "news",
      isPrivate: false
    });
  });

  it("redirects non-admin users away from the edit page", async () => {
    const res = await request("/posts/7/original/edit");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fposts%2F7%2Foriginal%2Fedit");
  });

  it("returns 404 for invalid edit post ids", async () => {
    setSignedInAdmin();

    const res = await request("/posts/not-a-number/original/edit", undefined, true);

    expect(res.status).toBe(404);
  });

  it("returns 404 when editing a missing post", async () => {
    setSignedInAdmin();

    const res = await request("/posts/7/original/edit", undefined, true);

    expect(res.status).toBe(404);
  });

  it("rejects admins editing posts they do not own", async () => {
    setSignedInAdmin({ id: 5 });
    mockDb.getPostById = async () => createPostDetail({ author_id: 8, author_name: "other" });

    const res = await request("/posts/7/original/edit", undefined, true);

    expect(res.status).toBe(403);

    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
  });

  it("renders the edit form with existing draft values", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ is_private: 1 });

    const res = await request("/posts/7/original/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("编辑文章");
    expect(html).toContain('action="/posts/7/original/edit"');
    expect(html).toContain('value="news, updates"');
    expect(html).toContain('option value="private" selected');
    expect(html).toContain('name="isDraft" type="checkbox" checked');
    expect(html).toContain('data-post-editor-empty-state="开始输入 Markdown，这里会即时显示预览。"');
    expect(html).toContain(">Existing body<");
    expect(html).toContain("查看原文");
    expect(html).toContain('href="/posts/7/original"');
    expect(html).not.toContain('id="source-lang" name="sourceLang" class="form-select width-full"');
    expect(html).not.toContain('action="/posts/7/translation/generate"');
    expect(html).not.toContain('action="/posts/7/translation/edit"');
    expect(html).not.toContain("浏览器即时渲染，宽屏双栏，窄屏点击切换。");
  });

  it("returns 404 for the translation editor before a translation exists", async () => {
    setSignedInAdmin();
    state.translationModel = "gpt-5.4-mini";
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh" });

    const res = await request("/posts/7/translation/edit", undefined, true);

    expect(res.status).toBe(404);
  });

  it("renders the standalone translation page for owned posts with unpublished translation actions", async () => {
    setSignedInAdmin();
    state.translationModel = "gpt-5.4-mini";
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh" });
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", status: "pending", is_published: 0 });

    const res = await request("/posts/7/translation/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("翻译版本");
    expect(html).toContain('action="/posts/7/translation/edit?lang=en"');
    expect(html).toContain('formaction="/posts/7/translation/generate"');
    expect(html).toContain('id="translation-source-lang" name="sourceLang" class="form-select width-full"');
    expect(html).toContain("系统判定");
    expect(html).toContain("等待生成");
    expect(html).toContain("请刷新页面查看最新结果。");
    expect(html).toContain("使用模型");
    expect(html).toContain("gpt-5.4-mini");
    expect(html).toContain('id="translated-body" name="translatedBody" class="form-control width-full post-editor-input" rows="18" data-post-editor-input');
    expect(html).toContain('data-post-editor-preview');
    expect(html).toContain("保存草稿");
    expect(html).toContain("发布翻译");
    expect(html).toContain("查看原文");
    expect(html).toContain("翻译状态");
    expect(html).toContain("翻译发布状态");
    expect(html).toContain('formaction="/posts/7/translation/delete?lang=en"');
    expect(html).toContain("删除翻译");
    expect(html).not.toContain('formaction="/posts/7/translation/unpublish"');
    expect(html).not.toContain("下线翻译");
    expect(html).not.toContain("直接跳过");
  });

  it("opens and can delete a listed translation whose language differs from the current target", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ source_lang: "en" });
    mockDb.getPostTranslation = async (_postId, lang) =>
      lang === "en" ? createPostTranslation({ post_id: 7, lang: "en", status: "draft", is_published: 0 }) : null;

    const res = await request("/posts/7/translation/edit?lang=en", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("翻译版本");
    expect(html).toContain("英文");
    expect(html).toContain('action="/posts/7/translation/edit?lang=en"');
    expect(html).toContain('formaction="/posts/7/translation/delete?lang=en"');

    const deleteRes = await submitForm("/posts/7/translation/delete?lang=en", {}, true);

    expect(deleteRes.status).toBe(302);
    expect(deleteRes.headers.get("location")).toBe("/posts/7/original");
    expect(state.deletedTranslations).toEqual([{ postId: 7, lang: "en" }]);
  });

  it("renders unpublish and delete actions for published translations", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh" });
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", status: "completed", is_published: 1 });

    const res = await request("/posts/7/translation/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expectHtmlFragmentsInOrder(html, ["下线翻译", "删除翻译"]);
    expect(html).toContain('formaction="/posts/7/translation/unpublish?lang=en"');
    expect(html).toContain('formaction="/posts/7/translation/delete?lang=en"');
  });

  it("warns on the translation page when the original changed after the translation was last updated", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({
      title: "Updated original",
      body: "Updated original body",
      source_lang: "zh"
    });
    mockDb.getPostTranslation = async () =>
      createPostTranslation({
        post_id: 7,
        lang: "en",
        status: "completed",
        source_hash: "old-source-hash"
      });

    const res = await request("/posts/7/translation/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("上次更新原文后还没有更新翻译。");
    expect(html).toContain("已完成");
  });

  it("shows the stored translation failure reason on the standalone translation page", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh" });
    mockDb.getPostTranslation = async () =>
      createPostTranslation({
        post_id: 7,
        lang: "en",
        status: "failed",
        error_message: "OpenAI request failed with 404: model not found"
      });

    const res = await request("/posts/7/translation/edit", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("生成失败");
    expect(html).toContain("失败原因");
    expect(html).toContain("OpenAI request failed with 404: model not found");
  });

  it("renders translated posts with a translation notice and lets readers switch back to the original", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7/translation", { headers: { cookie: "lang=en" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("Translated title");
    expect(html).not.toContain("original title [原文标题]");
    expect(html).toContain("Translated body");
    expect(html).toContain("machine-translated version");
    expect(html).toContain('href="/posts/7/original"');
  });

  it("redirects the default post reader to the translation for non-authors when languages differ", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", author_id: 5, source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7", { headers: { cookie: "lang=en" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation");
  });

  it("redirects the default post reader to the original for authors even when languages differ", async () => {
    setSignedInAdmin({ id: 5 });
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", author_id: 5, source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7", { headers: { cookie: "lang=en" } }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/original");
  });

  it("redirects admin non-authors to the translation when languages differ", async () => {
    setSignedInAdmin({ id: 9 });
    const translatedPost = createPostDetail({ id: 7, title: "Original title", body: "Original body", author_id: 5, source_lang: "en", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "zh", translated_title: "翻译后的标题", translated_body: "翻译后的内容", status: "completed" });

    const res = await request("/posts/7", undefined, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation");
  });

  it("redirects the default post reader to the original when languages match", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", author_id: 5, source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7", { headers: { cookie: "lang=zh" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/original");
  });

  it("uses ascii parentheses for translated titles in the Chinese UI", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "Original title", body: "Original body", source_lang: "en", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "zh", translated_title: "翻译后的标题", translated_body: "翻译后的内容", status: "completed" });

    const res = await request("/posts/7/translation", { headers: { cookie: "lang=zh" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("翻译后的标题");
    expect(html).not.toContain("原标题 [Original title]");
    expect(html).toContain("翻译后的内容");
  });

  it("renders manually edited translations with the generic translated notice", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "Original title", body: "Original body", source_lang: "en", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({
      post_id: 7,
      lang: "zh",
      translated_title: "手动修改后的标题",
      translated_body: "手动修改后的内容",
      status: "completed",
      is_machine_translation: 0
    });

    const res = await request("/posts/7/translation", { headers: { cookie: "lang=zh" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("当前阅读的是翻译版本");
    expect(html).not.toContain("机器翻译版本");
  });

  it("renders the original post body when the reader explicitly requests it", async () => {
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7/original", { headers: { cookie: "lang=en" } });

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("原文标题");
    expect(html).toContain("原文内容");
    expect(html).toContain("original version");
    expect(html).not.toContain("machine-translated version");
    expect(html).not.toContain("original title [原文标题]");
    expect(html).toContain('href="/posts/7/translation"');
  });

  it("does not show the translated-version flash when source and reader languages match", async () => {
    setSignedInAdmin();
    const translatedPost = createPostDetail({ id: 7, title: "原文标题", body: "原文内容", source_lang: "zh", is_draft: 0 });
    mockDb.getPostById = async () => translatedPost;
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "en", translated_title: "Translated title", translated_body: "Translated body", status: "completed" });

    const res = await request("/posts/7/original", { headers: { cookie: "lang=zh" } }, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).not.toContain('class="flash flash-warn mb-3"');
    expect(html).not.toContain("阅读翻译版");
    expect(html).toContain("查看翻译");
    expect(html).toContain('href="/posts/7/translation"');
  });

  it("shows the edit validation error when the updated body is empty", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/posts/7/original/edit",
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
      "/posts/7/original/edit",
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
      "/posts/not-a-number/original/edit",
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
      "/posts/7/original/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      false,
      {
        headers: {
          referer: "/posts/7/original/edit"
        }
      }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fposts%2F7%2Foriginal%2Fedit");
  });

  it("returns 404 when submitting edits for a missing post", async () => {
    setSignedInAdmin();

    const res = await submitForm(
      "/posts/7/original/edit",
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
      "/posts/7/original/edit",
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

  it("redirects to the original page and preserves stored source language after editing original content", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/posts/7/original/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/original");
    expect(state.updatedPost).toEqual({
      id: 7,
      title: "Updated",
      body: "Updated body",
      sourceLang: "zh",
      tag: "notes",
      isPrivate: false
    });
  });

  it("redirects back to the post page when editing only metadata", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ title: "Draft Post", body: "Existing body", source_lang: "en", tag: "news,draft,updates" });

    const res = await submitForm(
      "/posts/7/original/edit",
      {
        title: "Draft Post",
        tag: "notes",
        body: "Existing body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/original");
  });

  it("does not mutate or enqueue existing translations when the source post changes", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ source_lang: "en", tag: "notes" });
    mockDb.listPostTranslations = async () => {
      throw new Error("Original edits should not rewrite translation records");
    };

    const res = await submitForm(
      "/posts/7/original/edit",
      {
        title: "Updated",
        tag: "notes",
        body: "Updated body"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/original");
    expect(state.upsertedTranslations).toHaveLength(0);
    expect(state.deletedTranslations).toHaveLength(0);
    expect(state.enqueuedTranslationJobs).toHaveLength(0);
  });

  it("updates owned posts to private visibility", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail();

    const res = await submitForm(
      "/posts/7/original/edit",
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
      sourceLang: "zh",
      tag: "notes",
      isPrivate: true
    });
  });

  it("queues translation generation only when the admin clicks generate translated version", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({
      title: "English title",
      body: "English body",
      source_lang: "en",
      tag: "notes",
      is_draft: 0
    });

    const res = await submitForm(
      "/posts/7/translation/generate",
      {
        sourceLang: "en"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation/edit?lang=zh&translation=queued");
    expect(state.upsertedTranslations).toHaveLength(1);
    expect(state.upsertedTranslations[0]).toMatchObject({
      postId: 7,
      lang: "zh",
      status: "pending",
      isMachineTranslation: true
    });
    expect(state.enqueuedTranslationJobs).toEqual([
      expect.objectContaining({ postId: 7, sourceLang: "en", targetLang: "zh", trigger: "update" })
    ]);
  });

  it("forbids admins from generating a translation for posts they do not own", async () => {
    setSignedInAdmin({ id: 5 });
    mockDb.getPostById = async () => createPostDetail({ author_id: 8, author_name: "other", source_lang: "en" });

    const res = await submitForm(
      "/posts/7/translation/generate",
      { sourceLang: "en" },
      true
    );

    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("你没有权限执行这个操作");
    expect(state.upsertedTranslations).toHaveLength(0);
    expect(state.enqueuedTranslationJobs).toHaveLength(0);
  });

  it("forbids admins from saving a translation for posts they do not own", async () => {
    setSignedInAdmin({ id: 5 });
    mockDb.getPostById = async () => createPostDetail({ author_id: 8, author_name: "other", source_lang: "en" });

    const res = await submitForm(
      "/posts/7/translation/edit",
      { translatedTitle: "x", translatedBody: "y" },
      true
    );

    expect(res.status).toBe(403);
    expect(state.upsertedTranslations).toHaveLength(0);
  });

  it("redirects to login when a non-admin attempts to generate or save a translation", async () => {
    const generateRes = await submitForm("/posts/7/translation/generate", { sourceLang: "en" });
    expect(generateRes.status).toBe(302);
    expect(generateRes.headers.get("location")).toBe("/login?next=%2Fposts%2F7%2Ftranslation%2Fedit");

    const saveRes = await submitForm("/posts/7/translation/edit", { translatedBody: "x" });
    expect(saveRes.status).toBe(302);
    expect(saveRes.headers.get("location")).toBe("/login?next=%2Fposts%2F7%2Ftranslation%2Fedit");
  });

  it("lets admins save a translation draft", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({
      title: "English title",
      body: "English body",
      source_lang: "en",
      tag: "notes",
      is_draft: 0
    });
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "zh", status: "draft" });

    const res = await submitForm(
      "/posts/7/translation/edit",
      {
        translatedTitle: "中文标题草稿",
        translatedBody: "中文正文草稿",
        translationAction: "draft"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation/edit?lang=zh&translation=draft");
    expect(state.upsertedTranslations).toHaveLength(1);
    expect(state.upsertedTranslations[0]).toMatchObject({
      postId: 7,
      lang: "zh",
      translatedTitle: "中文标题草稿",
      translatedBody: "中文正文草稿",
      status: "draft",
      provider: "manual:editor",
      isMachineTranslation: false,
      translatedAt: null
    });
  });

  it("lets admins save a manually edited translated version", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({
      title: "English title",
      body: "English body",
      source_lang: "en",
      tag: "notes",
      is_draft: 0
    });
    mockDb.getPostTranslation = async () => createPostTranslation({ post_id: 7, lang: "zh", status: "draft" });

    const res = await submitForm(
      "/posts/7/translation/edit",
      {
        translatedTitle: "中文标题",
        translatedBody: "中文正文"
      },
      true
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation");
    expect(state.upsertedTranslations).toHaveLength(1);
    expect(state.upsertedTranslations[0]).toMatchObject({
      postId: 7,
      lang: "zh",
      translatedTitle: "中文标题",
      translatedBody: "中文正文",
      status: "completed",
      provider: "manual:editor",
      isMachineTranslation: false,
      isPublished: true
    });
  });

  it("publishes an existing generated translation when the submit payload omits translated fields", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({
      title: "English title",
      body: "English body",
      source_lang: "en",
      tag: "notes",
      is_draft: 0
    });
    mockDb.getPostTranslation = async () =>
      createPostTranslation({
        post_id: 7,
        lang: "zh",
        translated_title: "已有中文标题",
        translated_body: "已有中文正文",
        status: "draft",
        is_published: 0
      });

    const res = await submitForm("/posts/7/translation/edit", {}, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/posts/7/translation");
    expect(state.upsertedTranslations[0]).toMatchObject({
      postId: 7,
      lang: "zh",
      translatedTitle: "已有中文标题",
      translatedBody: "已有中文正文",
      status: "completed",
      isPublished: true
    });
  });

  it("renders the admin dashboard moderation sections", async () => {
    setSignedInAdmin();
    mockDb.listAllComments = async () => [createComment({ post_id: 9, post_title: "Admin Post" })];
    mockDb.listUsers = async () => [createUser()];
    mockDb.listPostsByAuthor = async () => [
      createPostDetail({ id: 7, title: "Admin Draft", source_lang: "zh", is_draft: 1, is_private: 0 }),
      createPostDetail({ id: 8, title: "Admin Published", source_lang: "en", is_draft: 0, is_private: 0 })
    ];
    mockDb.listPostTranslations = async (postId) =>
      postId === 7
        ? [createPostTranslation({ post_id: 7, lang: "en", status: "draft", is_published: 0 })]
        : [createPostTranslation({ post_id: 8, lang: "zh", status: "completed", is_published: 1 })];

    const res = await request("/admin", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const postsSection = getSectionHtmlByHeading(html, "我的文章");
    const usersSection = getSectionHtmlByHeading(html, "全部账号");
    const commentsSection = getSectionHtmlByHeading(html, "全站评论");

    expect(html).toContain("管理后台");
    expect(html).toContain("我的文章");
    expect(html).toContain("全站评论");
    expect(html).toContain("全部账号");
    expectHtmlFragmentsInOrder(html, ['<h2 class="h3 mb-0">我的文章</h2>', '<h2 class="h3 mb-0">全部账号</h2>', '<h2 class="h3 mb-0">全站评论</h2>']);
    expectHtmlToContainAll(postsSection, ["Admin Draft", "源语言", "英文", "Admin Published", "中文", "全部重新判断语言"]);
    expect(postsSection).toContain('<a href="/posts/7/original" class="text-bold color-fg-default action-card-title-link">Admin Draft</a>');
    expect(postsSection).toContain('<a href="/posts/8/original" class="text-bold color-fg-default action-card-title-link">Admin Published</a>');
    expect(postsSection).toContain('action="/admin/posts/source-language/detect"');
    expect(postsSection).toContain('action="/admin/posts/7/source-language"');
    expect(postsSection).toContain('action="/admin/posts/8/source-language"');
    expect(postsSection).toContain('onchange="this.form.requestSubmit ? this.form.requestSubmit() : this.form.submit()"');
    expect(postsSection).not.toContain("保存源语言");
    expect(postsSection).not.toContain("(草稿)");
    expect(postsSection).not.toContain("(已完成)");
    expect(postsSection).toContain('<a href="/posts/7/translation/edit?lang=en" class="d-inline-block mr-1 color-fg-default">英文</a>');
    expect(postsSection).toContain('<a href="/posts/8/translation/edit?lang=zh" class="d-inline-block mr-1 color-fg-default">中文</a>');
    expect(html).toContain("Admin Post");
    expectNoPaginationMarkup(postsSection);
    expectNoPaginationMarkup(usersSection);
    expectNoPaginationMarkup(commentsSection);
  });

  it("shows one global source-language redetection action", async () => {
    setSignedInAdmin();
    mockDb.listPostsByAuthor = async () => [
      createPostDetail({ id: 7, title: "Translated Post", source_lang: "zh" }),
      createPostDetail({ id: 8, title: "No Translation Post", source_lang: "en" })
    ];
    mockDb.listPostTranslations = async (postId) =>
      postId === 7 ? [createPostTranslation({ post_id: 7, lang: "en", status: "draft", is_published: 0 })] : [];

    const res = await request("/admin", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    const postsSection = getSectionHtmlByHeading(html, "我的文章");

    expectHtmlToContainAll(postsSection, ["Translated Post", "No Translation Post", "全部重新判断语言"]);
    expect(postsSection).not.toContain("保存源语言");
    expect(postsSection).not.toContain('name="mode" value="detect"');
    expect(postsSection.match(/全部重新判断语言/g)).toHaveLength(1);
  });

  it("manually saves source language and removes translations that no longer match the target language", async () => {
    setSignedInAdmin();
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh", title: "English title", body: "English body" });
    mockDb.listPostTranslations = async () => [
      createPostTranslation({ post_id: 7, lang: "en", status: "draft", is_published: 0 }),
      createPostTranslation({ post_id: 7, lang: "zh", status: "draft", is_published: 0 })
    ];

    const res = await submitForm("/admin/posts/7/source-language", { sourceLang: "en" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(state.updatedPost).toMatchObject({ id: 7, sourceLang: "en", sourceLangManual: true });
    expect(state.deletedTranslations).toEqual([{ postId: 7, lang: "en" }]);
  });

  it("redetects source language globally for posts without translations", async () => {
    setSignedInAdmin();
    mockDb.listPostsByAuthor = async () => [createPostDetail({ id: 7, source_lang: "zh", source_lang_manual: 0 })];
    mockDb.getPostById = async () => createPostDetail({ source_lang: "zh", title: "English title", body: "English body" });
    mockDb.listPostTranslations = async () => [];

    const res = await submitForm("/admin/posts/source-language/detect", {}, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?adminNotice=source-language-detected");
    expect(state.updatedPost).toMatchObject({ id: 7, sourceLang: "en", sourceLangManual: false });
    expect(state.deletedTranslations).toHaveLength(0);
  });

  it("shows a notice after global source-language redetection", async () => {
    setSignedInAdmin();

    const res = await request("/admin?adminNotice=source-language-detected", undefined, true);

    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('class="flash flash-success mb-3"');
    expect(html).toContain("已重新判断可自动更新文章的源语言。");
  });

  it("skips global source-language redetection for translated and manually locked posts", async () => {
    setSignedInAdmin();
    const updatedPosts: unknown[] = [];
    mockDb.listPostsByAuthor = async () => [
      createPostDetail({ id: 7, source_lang: "zh", source_lang_manual: 0 }),
      createPostDetail({ id: 8, source_lang: "zh", source_lang_manual: 1 }),
      createPostDetail({ id: 9, source_lang: "zh", source_lang_manual: 0 })
    ];
    mockDb.listPostTranslations = async (postId) => postId === 9 ? [createPostTranslation({ post_id: 9, lang: "en", status: "draft" })] : [];
    mockDb.getPostById = async (postId) => createPostDetail({ id: postId, source_lang: "zh", title: "English title", body: "English body" });
    mockDb.updatePost = async (input) => {
      updatedPosts.push(input);
    };

    const res = await submitForm("/admin/posts/source-language/detect", {}, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?adminNotice=source-language-detected");
    expect(updatedPosts).toHaveLength(1);
    expect(updatedPosts[0]).toMatchObject({ id: 7, sourceLang: "en", sourceLangManual: false });
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

    const res = await submitForm("/posts/7/delete", { redirectTo: "/posts/7/original" }, true);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(state.deletedPostIds).toEqual([7]);
  });

  it("returns 404 when deleting a post with an invalid id", async () => {
    setSignedInAdmin();

    const res = await submitForm("/posts/not-a-number/delete", { redirectTo: "/admin" }, true);

    expect(res.status).toBe(404);
  });

  it("redirects anonymous users to login when deleting a post", async () => {
    const res = await submitForm(
      "/posts/7/delete",
      { redirectTo: "/admin" },
      false,
      {
        headers: {
          referer: "/admin"
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
          referer: "/admin/users/2"
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
          referer: "/admin/users/2"
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
          referer: "/admin/users/2"
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
