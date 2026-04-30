import type {
  AuthorSummaryRow,
  AuthUserRow,
  BlogDb,
  CountPostsOptions,
  CommentRow,
  CreateCommentInput,
  CreatePostInput,
  CreateSessionInput,
  CreateUserInput,
  ListPostsOptions,
  PostTagRow,
  PostDetailRow,
  PostListRow,
  PostTranslationRow,
  SessionUserRow,
  UpsertPostTranslationInput,
  UpdatePostInput,
  UserRow
} from "./types";
import {
  addCommentsUserIdColumnSql,
  addPostsPrivateColumnSql,
  addPostsSourceLangColumnSql,
  addPostsSourceLangManualColumnSql,
  addPostTranslationsIsPublishedColumnSql,
  addUsersBlockedColumnSql,
  backfillCommentUserIdsSql,
  backfillPostTranslationsIsPublishedSql,
  createCommentsTableSql,
  createCommentsUserIndexSql,
  createPostsAuthorIndexSql,
  createPostsTableWithRequiredTagSql,
  createPostsTimestampIndexSql,
  createPostTranslationsLangStatusIndexSql,
  createPostTranslationsPostLangIndexSql,
  createPostTranslationsPostStatusIndexSql,
  createPostTranslationsTableSql,
  createSessionsTableSql,
  createSessionTokenIndexSql,
  createSessionUserIndexSql,
  createUsersTableSql
} from "./schema";
import { coerceStoredTagValue } from "../utils/post-tags";

type D1Result<T> = {
  results?: T[];
};

type TableForeignKeyRow = {
  table: string;
  from?: string;
};

const listPostsSql = `
  SELECT
    p.id,
    p.title,
    p.timestamp,
    p.tag,
    p.author_id,
    p.is_private,
    p.source_lang,
    p.source_lang_manual,
    u.username AS author_name,
    CASE WHEN p.tag LIKE '%draft%' THEN 1 ELSE 0 END AS is_draft
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE (? IS NULL OR p.author_id = ?)
    AND (? IS NULL OR (',' || lower(p.tag) || ',') LIKE '%,' || ? || ',%')
    AND (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
  ORDER BY p.timestamp DESC
  LIMIT ? OFFSET ?
`;

const countPostsSql = `
  SELECT COUNT(1) as count
  FROM posts p
  WHERE (? IS NULL OR p.author_id = ?)
    AND (? IS NULL OR (',' || lower(p.tag) || ',') LIKE '%,' || ? || ',%')
    AND (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
`;

const postDetailSql = `
  SELECT
    p.id,
    p.title,
    p.body,
    p.timestamp,
    p.tag,
    p.author_id,
    p.is_private,
    p.source_lang,
    p.source_lang_manual,
    u.username AS author_name,
    CASE WHEN p.tag LIKE '%draft%' THEN 1 ELSE 0 END AS is_draft
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE p.id = ?
    AND (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
`;

const postByTitleSql = `
  SELECT
    p.id,
    p.title,
    p.body,
    p.timestamp,
    p.tag,
    p.author_id,
    p.is_private,
    p.source_lang,
    p.source_lang_manual,
    u.username AS author_name,
    CASE WHEN p.tag LIKE '%draft%' THEN 1 ELSE 0 END AS is_draft
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE p.title = ?
    AND (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
  LIMIT 1
`;

const listCommentsSql = `
  SELECT
    c.id,
    c.name,
    c.body,
    c.is_user,
    c.timestamp,
    c.post_id,
    c.user_id,
    p.title AS post_title
  FROM comments c
  LEFT JOIN posts p ON p.id = c.post_id
  WHERE c.post_id = ?
  ORDER BY c.timestamp ASC, c.id ASC
`;

const getCommentByIdSql = `
  SELECT
    c.id,
    c.name,
    c.body,
    c.is_user,
    c.timestamp,
    c.post_id,
    c.user_id,
    p.title AS post_title
  FROM comments c
  LEFT JOIN posts p ON p.id = c.post_id
  WHERE c.id = ?
  LIMIT 1
`;

const createCommentSql = `
  INSERT INTO comments (name, body, is_user, timestamp, post_id, user_id)
  VALUES (?, ?, ?, ?, ?, ?)
`;

const listUserCommentsSql = `
  SELECT
    c.id,
    c.name,
    c.body,
    c.is_user,
    c.timestamp,
    c.post_id,
    c.user_id,
    p.title AS post_title
  FROM comments c
  LEFT JOIN posts p ON p.id = c.post_id
  WHERE c.user_id = ?
  ORDER BY c.timestamp DESC, c.id DESC
`;

