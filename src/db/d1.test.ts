import { describe, expect, it } from "vitest";
import { createD1Db } from "./d1";
import type { PostDetailRow, PostListRow, SessionUserRow, UserRow } from "./types";

type CallRecord = {
  method: "all" | "first" | "run" | "exec";
  sql: string;
  args: unknown[];
};

class MockPreparedStatement {
  private boundArgs: unknown[] = [];

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string
  ) {}

  bind(...args: unknown[]) {
    this.boundArgs = args;
    return this;
  }

  async all<T>() {
    return this.db.handleAll<T>(this.sql, this.boundArgs);
  }

  async first<T>() {
    return this.db.handleFirst<T>(this.sql, this.boundArgs);
  }

  async run() {
    return this.db.handleRun(this.sql, this.boundArgs);
  }
}

class MockD1Database {
  readonly calls: CallRecord[] = [];
  readonly execCalls: string[] = [];

  userColumns: Array<{ name: string }> = [{ name: "id" }];
  commentColumns: Array<{ name: string }> = [{ name: "id" }];
  commentForeignKeys: Array<{ table: string; from?: string }> = [];
  postColumns: Array<{ name: string; notnull?: number }> = [{ name: "tag", notnull: 0 }];
  failingRunSqlFragment: string | null = null;
  failingRunError = new Error("Mock run failure");
  existingPostsResults = [] as Array<{ id: number; title: string | null; body: string | null; timestamp: string | null; author_id: number | null; tag: string | null; is_private?: number | null }>;
  existingCommentsResults = [] as Array<{ id: number; name: string | null; body: string | null; is_user: number | null; timestamp: string | null; post_id: number | null; user_id?: number | null }>;
  listPostsResults: PostListRow[] = [];
  postByIdResult: PostDetailRow | null = null;
  postByTitleResult: PostDetailRow | null = null;
  listCommentsResults = [] as Array<{ id: number; body: string }>;
  commentByIdResult: { id: number; body: string } | null = null;
  listUsersResults: UserRow[] = [];
  userByEmailResult: (UserRow & { password_hash: string | null }) | null = null;
  userByUsernameResult: (UserRow & { password_hash: string | null }) | null = null;
  userByIdResult: UserRow | null = null;
  createdUserResult: UserRow | null = null;
  listUserCommentsResults = [] as Array<{ id: number; body: string }>;
  listAllCommentsResults = [] as Array<{ id: number; body: string }>;
  listPostsByAuthorResults: PostListRow[] = [];
  sessionUserResult: SessionUserRow | null = null;
  countPostsResult: number | null = 0;
  countPostsByAuthorResult: number | null = 0;
  lastRowIds = {
    createComment: 11,
    createUser: 21,
    createPost: 31
  };

  prepare(sql: string) {
    return new MockPreparedStatement(this, sql);
  }

  async exec(sql: string) {
    this.calls.push({ method: "exec", sql, args: [] });
    this.execCalls.push(sql);
  }

  findCall(method: CallRecord["method"], sqlFragment: string) {
    return this.calls.find((call) => call.method === method && call.sql.includes(sqlFragment));
  }

  async handleAll<T>(sql: string, args: unknown[]) {
    this.calls.push({ method: "all", sql, args });

    if (sql.includes("PRAGMA table_info(users)")) {
      return { results: this.userColumns };
    }

    if (sql.includes("PRAGMA table_info(comments)")) {
      return { results: this.commentColumns };
    }

    if (sql.includes("PRAGMA foreign_key_list(comments)")) {
      return { results: this.commentForeignKeys };
    }

    if (sql.includes("PRAGMA table_info(posts)")) {
      return { results: this.postColumns };
    }

    if (sql.includes("SELECT id, title, body, timestamp, author_id, tag FROM posts ORDER BY id")) {
      return { results: this.existingPostsResults as T[] };
    }

    if (sql.includes("SELECT id, name, body, is_user, timestamp, post_id") && sql.includes("FROM comments ORDER BY id")) {
      return { results: this.existingCommentsResults as T[] };
    }

    if (sql.includes("FROM posts p") && sql.includes("LIMIT ? OFFSET ?")) {
      return { results: this.listPostsResults as T[] };
    }

    if (sql.includes("WHERE c.post_id = ?")) {
      return { results: this.listCommentsResults as T[] };
    }

    if (sql.includes("WHERE c.user_id = ?")) {
      return { results: this.listUserCommentsResults as T[] };
    }

    if (sql.includes("FROM comments c") && sql.includes("ORDER BY c.timestamp DESC, c.id DESC")) {
      return { results: this.listAllCommentsResults as T[] };
    }

    if (sql.includes("ORDER BY lower(COALESCE(username")) {
      return { results: this.listUsersResults as T[] };
    }

    if (sql.includes("WHERE p.author_id = ?")) {
      return { results: this.listPostsByAuthorResults as T[] };
    }

    return { results: [] as T[] };
  }

