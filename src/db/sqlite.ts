import Database from "better-sqlite3";
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
  addUsersBlockedColumnSql,
  backfillCommentUserIdsSql,
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
  createSessionUserIndexSql
} from "./schema";
import { coerceStoredTagValue } from "../utils/post-tags";

type SqliteOptions = {
  dbPath: string;
  readonly?: boolean;
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
  INSERT INTO posts (title, body, timestamp, author_id, tag, is_private, source_lang)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const updatePostSql = `
  UPDATE posts
  SET title = ?, body = ?, tag = ?, is_private = ?, source_lang = ?
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
    translated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(post_id, lang) DO UPDATE SET
    translated_title = excluded.translated_title,
    translated_body = excluded.translated_body,
    status = excluded.status,
    source_hash = excluded.source_hash,
    provider = excluded.provider,
    error_message = excluded.error_message,
    is_machine_translation = excluded.is_machine_translation,
    translated_at = excluded.translated_at
`;

const deletePostTranslationsSql = `
  DELETE FROM post_translations
  WHERE post_id = ?
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

type TableForeignKeyRow = {
  table: string;
  from?: string;
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

const selectMigratableCommentsSql = (hasUserId: boolean) => {
  return hasUserId
    ? "SELECT id, name, body, is_user, timestamp, post_id, user_id FROM comments ORDER BY id"
    : "SELECT id, name, body, is_user, timestamp, post_id, NULL AS user_id FROM comments ORDER BY id";
};

const rebuildCommentsTable = (db: Database.Database, hasUserId: boolean) => {
  const existingComments = db.prepare(selectMigratableCommentsSql(hasUserId)).all() as MigratableCommentRow[];

  db.exec("ALTER TABLE comments RENAME TO comments__legacy");
  db.exec(createCommentsTableSql);

  const insertCommentStmt = db.prepare(
    "INSERT INTO comments (id, name, body, is_user, timestamp, post_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  for (const comment of existingComments) {
    insertCommentStmt.run(comment.id, comment.name, comment.body, comment.is_user, comment.timestamp, comment.post_id, comment.user_id ?? null);
  }

  db.exec("DROP TABLE comments__legacy");
};

export const createSqliteDb = (options: SqliteOptions): BlogDb => {
  const db = new Database(options.dbPath, { readonly: options.readonly ?? false });
  let schemaPromise: Promise<void> | null = null;

  const ensureSchema = async () => {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        const userColumns = db.prepare("PRAGMA table_info(users)").all() as TableColumnRow[];
        const commentColumns = db.prepare("PRAGMA table_info(comments)").all() as TableColumnRow[];
        const postColumns = db.prepare("PRAGMA table_info(posts)").all() as TableColumnRow[];
        const hasCommentUserId = commentColumns.some((column) => column.name === "user_id");
        let rebuiltPosts = false;

        if (!userColumns.some((column) => column.name === "is_blocked")) {
          db.exec(addUsersBlockedColumnSql);
        }

        const tagColumn = postColumns.find((column) => column.name === "tag");
        const hasPrivateColumn = postColumns.some((column) => column.name === "is_private");
        const hasSourceLangColumn = postColumns.some((column) => column.name === "source_lang");

        if (!tagColumn || tagColumn.notnull !== 1) {
          const existingPosts = db
            .prepare(
              hasPrivateColumn
                ? hasSourceLangColumn
                  ? "SELECT id, title, body, timestamp, author_id, tag, is_private, source_lang FROM posts ORDER BY id"
                  : "SELECT id, title, body, timestamp, author_id, tag, is_private, 'zh' AS source_lang FROM posts ORDER BY id"
                : hasSourceLangColumn
                  ? "SELECT id, title, body, timestamp, author_id, tag, source_lang FROM posts ORDER BY id"
                  : "SELECT id, title, body, timestamp, author_id, tag, 'zh' AS source_lang FROM posts ORDER BY id"
            )
            .all() as MigratablePostRow[];

          db.exec("ALTER TABLE posts RENAME TO posts__legacy");
          db.exec(createPostsTableWithRequiredTagSql);

          const insertPostStmt = db.prepare(
            "INSERT INTO posts (id, title, body, timestamp, author_id, tag, is_private, source_lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          );

          for (const post of existingPosts) {
            insertPostStmt.run(
              post.id,
              post.title,
              post.body,
              post.timestamp,
              post.author_id,
              coerceStoredTagValue(post.tag),
              post.is_private ?? 0,
              post.source_lang ?? "zh"
            );
          }
          rebuiltPosts = true;
        } else if (!hasPrivateColumn) {
          db.exec(addPostsPrivateColumnSql);
        }

        if (!rebuiltPosts && !hasSourceLangColumn) {
          db.exec(addPostsSourceLangColumnSql);
        }

        const postCommentForeignKeyTarget = commentColumns.length > 0
          ? ((db.prepare("PRAGMA foreign_key_list(comments)").all() as TableForeignKeyRow[]).find((foreignKey) => foreignKey.from === "post_id")?.table ?? null)
          : null;

        if (postCommentForeignKeyTarget && postCommentForeignKeyTarget !== "posts") {
          rebuildCommentsTable(db, hasCommentUserId);
        } else if (!hasCommentUserId) {
          db.exec(addCommentsUserIdColumnSql);
        }

        if (rebuiltPosts) {
          db.exec("DROP TABLE posts__legacy");
        }

        db.exec(createSessionsTableSql);
        db.exec(createSessionTokenIndexSql);
        db.exec(createSessionUserIndexSql);
        db.exec(createCommentsUserIndexSql);
        db.exec(createPostsTimestampIndexSql);
        db.exec(createPostsAuthorIndexSql);
        db.exec(createPostTranslationsTableSql);
        db.exec(createPostTranslationsPostLangIndexSql);
        db.exec(createPostTranslationsPostStatusIndexSql);
        db.exec(createPostTranslationsLangStatusIndexSql);
        db.exec(backfillCommentUserIdsSql);
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }

    await schemaPromise;
  };

  return {
    async ensureSchema(): Promise<void> {
      await ensureSchema();
    },
    async listPosts(options: ListPostsOptions): Promise<PostListRow[]> {
      const stmt = db.prepare(listPostsSql);
      const authorId = options.authorId ?? null;
      const tag = options.tag ?? null;
      const viewerId = options.viewerId ?? null;
      return stmt.all(authorId, authorId, tag, tag, options.includeDrafts ? 1 : 0, viewerId, viewerId, options.limit, options.offset) as PostListRow[];
    },
    async countPosts(options: CountPostsOptions): Promise<number> {
      const stmt = db.prepare(countPostsSql);
      const authorId = options.authorId ?? null;
      const tag = options.tag ?? null;
      const viewerId = options.viewerId ?? null;
      const row = stmt.get(authorId, authorId, tag, tag, options.includeDrafts ? 1 : 0, viewerId, viewerId) as { count?: number } | undefined;
      return row?.count ?? 0;
    },
    async getPostById(id: number, options: { includeDrafts: boolean; viewerId?: number | null }): Promise<PostDetailRow | null> {
      const stmt = db.prepare(postDetailSql);
      const viewerId = options.viewerId ?? null;
      const row = stmt.get(id, options.includeDrafts ? 1 : 0, viewerId, viewerId) as PostDetailRow | undefined;
      return row ?? null;
    },
    async getPostByTitle(title: string, options: { includeDrafts: boolean; viewerId?: number | null }): Promise<PostDetailRow | null> {
      const stmt = db.prepare(postByTitleSql);
      const viewerId = options.viewerId ?? null;
      const row = stmt.get(title, options.includeDrafts ? 1 : 0, viewerId, viewerId) as PostDetailRow | undefined;
      return row ?? null;
    },
    async listComments(postId: number): Promise<CommentRow[]> {
      const stmt = db.prepare(listCommentsSql);
      return stmt.all(postId) as CommentRow[];
    },
    async getCommentById(id: number): Promise<CommentRow | null> {
      const stmt = db.prepare(getCommentByIdSql);
      const row = stmt.get(id) as CommentRow | undefined;
      return row ?? null;
    },
    async createComment(input: CreateCommentInput): Promise<number> {
      const stmt = db.prepare(createCommentSql);
      const result = stmt.run(input.name, input.body, input.isUser ? 1 : 0, input.timestamp, input.postId, input.userId);
      return Number(result.lastInsertRowid);
    },
    async deleteComment(id: number): Promise<void> {
      const stmt = db.prepare(deleteCommentSql);
      stmt.run(id);
    },
    async listUserComments(userId: number): Promise<CommentRow[]> {
      const stmt = db.prepare(listUserCommentsSql);
      return stmt.all(userId) as CommentRow[];
    },
    async listAllComments(): Promise<CommentRow[]> {
      const stmt = db.prepare(listAllCommentsSql);
      return stmt.all() as CommentRow[];
    },
    async getUserByEmail(email: string): Promise<AuthUserRow | null> {
      const stmt = db.prepare(getUserByEmailSql);
      const row = stmt.get(email) as AuthUserRow | undefined;
      return row ?? null;
    },
    async getUserByUsername(username: string): Promise<AuthUserRow | null> {
      const stmt = db.prepare(getUserByUsernameSql);
      const row = stmt.get(username) as AuthUserRow | undefined;
      return row ?? null;
    },
    async getUserById(id: number): Promise<UserRow | null> {
      const stmt = db.prepare(getUserByIdSql);
      const row = stmt.get(id) as UserRow | undefined;
      return row ?? null;
    },
    async createUser(input: CreateUserInput): Promise<UserRow> {
      const stmt = db.prepare(createUserSql);
      const result = stmt.run(input.username, input.email, input.passwordHash);
      const createdUser = db.prepare(getUserByIdSql).get(Number(result.lastInsertRowid)) as UserRow | undefined;
      if (!createdUser) {
        throw new Error("User creation failed");
      }
      return createdUser;
    },
    async listUsers(): Promise<UserRow[]> {
      const stmt = db.prepare(listUsersSql);
      return stmt.all() as UserRow[];
    },
    async listPostTags(includeDrafts: boolean, viewerId?: number | null): Promise<PostTagRow[]> {
      const stmt = db.prepare(listPostTagsSql);
      return stmt.all(includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null) as PostTagRow[];
    },
    async listAuthors(includeDrafts: boolean, viewerId?: number | null): Promise<AuthorSummaryRow[]> {
      const stmt = db.prepare(listAuthorsSql);
      return stmt.all(includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null) as AuthorSummaryRow[];
    },
    async updateUserBlocked(userId: number, blocked: boolean): Promise<void> {
      const stmt = db.prepare(updateUserBlockedSql);
      stmt.run(blocked ? 1 : 0, userId);
    },
    async deleteUser(userId: number): Promise<void> {
      db.prepare(deleteUserCommentsSql).run(userId);
      db.prepare(deleteUserSessionsSql).run(userId);
      db.prepare(deleteUserSql).run(userId);
    },
    async countPostsByAuthor(authorId: number): Promise<number> {
      const stmt = db.prepare(countPostsByAuthorSql);
      const row = stmt.get(authorId) as { count?: number } | undefined;
      return row?.count ?? 0;
    },
    async listPostsByAuthor(authorId: number, includeDrafts: boolean, viewerId?: number | null): Promise<PostListRow[]> {
      const stmt = db.prepare(listPostsByAuthorSql);
      return stmt.all(authorId, includeDrafts ? 1 : 0, viewerId ?? null, viewerId ?? null) as PostListRow[];
    },
    async createPost(input: CreatePostInput): Promise<number> {
      const stmt = db.prepare(createPostSql);
      const result = stmt.run(input.title, input.body, input.timestamp, input.authorId, input.tag, input.isPrivate ? 1 : 0, input.sourceLang);
      return Number(result.lastInsertRowid);
    },
    async updatePost(input: UpdatePostInput): Promise<void> {
      const stmt = db.prepare(updatePostSql);
      stmt.run(input.title, input.body, input.tag, input.isPrivate ? 1 : 0, input.sourceLang, input.id);
    },
    async getPostTranslation(postId: number, lang: string): Promise<PostTranslationRow | null> {
      const stmt = db.prepare(getPostTranslationSql);
      const row = stmt.get(postId, lang) as PostTranslationRow | undefined;
      return row ?? null;
    },
    async listPostTranslations(postId: number): Promise<PostTranslationRow[]> {
      const stmt = db.prepare(listPostTranslationsSql);
      return stmt.all(postId) as PostTranslationRow[];
    },
    async upsertPostTranslation(input: UpsertPostTranslationInput): Promise<void> {
      const stmt = db.prepare(upsertPostTranslationSql);
      stmt.run(
        input.postId,
        input.lang,
        input.translatedTitle,
        input.translatedBody,
        input.status,
        input.sourceHash,
        input.provider,
        input.errorMessage ?? null,
        input.isMachineTranslation ? 1 : 0,
        input.translatedAt
      );
    },
    async deletePost(id: number): Promise<void> {
      db.prepare(deletePostTranslationsSql).run(id);
      db.prepare(deletePostCommentsSql).run(id);
      db.prepare(deletePostSql).run(id);
    },
    async createSession(input: CreateSessionInput): Promise<void> {
      const stmt = db.prepare(createSessionSql);
      stmt.run(input.userId, input.tokenHash, input.createdAt, input.expiresAt);
    },
    async getSessionUserByTokenHash(tokenHash: string, now: string): Promise<SessionUserRow | null> {
      const stmt = db.prepare(getSessionUserByTokenHashSql);
      const row = stmt.get(tokenHash, now) as SessionUserRow | undefined;
      return row ?? null;
    },
    async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
      const stmt = db.prepare(deleteSessionByTokenHashSql);
      stmt.run(tokenHash);
    },
    async deleteSessionsByUserId(userId: number): Promise<void> {
      const stmt = db.prepare(deleteSessionsByUserIdSql);
      stmt.run(userId);
    }
  };
};