const listAllCommentsSql = `
  SELECT
    c.id,
    c.name,
    c.body,
    c.is_user,
    c.timestamp,
    c.post_id,
    c.user_id,
    p.title AS post_title
  FROM comments c
  LEFT JOIN posts p ON p.id = c.post_id
  ORDER BY c.timestamp DESC, c.id DESC
`;

const deleteCommentSql = `
  DELETE FROM comments
  WHERE id = ?
`;

const getUserByEmailSql = `
  SELECT id, username, email, password_hash, is_blocked
  FROM users
  WHERE lower(email) = lower(?)
  LIMIT 1
`;

const getUserByUsernameSql = `
  SELECT id, username, email, password_hash, is_blocked
  FROM users
  WHERE username = ?
  LIMIT 1
`;

const getUserByIdSql = `
  SELECT id, username, email, is_blocked
  FROM users
  WHERE id = ?
  LIMIT 1
`;

const createUserSql = `
  INSERT INTO users (username, email, password_hash, is_blocked)
  VALUES (?, ?, ?, 0)
`;

const listUsersSql = `
  SELECT id, username, email, is_blocked
  FROM users
  ORDER BY lower(COALESCE(username, '')), lower(COALESCE(email, ''))
`;

const listPostTagsSql = `
  SELECT p.tag
  FROM posts p
  WHERE (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
  ORDER BY p.timestamp DESC
`;

const listAuthorsSql = `
  SELECT
    u.id,
    u.username,
    COUNT(1) AS post_count
  FROM posts p
  JOIN users u ON p.author_id = u.id
  WHERE (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
  GROUP BY u.id, u.username
  ORDER BY lower(COALESCE(u.username, '')) ASC
`;

const updateUserBlockedSql = `
  UPDATE users
  SET is_blocked = ?
  WHERE id = ?
`;

const deleteUserCommentsSql = `
  DELETE FROM comments
  WHERE user_id = ?
`;

const deleteUserSessionsSql = `
  DELETE FROM sessions
  WHERE user_id = ?
`;

const deleteUserSql = `
  DELETE FROM users
  WHERE id = ?
`;

const countPostsByAuthorSql = `
  SELECT COUNT(1) AS count
  FROM posts
  WHERE author_id = ?
`;

const listPostsByAuthorSql = `
  SELECT
    p.id,
    p.title,
    p.timestamp,
    p.tag,
    p.author_id,
    p.is_private,
    p.source_lang,
    p.source_lang_manual,
    u.username AS author_name,
    CASE WHEN p.tag LIKE '%draft%' THEN 1 ELSE 0 END AS is_draft
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE p.author_id = ?
    AND (? = 1 OR p.tag NOT LIKE '%draft%')
    AND (COALESCE(p.is_private, 0) = 0 OR (? IS NOT NULL AND p.author_id = ?))
  ORDER BY p.timestamp DESC
`;

const createPostSql = `
  INSERT INTO posts (title, body, timestamp, author_id, tag, is_private, source_lang, source_lang_manual)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const updatePostSql = `
  UPDATE posts
  SET title = ?, body = ?, tag = ?, is_private = ?, source_lang = ?, source_lang_manual = COALESCE(?, source_lang_manual)
  WHERE id = ?
`;

const getPostTranslationSql = `
  SELECT
    id,
    post_id,
    lang,
    translated_title,
    translated_body,
    status,
    source_hash,
    provider,
    error_message,
    is_machine_translation,
    is_published,
    translated_at
  FROM post_translations
  WHERE post_id = ?
    AND lang = ?
  LIMIT 1
`;

const listPostTranslationsSql = `
  SELECT
    id,
    post_id,
    lang,
    translated_title,
    translated_body,
    status,
    source_hash,
    provider,
    error_message,
    is_machine_translation,
    is_published,
    translated_at
  FROM post_translations
  WHERE post_id = ?
  ORDER BY lang ASC