  async handleFirst<T>(sql: string, args: unknown[]) {
    this.calls.push({ method: "first", sql, args });

    if (sql.includes("SELECT COUNT(1) as count")) {
      if (this.countPostsResult === null) {
        return null as T;
      }

      return { count: this.countPostsResult } as T;
    }

    if (sql.includes("WHERE p.id = ?")) {
      return this.postByIdResult as T;
    }

    if (sql.includes("WHERE p.title = ?")) {
      return this.postByTitleResult as T;
    }

    if (sql.includes("WHERE c.id = ?")) {
      return this.commentByIdResult as T;
    }

    if (sql.includes("WHERE lower(email) = lower(?)")) {
      return this.userByEmailResult as T;
    }

    if (sql.includes("WHERE username = ?")) {
      return this.userByUsernameResult as T;
    }

    if (sql.includes("SELECT id, username, email, is_blocked") && sql.includes("WHERE id = ?")) {
      return (this.createdUserResult ?? this.userByIdResult) as T;
    }

    if (sql.includes("SELECT COUNT(1) AS count") && sql.includes("WHERE author_id = ?")) {
      if (this.countPostsByAuthorResult === null) {
        return null as T;
      }

      return { count: this.countPostsByAuthorResult } as T;
    }

    if (sql.includes("FROM sessions s")) {
      return this.sessionUserResult as T;
    }

    return null as T;
  }

  async handleRun(sql: string, args: unknown[]) {
    this.calls.push({ method: "run", sql, args });

    if (this.failingRunSqlFragment && sql.includes(this.failingRunSqlFragment)) {
      throw this.failingRunError;
    }

    if (sql.includes("INSERT INTO comments")) {
      return { meta: { last_row_id: this.lastRowIds.createComment } };
    }

    if (sql.includes("INSERT INTO users")) {
      return { meta: { last_row_id: this.lastRowIds.createUser } };
    }

    if (sql.includes("INSERT INTO posts")) {
      return { meta: { last_row_id: this.lastRowIds.createPost } };
    }

    return { meta: { last_row_id: 0 } };
  }
}

describe("createD1Db", () => {
  it("bootstraps base tables for an empty D1 database", async () => {
    const rawDb = new MockD1Database();
    rawDb.userColumns = [];
    rawDb.commentColumns = [];
    rawDb.postColumns = [];

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await blogDb.ensureSchema();

    expect(rawDb.findCall("run", "CREATE TABLE IF NOT EXISTS users")).toBeDefined();
    expect(rawDb.findCall("run", "CREATE TABLE IF NOT EXISTS comments")).toBeDefined();
    expect(rawDb.findCall("run", "CREATE TABLE posts (")).toBeDefined();
    expect(rawDb.findCall("run", "ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")).toBeUndefined();
    expect(rawDb.findCall("run", "ALTER TABLE comments ADD COLUMN user_id INTEGER")).toBeUndefined();
    expect(rawDb.findCall("run", "ALTER TABLE posts ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0")).toBeUndefined();
  });

  it("runs schema migrations once per D1 database instance", async () => {
    const rawDb = new MockD1Database();
    rawDb.existingPostsResults = [{ id: 1, title: "Legacy", body: "Body", timestamp: "2024-01-01T00:00:00.000Z", author_id: 1, tag: "Markdown Test" }];
    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await Promise.all([blogDb.ensureSchema(), blogDb.ensureSchema()]);

    expect(rawDb.findCall("run", "ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")).toBeDefined();
    expect(rawDb.findCall("run", "ALTER TABLE comments ADD COLUMN user_id INTEGER")).toBeDefined();
    expect(rawDb.findCall("run", "ALTER TABLE posts RENAME TO posts__legacy")).toBeDefined();
    expect(rawDb.findCall("run", "CREATE TABLE posts (")).toBeDefined();
    expect(rawDb.findCall("run", "INSERT INTO posts (id, title, body, timestamp, author_id, tag, is_private)")?.args).toEqual([
      1,
      "Legacy",
      "Body",
      "2024-01-01T00:00:00.000Z",
      1,
      "markdown test",
      0
    ]);
    expect(rawDb.findCall("run", "CREATE TABLE IF NOT EXISTS sessions")).toBeDefined();
    expect(rawDb.execCalls).toHaveLength(0);
  });

  it("adds the private-post column without rebuilding posts when tag is already required", async () => {
    const rawDb = new MockD1Database();
    rawDb.userColumns = [{ name: "id" }, { name: "is_blocked" }];
    rawDb.commentColumns = [{ name: "id" }, { name: "user_id" }];
    rawDb.commentForeignKeys = [{ from: "post_id", table: "posts" }];
    rawDb.postColumns = [{ name: "tag", notnull: 1 }];

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await blogDb.ensureSchema();

    expect(rawDb.findCall("run", "ALTER TABLE posts ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0")).toBeDefined();
    expect(rawDb.findCall("run", "ALTER TABLE posts RENAME TO posts__legacy")).toBeUndefined();
  });

  it("repairs comments that still reference posts__legacy", async () => {
    const rawDb = new MockD1Database();
    rawDb.commentColumns = [{ name: "id" }, { name: "user_id" }];
    rawDb.commentForeignKeys = [{ from: "post_id", table: "posts__legacy" }];
    rawDb.postColumns = [
      { name: "tag", notnull: 1 },
      { name: "is_private", notnull: 0 }
    ];
    rawDb.existingCommentsResults = [
      {
        id: 7,
        name: "alice",
        body: "Hello",
        is_user: 1,
        timestamp: "2024-01-01T00:00:00.000Z",
        post_id: 3,
        user_id: 1
      }
    ];

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await blogDb.ensureSchema();

    expect(rawDb.findCall("run", "ALTER TABLE comments RENAME TO comments__legacy")).toBeDefined();
    expect(rawDb.findCall("run", "CREATE TABLE IF NOT EXISTS comments")).toBeDefined();
    expect(rawDb.findCall("run", "INSERT INTO comments (id, name, body, is_user, timestamp, post_id, user_id)")?.args).toEqual([
      7,
      "alice",
      "Hello",
      1,
      "2024-01-01T00:00:00.000Z",
      3,
      1
    ]);
    expect(rawDb.findCall("run", "DROP TABLE comments__legacy")).toBeDefined();
  });

  it("retries schema setup after a migration failure", async () => {
    const rawDb = new MockD1Database();
    rawDb.postColumns = [
      { name: "tag", notnull: 1 },
      { name: "is_private", notnull: 0 }
    ];
    rawDb.failingRunSqlFragment = "ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0";

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await expect(blogDb.ensureSchema()).rejects.toThrow("Mock run failure");

    rawDb.failingRunSqlFragment = null;

    await expect(blogDb.ensureSchema()).resolves.toBeUndefined();

    expect(
      rawDb.calls.filter(
        (call) =>
          call.method === "run" &&
          call.sql.includes("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")
      )
    ).toHaveLength(2);
  });

  it("maps representative query results and bind arguments", async () => {
    const rawDb = new MockD1Database();
    rawDb.listPostsResults = [
      {
        id: 1,
        title: "Post",
        timestamp: "2024-01-01T00:00:00.000Z",
        tag: "news",
        author_id: 1,
        author_name: "alice",
        is_draft: 0,
        is_private: 0
      }
    ];
    rawDb.countPostsResult = 5;
    rawDb.postByIdResult = {
      id: 1,
      title: "Post",
      body: "Body",
      timestamp: "2024-01-01T00:00:00.000Z",
      tag: "news",
      author_id: 1,
      author_name: "alice",
      is_draft: 0,
      is_private: 0
    };
    rawDb.postByTitleResult = rawDb.postByIdResult;
    rawDb.listCommentsResults = [{ id: 1, body: "Comment" }];
    rawDb.commentByIdResult = { id: 1, body: "Comment" };
    rawDb.listUserCommentsResults = [{ id: 2, body: "Mine" }];
    rawDb.listAllCommentsResults = [{ id: 3, body: "All" }];
    rawDb.userByEmailResult = {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      password_hash: "hash",
      is_blocked: 0
    };
    rawDb.userByUsernameResult = rawDb.userByEmailResult;
    rawDb.userByIdResult = {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      is_blocked: 0
    };
    rawDb.listUsersResults = [rawDb.userByIdResult];
    rawDb.countPostsByAuthorResult = 2;
    rawDb.listPostsByAuthorResults = rawDb.listPostsResults;
    rawDb.sessionUserResult = {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      password_hash: "hash",
      is_blocked: 0,
      session_id: 8,
      session_expires_at: "2099-01-01T00:00:00.000Z"
    };

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 20, authorId: 7, tag: "markdown", viewerId: 1 })).resolves.toEqual(rawDb.listPostsResults);
    await expect(blogDb.countPosts({ includeDrafts: false, authorId: 7, tag: "markdown", viewerId: 1 })).resolves.toBe(5);
    await expect(blogDb.getPostById(1, { includeDrafts: true, viewerId: 1 })).resolves.toEqual(rawDb.postByIdResult);
    await expect(blogDb.getPostByTitle("Post", { includeDrafts: true, viewerId: 1 })).resolves.toEqual(rawDb.postByTitleResult);
    await expect(blogDb.listComments(1)).resolves.toEqual(rawDb.listCommentsResults);
    await expect(blogDb.getCommentById(1)).resolves.toEqual(rawDb.commentByIdResult);
    await expect(blogDb.listUserComments(1)).resolves.toEqual(rawDb.listUserCommentsResults);
    await expect(blogDb.listAllComments()).resolves.toEqual(rawDb.listAllCommentsResults);
    await expect(blogDb.getUserByEmail("alice@example.com")).resolves.toEqual(rawDb.userByEmailResult);
    await expect(blogDb.getUserByUsername("alice")).resolves.toEqual(rawDb.userByUsernameResult);
    await expect(blogDb.getUserById(1)).resolves.toEqual(rawDb.userByIdResult);
    await expect(blogDb.listUsers()).resolves.toEqual(rawDb.listUsersResults);
    await expect(blogDb.listPostTags(false, 1)).resolves.toEqual([]);
    await expect(blogDb.listAuthors(false, 1)).resolves.toEqual([]);
    await expect(blogDb.countPostsByAuthor(1)).resolves.toBe(2);
    await expect(blogDb.listPostsByAuthor(1, true, 1)).resolves.toEqual(rawDb.listPostsByAuthorResults);
    await expect(blogDb.getSessionUserByTokenHash("token-hash", "2024-01-01T00:00:00.000Z")).resolves.toEqual(rawDb.sessionUserResult);

    expect(rawDb.findCall("all", "LIMIT ? OFFSET ?")?.args).toEqual([7, 7, "markdown", "markdown", 1, 1, 1, 10, 20]);
    expect(rawDb.findCall("first", "COUNT(1) as count")?.args).toEqual([7, 7, "markdown", "markdown", 0, 1, 1]);
    expect(rawDb.findCall("first", "WHERE username = ?")?.args).toEqual(["alice"]);
    expect(rawDb.findCall("first", "WHERE s.token_hash = ?")?.args).toEqual(["token-hash", "2024-01-01T00:00:00.000Z"]);
  });

  it("returns safe fallback values when D1 queries have no row", async () => {
    const rawDb = new MockD1Database();
    rawDb.countPostsResult = null;
    rawDb.countPostsByAuthorResult = null;

    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await expect(blogDb.countPosts({ includeDrafts: false })).resolves.toBe(0);
    await expect(blogDb.getPostById(99, { includeDrafts: false })).resolves.toBeNull();
    await expect(blogDb.getPostByTitle("missing", { includeDrafts: false })).resolves.toBeNull();
    await expect(blogDb.getCommentById(99)).resolves.toBeNull();
    await expect(blogDb.getUserByEmail("missing@example.com")).resolves.toBeNull();
    await expect(blogDb.getUserByUsername("missing")).resolves.toBeNull();
    await expect(blogDb.getUserById(99)).resolves.toBeNull();
    await expect(blogDb.countPostsByAuthor(99)).resolves.toBe(0);
    await expect(blogDb.getSessionUserByTokenHash("missing", "2024-01-01T00:00:00.000Z")).resolves.toBeNull();
  });

  it("runs representative mutations and reports user-creation failures", async () => {
    const rawDb = new MockD1Database();
    const blogDb = createD1Db(rawDb as unknown as D1Database);

    await expect(
      blogDb.createComment({
        postId: 1,
        name: "alice",
        body: "Hello",
        isUser: true,
        userId: 1,
        timestamp: "2024-01-01T00:00:00.000Z"
      })
    ).resolves.toBe(11);

    rawDb.createdUserResult = null;
    await expect(
      blogDb.createUser({
        username: "alice",
        email: "alice@example.com",
        passwordHash: "hash"
      })
    ).rejects.toThrow("User creation failed");

    rawDb.createdUserResult = {
      id: 21,
      username: "alice",
      email: "alice@example.com",
      is_blocked: 0
    };
    await expect(
      blogDb.createUser({
        username: "alice",
        email: "alice@example.com",
        passwordHash: "hash"
      })
    ).resolves.toEqual(rawDb.createdUserResult);

    await expect(
      blogDb.createPost({
        title: "Post",
        body: "Body",
        timestamp: "2024-01-01T00:00:00.000Z",
        authorId: 1,
        tag: "news",
        isPrivate: true
      })
    ).resolves.toBe(31);

    await blogDb.deleteComment(1);
    await blogDb.updateUserBlocked(1, true);
    await blogDb.deleteUser(1);
    await blogDb.updatePost({ id: 31, title: "Updated", body: "Body", tag: "updated", isPrivate: false });
    await blogDb.deletePost(31);
    await blogDb.createSession({
      userId: 1,
      tokenHash: "session-hash",
      createdAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
    await blogDb.deleteSessionByTokenHash("session-hash");
    await blogDb.deleteSessionsByUserId(1);

    expect(rawDb.findCall("run", "INSERT INTO comments")?.args).toEqual([
      "alice",
      "Hello",
      1,
      "2024-01-01T00:00:00.000Z",
      1,
      1
    ]);
    expect(rawDb.findCall("run", "UPDATE users")?.args).toEqual([1, 1]);
    expect(rawDb.findCall("run", "DELETE FROM users")?.args).toEqual([1]);
    expect(rawDb.findCall("run", "INSERT INTO posts")?.args).toEqual([
      "Post",
      "Body",
      "2024-01-01T00:00:00.000Z",
      1,
      "news",
      1
    ]);
    expect(rawDb.findCall("run", "SET title = ?, body = ?, tag = ?, is_private = ?")?.args).toEqual(["Updated", "Body", "updated", 0, 31]);
    expect(rawDb.findCall("run", "INSERT INTO sessions")?.args).toEqual([
      1,
      "session-hash",
      "2024-01-01T00:00:00.000Z",
      "2099-01-01T00:00:00.000Z"
    ]);
  });
});