`;

const upsertPostTranslationSql = `
  INSERT INTO post_translations (
    post_id,
    lang,
    translated_title,
    translated_body,
    status,
    source_hash,
    provider,
    error_message,
    is_machine_translation,
    is_published,
    translated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(post_id, lang) DO UPDATE SET
    translated_title = excluded.translated_title,
    translated_body = excluded.translated_body,
    status = excluded.status,
    source_hash = excluded.source_hash,
    provider = excluded.provider,
    error_message = excluded.error_message,
    is_machine_translation = excluded.is_machine_translation,
    is_published = excluded.is_published,
    translated_at = excluded.translated_at
`;

const deletePostTranslationsSql = `
  DELETE FROM post_translations
  WHERE post_id = ?
`;

const deletePostTranslationByLangSql = `
  DELETE FROM post_translations
  WHERE post_id = ? AND lang = ?
`;

const deletePostCommentsSql = `
  DELETE FROM comments
  WHERE post_id = ?
`;

const deletePostSql = `
  DELETE FROM posts
  WHERE id = ?
`;

const createSessionSql = `
  INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
  VALUES (?, ?, ?, ?)
`;

const getSessionUserByTokenHashSql = `
  SELECT
    u.id,
    u.username,
    u.email,
    u.password_hash,
    u.is_blocked,
    s.id AS session_id,
    s.expires_at AS session_expires_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?
    AND s.expires_at > ?
  LIMIT 1
`;

const deleteSessionByTokenHashSql = `
  DELETE FROM sessions
  WHERE token_hash = ?
`;

const deleteSessionsByUserIdSql = `
  DELETE FROM sessions
  WHERE user_id = ?
`;

type TableColumnRow = {
  name: string;
  notnull?: number;
};

type MigratablePostRow = {
  id: number;
  title: string | null;
  body: string | null;
  timestamp: string | null;
  author_id: number | null;
  tag: string | null;
  is_private?: number | null;
  source_lang?: string | null;
  source_lang_manual?: number | null;
};

type MigratableCommentRow = {
  id: number;
  name: string | null;
  body: string | null;
  is_user: number | null;
  timestamp: string | null;
  post_id: number | null;
  user_id?: number | null;
};

const d1SchemaPromises = new WeakMap<D1Database, Promise<void>>();

const normalizeD1Statement = (sql: string) => {
  return sql.replace(/\s+/g, " ").trim();
};

const runD1Statement = async (db: D1Database, sql: string) => {
  await db.prepare(normalizeD1Statement(sql)).run();
};

const getD1Results = <T>(result: unknown) => {
  return ((result as D1Result<T>).results ?? []) as T[];
};

const selectMigratableCommentsSql = (hasUserId: boolean) => {
  return hasUserId
    ? "SELECT id, name, body, is_user, timestamp, post_id, user_id FROM comments ORDER BY id"
    : "SELECT id, name, body, is_user, timestamp, post_id, NULL AS user_id FROM comments ORDER BY id";
};

const getPostCommentForeignKeyTarget = async (db: D1Database) => {
  const foreignKeys = getD1Results<TableForeignKeyRow>(await db.prepare("PRAGMA foreign_key_list(comments)").all<TableForeignKeyRow>());
  return foreignKeys.find((foreignKey) => foreignKey.from === "post_id")?.table ?? null;
};

const rebuildCommentsTable = async (db: D1Database, hasUserId: boolean) => {
  const existingComments = getD1Results<MigratableCommentRow>(await db.prepare(selectMigratableCommentsSql(hasUserId)).all<MigratableCommentRow>());

  await runD1Statement(db, "ALTER TABLE comments RENAME TO comments__legacy");
  await runD1Statement(db, createCommentsTableSql);

  for (const comment of existingComments) {
    await db
      .prepare("INSERT INTO comments (id, name, body, is_user, timestamp, post_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(comment.id, comment.name, comment.body, comment.is_user, comment.timestamp, comment.post_id, comment.user_id ?? null)
      .run();
  }

  await runD1Statement(db, "DROP TABLE comments__legacy");
};

const ensureD1Schema = async (db: D1Database) => {
  let schemaPromise = d1SchemaPromises.get(db);

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const userColumns = getD1Results<TableColumnRow>(await db.prepare("PRAGMA table_info(users)").all<TableColumnRow>());
      const commentColumns = getD1Results<TableColumnRow>(await db.prepare("PRAGMA table_info(comments)").all<TableColumnRow>());
      const postColumns = getD1Results<TableColumnRow>(await db.prepare("PRAGMA table_info(posts)").all<TableColumnRow>());
      const hasCommentUserId = commentColumns.some((column) => column.name === "user_id");
      let rebuiltPosts = false;

      if (userColumns.length === 0) {
        await runD1Statement(db, createUsersTableSql);
      } else if (!userColumns.some((column) => column.name === "is_blocked")) {
        await runD1Statement(db, addUsersBlockedColumnSql);
      }

      if (commentColumns.length === 0) {
        await runD1Statement(db, createCommentsTableSql);
      }

      if (postColumns.length === 0) {
        await runD1Statement(db, createPostsTableWithRequiredTagSql);
      } else {
        const tagColumn = postColumns.find((column) => column.name === "tag");
        const hasPrivateColumn = postColumns.some((column) => column.name === "is_private");
        const hasSourceLangColumn = postColumns.some((column) => column.name === "source_lang");
        const hasSourceLangManualColumn = postColumns.some((column) => column.name === "source_lang_manual");

        if (!tagColumn || tagColumn.notnull !== 1) {
          const existingPosts = getD1Results<MigratablePostRow>(
            await db
              .prepare(
                hasPrivateColumn
                  ? hasSourceLangColumn
                    ? hasSourceLangManualColumn
                      ? "SELECT id, title, body, timestamp, author_id, tag, is_private, source_lang, source_lang_manual FROM posts ORDER BY id"
                      : "SELECT id, title, body, timestamp, author_id, tag, is_private, source_lang, 0 AS source_lang_manual FROM posts ORDER BY id"
                    : "SELECT id, title, body, timestamp, author_id, tag, is_private, 'zh' AS source_lang, 0 AS source_lang_manual FROM posts ORDER BY id"
                  : hasSourceLangColumn
                    ? hasSourceLangManualColumn
                      ? "SELECT id, title, body, timestamp, author_id, tag, 0 AS is_private, source_lang, source_lang_manual FROM posts ORDER BY id"
                      : "SELECT id, title, body, timestamp, author_id, tag, 0 AS is_private, source_lang, 0 AS source_lang_manual FROM posts ORDER BY id"
                    : "SELECT id, title, body, timestamp, author_id, tag, 0 AS is_private, 'zh' AS source_lang, 0 AS source_lang_manual FROM posts ORDER BY id"
              )
              .all<MigratablePostRow>()
          );

          await runD1Statement(db, "ALTER TABLE posts RENAME TO posts__legacy");
          await runD1Statement(db, createPostsTableWithRequiredTagSql);

          for (const post of existingPosts) {
            await db
              .prepare("INSERT INTO posts (id, title, body, timestamp, author_id, tag, is_private, source_lang, source_lang_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .bind(
                post.id,
                post.title,
                post.body,
                post.timestamp,
                post.author_id,
                coerceStoredTagValue(post.tag),
                post.is_private ?? 0,
                post.source_lang ?? "zh",
                post.source_lang_manual ?? 0
              )
              .run();
          }
          rebuiltPosts = true;
        } else if (!hasPrivateColumn) {
          await runD1Statement(db, addPostsPrivateColumnSql);
        }

        if (!rebuiltPosts && !hasSourceLangColumn) {
          await runD1Statement(db, addPostsSourceLangColumnSql);
        }

        if (!rebuiltPosts && !hasSourceLangManualColumn) {
          await runD1Statement(db, addPostsSourceLangManualColumnSql);
        }
      }

      const postCommentForeignKeyTarget = commentColumns.length > 0 ? await getPostCommentForeignKeyTarget(db) : null;

      if (postCommentForeignKeyTarget && postCommentForeignKeyTarget !== "posts") {
        await rebuildCommentsTable(db, hasCommentUserId);
      } else if (commentColumns.length > 0 && !hasCommentUserId) {
        await runD1Statement(db, addCommentsUserIdColumnSql);
      }

      if (rebuiltPosts) {
        await runD1Statement(db, "DROP TABLE posts__legacy");
      }

      await runD1Statement(db, createSessionsTableSql);
      await runD1Statement(db, createSessionTokenIndexSql);
      await runD1Statement(db, createSessionUserIndexSql);
      await runD1Statement(db, createCommentsUserIndexSql);
      await runD1Statement(db, createPostsTimestampIndexSql);
      await runD1Statement(db, createPostsAuthorIndexSql);
      await runD1Statement(db, createPostTranslationsTableSql);
      await runD1Statement(db, createPostTranslationsPostLangIndexSql);
      await runD1Statement(db, createPostTranslationsPostStatusIndexSql);
      await runD1Statement(db, createPostTranslationsLangStatusIndexSql);
      const postTranslationColumns = getD1Results<TableColumnRow>(
        await db.prepare("PRAGMA table_info(post_translations)").all<TableColumnRow>()
      );
      if (!postTranslationColumns.some((column) => column.name === "is_published")) {
        await runD1Statement(db, addPostTranslationsIsPublishedColumnSql);
        await runD1Statement(db, backfillPostTranslationsIsPublishedSql);
      }
      await runD1Statement(db, backfillCommentUserIdsSql);
    })().catch((error) => {
      d1SchemaPromises.delete(db);
      throw error;
    });

    d1SchemaPromises.set(db, schemaPromise);
  }

  await schemaPromise;
};

export const createD1Db = (db: D1Database): BlogDb => {
  return {
    async ensureSchema(): Promise<void> {
      await ensureD1Schema(db);
    },
    async listPosts(options: ListPostsOptions): Promise<PostListRow[]> {
      const authorId = options.authorId ?? null;
      const tag = options.tag ?? null;
      const viewerId = options.viewerId ?? null;
      const result = await db
        .prepare(listPostsSql)
        .bind(authorId, authorId, tag, tag, options.includeDrafts ? 1 : 0, viewerId, viewerId, options.limit, options.offset)
        .all<PostListRow>();
      return getD1Results<PostListRow>(result);
    },
    async countPosts(options: CountPostsOptions): Promise<number> {
      const authorId = options.authorId ?? null;
      const tag = options.tag ?? null;
      const viewerId = options.viewerId ?? null;
      const result = await db
        .prepare(countPostsSql)
        .bind(authorId, authorId, tag, tag, options.includeDrafts ? 1 : 0, viewerId, viewerId)
        .first<{ count: number }>();
      return result?.count ?? 0;
    },
    async getPostById(id: number, options: { includeDrafts: boolean; viewerId?: number | null }): Promise<PostDetailRow | null> {
      const result = await db
        .prepare(postDetailSql)
        .bind(id, options.includeDrafts ? 1 : 0, options.viewerId ?? null, options.viewerId ?? null)
        .first<PostDetailRow>();
      return result ?? null;
    },
    async getPostByTitle(title: string, options: { includeDrafts: boolean; viewerId?: number | null }): Promise<PostDetailRow | null> {
      const result = await db
        .prepare(postByTitleSql)
        .bind(title, options.includeDrafts ? 1 : 0, options.viewerId ?? null, options.viewerId ?? null)
        .first<PostDetailRow>();
      return result ?? null;
    },
    async listComments(postId: number): Promise<CommentRow[]> {
      const result = await db.prepare(listCommentsSql).bind(postId).all<CommentRow>();
      return getD1Results<CommentRow>(result);
    },
    async getCommentById(id: number): Promise<CommentRow | null> {
      const result = await db.prepare(getCommentByIdSql).bind(id).first<CommentRow>();
      return result ?? null;
    },
    async createComment(input: CreateCommentInput): Promise<number> {
      const result = await db
        .prepare(createCommentSql)
        .bind(input.name, input.body, input.isUser ? 1 : 0, input.timestamp, input.postId, input.userId)
        .run();
      return Number(result.meta.last_row_id ?? 0);
    },
    async deleteComment(id: number): Promise<void> {
      await db.prepare(deleteCommentSql).bind(id).run();
    },
    async listUserComments(userId: number): Promise<CommentRow[]> {
      const result = await db.prepare(listUserCommentsSql).bind(userId).all<CommentRow>();
      return getD1Results<CommentRow>(result);
    },
    async listAllComments(): Promise<CommentRow[]> {
      const result = await db.prepare(listAllCommentsSql).all<CommentRow>();
      return getD1Results<CommentRow>(result);
    },
    async getUserByEmail(email: string): Promise<AuthUserRow | null> {
      const result = await db.prepare(getUserByEmailSql).bind(email).first<AuthUserRow>();
      return result ?? null;
    },
    async getUserByUsername(username: string): Promise<AuthUserRow | null> {
      const result = await db.prepare(getUserByUsernameSql).bind(username).first<AuthUserRow>();
      return result ?? null;
    },
    async getUserById(id: number): Promise<UserRow | null> {
      const result = await db.prepare(getUserByIdSql).bind(id).first<UserRow>();
      return result ?? null;
    },
    async createUser(input: CreateUserInput): Promise<UserRow> {
      const insertResult = await db.prepare(createUserSql).bind(input.username, input.email, input.passwordHash).run();
      const createdUser = await db.prepare(getUserByIdSql).bind(Number(insertResult.meta.last_row_id ?? 0)).first<UserRow>();
      if (!createdUser) {
        throw new Error("User creation failed");
      }
      return createdUser;
    },
    async listUsers(): Promise<UserRow[]> {
      const result = await db.prepare(listUsersSql).all<UserRow>();
      return getD1Results<UserRow>(result);
    },
    async listPostTags(includeDrafts: boolean, viewerId?: number | null): Promise<PostTagRow[]> {
      const result = await db.prepare(listPostTagsSql).bind(includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null).all<PostTagRow>();
      return getD1Results<PostTagRow>(result);
    },
    async listAuthors(includeDrafts: boolean, viewerId?: number | null): Promise<AuthorSummaryRow[]> {
      const result = await db.prepare(listAuthorsSql).bind(includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null).all<AuthorSummaryRow>();
      return getD1Results<AuthorSummaryRow>(result);
    },
    async updateUserBlocked(userId: number, blocked: boolean): Promise<void> {
      await db.prepare(updateUserBlockedSql).bind(blocked ? 1 : 0, userId).run();
    },
    async deleteUser(userId: number): Promise<void> {
      await db.prepare(deleteUserCommentsSql).bind(userId).run();
      await db.prepare(deleteUserSessionsSql).bind(userId).run();
      await db.prepare(deleteUserSql).bind(userId).run();
    },
    async countPostsByAuthor(authorId: number): Promise<number> {
      const result = await db.prepare(countPostsByAuthorSql).bind(authorId).first<{ count: number }>();
      return result?.count ?? 0;
    },
    async listPostsByAuthor(authorId: number, includeDrafts: boolean, viewerId?: number | null): Promise<PostListRow[]> {
      const result = await db.prepare(listPostsByAuthorSql).bind(authorId, includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null).all<PostListRow>();
      return getD1Results<PostListRow>(result);
    },
    async createPost(input: CreatePostInput): Promise<number> {
      const result = await db
        .prepare(createPostSql)
        .bind(input.title, input.body, input.timestamp, input.authorId, input.tag, input.isPrivate ? 1 : 0, input.sourceLang, input.sourceLangManual ? 1 : 0)
        .run();
      return Number(result.meta.last_row_id ?? 0);
    },
    async updatePost(input: UpdatePostInput): Promise<void> {
      await db
        .prepare(updatePostSql)
        .bind(
          input.title,
          input.body,
          input.tag,
          input.isPrivate ? 1 : 0,
          input.sourceLang,
          input.sourceLangManual === undefined ? null : input.sourceLangManual ? 1 : 0,
          input.id
        )
        .run();
    },
    async getPostTranslation(postId: number, lang: string): Promise<PostTranslationRow | null> {
      const result = await db.prepare(getPostTranslationSql).bind(postId, lang).first<PostTranslationRow>();
      return result ?? null;
    },
    async listPostTranslations(postId: number): Promise<PostTranslationRow[]> {
      const result = await db.prepare(listPostTranslationsSql).bind(postId).all<PostTranslationRow>();
      return getD1Results<PostTranslationRow>(result);
    },
    async upsertPostTranslation(input: UpsertPostTranslationInput): Promise<void> {
      await db
        .prepare(upsertPostTranslationSql)
        .bind(
          input.postId,
          input.lang,
          input.translatedTitle,
          input.translatedBody,
          input.status,
          input.sourceHash,
          input.provider,
          input.errorMessage ?? null,
          input.isMachineTranslation ? 1 : 0,
          input.isPublished ? 1 : 0,
          input.translatedAt
        )
        .run();
    },
    async deletePostTranslation(postId: number, lang: string): Promise<void> {
      await db.prepare(deletePostTranslationByLangSql).bind(postId, lang).run();
    },
    async deletePost(id: number): Promise<void> {
      await db.prepare(deletePostTranslationsSql).bind(id).run();
      await db.prepare(deletePostCommentsSql).bind(id).run();
      await db.prepare(deletePostSql).bind(id).run();
    },
    async createSession(input: CreateSessionInput): Promise<void> {
      await db.prepare(createSessionSql).bind(input.userId, input.tokenHash, input.createdAt, input.expiresAt).run();
    },
    async getSessionUserByTokenHash(tokenHash: string, now: string): Promise<SessionUserRow | null> {
      const result = await db.prepare(getSessionUserByTokenHashSql).bind(tokenHash, now).first<SessionUserRow>();
      return result ?? null;
    },
    async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
      await db.prepare(deleteSessionByTokenHashSql).bind(tokenHash).run();
    },
    async deleteSessionsByUserId(userId: number): Promise<void> {
      await db.prepare(deleteSessionsByUserIdSql).bind(userId).run();
    }
  };
};
