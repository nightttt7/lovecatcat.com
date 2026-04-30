import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createSqliteDb } from "./sqlite";

type TableColumnRow = {
  name: string;
  notnull?: number;
};

const createBaseDbPath = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lovecatcat-sqlite-"));
  const dbPath = path.join(tempDir, "blog.sqlite");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT UNIQUE,
      password_hash TEXT
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      body TEXT,
      timestamp DATETIME,
      author_id INTEGER,
      tag TEXT
    );

    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      body TEXT,
      is_user INTEGER,
      timestamp DATETIME,
      post_id INTEGER
    );
  `);

  db.close();
  return dbPath;
};

const createFkLinkedDbPath = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lovecatcat-sqlite-fk-"));
  const dbPath = path.join(tempDir, "blog.sqlite");
  const db = new Database(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT UNIQUE,
      password_hash TEXT
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      body TEXT,
      timestamp DATETIME,
      author_id INTEGER,
      tag TEXT,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      body TEXT,
      is_user INTEGER,
      timestamp DATETIME,
      post_id INTEGER,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );
  `);

  db.close();
  return dbPath;
};

const withRawDb = <T>(dbPath: string, action: (db: Database.Database) => T) => {
  const db = new Database(dbPath);

  try {
    return action(db);
  } finally {
    db.close();
  }
};

describe("createSqliteDb", () => {
  it("migrates the schema and backfills comment user ids", async () => {
    const dbPath = createBaseDbPath();

    withRawDb(dbPath, (db) => {
      const userId = Number(
        db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)").run("alice", "alice@example.com", "hash")
          .lastInsertRowid
      );

      const postId = Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
          .run("About", "Body", "2024-01-01T00:00:00.000Z", userId, "Markdown Test").lastInsertRowid
      );

      db.prepare("INSERT INTO comments (name, body, is_user, timestamp, post_id) VALUES (?, ?, ?, ?, ?)")
        .run("alice", "Hello", 1, "2024-01-01T00:00:00.000Z", postId);
    });

    const blogDb = createSqliteDb({ dbPath });
    await blogDb.ensureSchema();

    const userColumns = withRawDb(dbPath, (db) => db.prepare("PRAGMA table_info(users)").all() as TableColumnRow[]);
    const commentColumns = withRawDb(dbPath, (db) => db.prepare("PRAGMA table_info(comments)").all() as TableColumnRow[]);
    const postColumns = withRawDb(dbPath, (db) => db.prepare("PRAGMA table_info(posts)").all() as TableColumnRow[]);
    const commentRow = withRawDb(dbPath, (db) => db.prepare("SELECT user_id FROM comments LIMIT 1").get() as { user_id: number | null });
    const migratedPostRow = withRawDb(dbPath, (db) =>
      db.prepare("SELECT tag, is_private, source_lang_manual FROM posts LIMIT 1").get() as { tag: string; is_private: number; source_lang_manual: number }
    );
    const sessionsTable = withRawDb(dbPath, (db) =>
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get() as { name: string } | undefined
    );

    expect(userColumns.some((column) => column.name === "is_blocked")).toBe(true);
    expect(commentColumns.some((column) => column.name === "user_id")).toBe(true);
    expect(postColumns.find((column) => column.name === "tag")?.notnull).toBe(1);
    expect(postColumns.some((column) => column.name === "is_private")).toBe(true);
    expect(postColumns.some((column) => column.name === "source_lang_manual")).toBe(true);
    expect(commentRow.user_id).toBe(1);
    expect(migratedPostRow.tag).toBe("markdown test");
    expect(migratedPostRow.is_private).toBe(0);
    expect(migratedPostRow.source_lang_manual).toBe(0);
    expect(sessionsTable?.name).toBe("sessions");
  });

  it("creates users, updates blocked status, and manages sessions", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const user = await blogDb.createUser({
      username: "alice",
      email: "alice@example.com",
      passwordHash: "password-hash"
    });

    expect(user).toMatchObject({
      username: "alice",
      email: "alice@example.com",
      is_blocked: 0
    });
    await expect(blogDb.getUserByEmail("ALICE@EXAMPLE.COM")).resolves.toMatchObject({ id: user.id });

    await blogDb.updateUserBlocked(user.id, true);
    await expect(blogDb.getUserById(user.id)).resolves.toMatchObject({ is_blocked: 1 });

    await blogDb.createSession({
      userId: user.id,
      tokenHash: "session-hash",
      createdAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    await expect(blogDb.getSessionUserByTokenHash("session-hash", "2024-01-01T00:00:00.000Z")).resolves.toMatchObject({
      id: user.id,
      session_id: expect.any(Number)
    });

    await blogDb.deleteSessionByTokenHash("session-hash");
    await expect(blogDb.getSessionUserByTokenHash("session-hash", "2024-01-01T00:00:00.000Z")).resolves.toBeNull();

    await blogDb.createSession({
      userId: user.id,
      tokenHash: "session-hash-2",
      createdAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
    await blogDb.deleteSessionsByUserId(user.id);
    await expect(blogDb.getSessionUserByTokenHash("session-hash-2", "2024-01-01T00:00:00.000Z")).resolves.toBeNull();
  });

  it("filters posts by draft and private visibility and manages comments", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const author = await blogDb.createUser({
      username: "author",
      email: "author@example.com",
      passwordHash: "hash"
    });

    let publishedPostId = 0;
    let draftPostId = 0;
    let privatePostId = 0;
    withRawDb(dbPath, (db) => {
      publishedPostId = Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
          .run("Published", "Body", "2024-01-02T00:00:00.000Z", author.id, "news").lastInsertRowid
      );
      draftPostId = Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
          .run("Draft", "Body", "2024-01-03T00:00:00.000Z", author.id, "news,draft").lastInsertRowid
      );
      privatePostId = Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag, is_private) VALUES (?, ?, ?, ?, ?, ?)")
          .run("Private", "Body", "2024-01-04T00:00:00.000Z", author.id, "notes", 1).lastInsertRowid
      );
    });

    await expect(blogDb.listPosts({ includeDrafts: false, limit: 10, offset: 0 })).resolves.toHaveLength(1);
    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 0 })).resolves.toHaveLength(2);
    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 0, viewerId: author.id })).resolves.toHaveLength(3);
    await expect(blogDb.countPosts({ includeDrafts: false })).resolves.toBe(1);
    await expect(blogDb.countPosts({ includeDrafts: true })).resolves.toBe(2);
    await expect(blogDb.countPosts({ includeDrafts: true, viewerId: author.id })).resolves.toBe(3);
    await expect(blogDb.getPostById(draftPostId, { includeDrafts: false })).resolves.toBeNull();
    await expect(blogDb.getPostById(draftPostId, { includeDrafts: true })).resolves.toMatchObject({ title: "Draft" });
    await expect(blogDb.getPostById(privatePostId, { includeDrafts: true })).resolves.toBeNull();
    await expect(blogDb.getPostById(privatePostId, { includeDrafts: true, viewerId: author.id })).resolves.toMatchObject({ title: "Private", is_private: 1 });
    await expect(blogDb.getPostByTitle("Draft", { includeDrafts: false })).resolves.toBeNull();
    await expect(blogDb.getPostByTitle("Draft", { includeDrafts: true })).resolves.toMatchObject({ id: draftPostId });
    await expect(blogDb.getPostByTitle("Private", { includeDrafts: true })).resolves.toBeNull();
    await expect(blogDb.getPostByTitle("Private", { includeDrafts: true, viewerId: author.id })).resolves.toMatchObject({ id: privatePostId });
    await expect(blogDb.listPostsByAuthor(author.id, true)).resolves.toHaveLength(2);
    await expect(blogDb.listPostsByAuthor(author.id, true, author.id)).resolves.toHaveLength(3);

    const commentId = await blogDb.createComment({
      postId: publishedPostId,
      name: "author",
      body: "Nice post",
      isUser: true,
      userId: author.id,
      timestamp: "2024-01-04T00:00:00.000Z"
    });

    await expect(blogDb.getCommentById(commentId)).resolves.toMatchObject({ body: "Nice post", user_id: author.id });
    await expect(blogDb.listComments(publishedPostId)).resolves.toHaveLength(1);
    await expect(blogDb.listUserComments(author.id)).resolves.toHaveLength(1);
    await expect(blogDb.listAllComments()).resolves.toHaveLength(1);

    await blogDb.deleteComment(commentId);
    await expect(blogDb.getCommentById(commentId)).resolves.toBeNull();
  });

  it("filters listed and counted posts by optional author id", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const author = await blogDb.createUser({
      username: "author-a",
      email: "author-a@example.com",
      passwordHash: "hash"
    });
    const otherAuthor = await blogDb.createUser({
      username: "author-b",
      email: "author-b@example.com",
      passwordHash: "hash"
    });

    withRawDb(dbPath, (db) => {
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A1", "Body", "2024-01-02T00:00:00.000Z", author.id, "news");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A2", "Body", "2024-01-03T00:00:00.000Z", author.id, "news,draft");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("B1", "Body", "2024-01-04T00:00:00.000Z", otherAuthor.id, "news");
    });

    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 0, authorId: author.id })).resolves.toHaveLength(2);
    await expect(blogDb.listPosts({ includeDrafts: false, limit: 10, offset: 0, authorId: author.id })).resolves.toHaveLength(1);
    await expect(blogDb.countPosts({ includeDrafts: true, authorId: author.id })).resolves.toBe(2);
    await expect(blogDb.countPosts({ includeDrafts: false, authorId: author.id })).resolves.toBe(1);
  });

  it("filters listed and counted posts by optional tag", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const author = await blogDb.createUser({
      username: "author-a",
      email: "author-a@example.com",
      passwordHash: "hash"
    });

    withRawDb(dbPath, (db) => {
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A1", "Body", "2024-01-02T00:00:00.000Z", author.id, "markdown,test");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A2", "Body", "2024-01-03T00:00:00.000Z", author.id, "news,draft");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A3", "Body", "2024-01-04T00:00:00.000Z", author.id, "markdown,guide");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag, is_private) VALUES (?, ?, ?, ?, ?, ?)")
        .run("A4", "Body", "2024-01-05T00:00:00.000Z", author.id, "markdown,secret", 1);
    });

    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 0, tag: "markdown" })).resolves.toHaveLength(2);
    await expect(blogDb.listPosts({ includeDrafts: true, limit: 10, offset: 0, tag: "markdown", viewerId: author.id })).resolves.toHaveLength(3);
    await expect(blogDb.listPosts({ includeDrafts: false, limit: 10, offset: 0, tag: "news" })).resolves.toHaveLength(0);
    await expect(blogDb.countPosts({ includeDrafts: true, tag: "markdown" })).resolves.toBe(2);
    await expect(blogDb.countPosts({ includeDrafts: true, tag: "markdown", viewerId: author.id })).resolves.toBe(3);
    await expect(blogDb.countPosts({ includeDrafts: true, tag: "news" })).resolves.toBe(1);
  });

  it("lists stored tags and authors for directory pages", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const author = await blogDb.createUser({
      username: "author-a",
      email: "author-a@example.com",
      passwordHash: "hash"
    });

    withRawDb(dbPath, (db) => {
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A1", "Body", "2024-01-02T00:00:00.000Z", author.id, "markdown,test");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
        .run("A2", "Body", "2024-01-03T00:00:00.000Z", author.id, "news,draft");
      db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag, is_private) VALUES (?, ?, ?, ?, ?, ?)")
        .run("A3", "Body", "2024-01-04T00:00:00.000Z", author.id, "secret", 1);
    });

    await expect(blogDb.listPostTags(false)).resolves.toEqual([{ tag: "markdown,test" }]);
    await expect(blogDb.listAuthors(false)).resolves.toEqual([{ id: author.id, username: "author-a", post_count: 1 }]);
    await expect(blogDb.listPostTags(true, author.id)).resolves.toEqual([{ tag: "secret" }, { tag: "news,draft" }, { tag: "markdown,test" }]);
    await expect(blogDb.listAuthors(true, author.id)).resolves.toEqual([{ id: author.id, username: "author-a", post_count: 3 }]);
  });

  it("creates, updates, and deletes posts and users", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const user = await blogDb.createUser({
      username: "alice",
      email: "alice@example.com",
      passwordHash: "hash"
    });

    const otherPostId = withRawDb(dbPath, (db) =>
      Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
          .run("Other post", "Body", "2024-01-05T00:00:00.000Z", null, "other").lastInsertRowid
      )
    );

    const postId = await blogDb.createPost({
      title: "Original title",
      body: "Original body",
      timestamp: "2024-01-06T00:00:00.000Z",
      authorId: user.id,
      sourceLang: "zh",
      tag: "news",
      isPrivate: true
    });

    await blogDb.updatePost({
      id: postId,
      title: "Updated title",
      body: "Updated body",
      sourceLang: "en",
      tag: "news,updated",
      isPrivate: false
    });
    await expect(blogDb.getPostById(postId, { includeDrafts: true })).resolves.toMatchObject({
      title: "Updated title",
      body: "Updated body",
      tag: "news,updated",
      is_private: 0
    });

    await blogDb.createComment({
      postId,
      name: "alice",
      body: "Comment on owned post",
      isUser: true,
      userId: user.id,
      timestamp: "2024-01-07T00:00:00.000Z"
    });
    await blogDb.deletePost(postId);

    await expect(blogDb.getPostById(postId, { includeDrafts: true })).resolves.toBeNull();
    expect(withRawDb(dbPath, (db) => db.prepare("SELECT COUNT(1) AS count FROM comments WHERE post_id = ?").get(postId) as { count: number }).count).toBe(0);

    await blogDb.createComment({
      postId: otherPostId,
      name: "alice",
      body: "Comment on other post",
      isUser: true,
      userId: user.id,
      timestamp: "2024-01-08T00:00:00.000Z"
    });
    await blogDb.createSession({
      userId: user.id,
      tokenHash: "cleanup-session",
      createdAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    await blogDb.deleteUser(user.id);

    await expect(blogDb.getUserById(user.id)).resolves.toBeNull();
    expect(withRawDb(dbPath, (db) => db.prepare("SELECT COUNT(1) AS count FROM comments WHERE user_id = ?").get(user.id) as { count: number }).count).toBe(0);
    expect(withRawDb(dbPath, (db) => db.prepare("SELECT COUNT(1) AS count FROM sessions WHERE user_id = ?").get(user.id) as { count: number }).count).toBe(0);
    await expect(blogDb.countPostsByAuthor(user.id)).resolves.toBe(0);
  });

  it("repairs comment foreign keys after rebuilding posts", async () => {
    const dbPath = createFkLinkedDbPath();

    withRawDb(dbPath, (db) => {
      const userId = Number(
        db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)").run("alice", "alice@example.com", "hash")
          .lastInsertRowid
      );

      const postId = Number(
        db.prepare("INSERT INTO posts (title, body, timestamp, author_id, tag) VALUES (?, ?, ?, ?, ?)")
          .run("About", "Body", "2024-01-01T00:00:00.000Z", userId, "Markdown Test").lastInsertRowid
      );

      db.prepare("INSERT INTO comments (name, body, is_user, timestamp, post_id) VALUES (?, ?, ?, ?, ?)")
        .run("alice", "Hello", 1, "2024-01-01T00:00:00.000Z", postId);
    });

    const blogDb = createSqliteDb({ dbPath });
    await blogDb.ensureSchema();

    const commentForeignKeys = withRawDb(dbPath, (db) => db.prepare("PRAGMA foreign_key_list(comments)").all() as Array<{ table: string }>);
    expect(commentForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "posts" })
      ])
    );
    expect(withRawDb(dbPath, (db) => db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);

    await expect(blogDb.deletePost(1)).resolves.toBeUndefined();
    expect(withRawDb(dbPath, (db) => db.prepare("SELECT COUNT(1) AS count FROM comments").get() as { count: number }).count).toBe(0);
  });

  it("throws when a created sqlite user cannot be read back", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const originalPrepare = Database.prototype.prepare;

    Database.prototype.prepare = function (this: Database.Database, sql: string) {
      const stmt = originalPrepare.call(this, sql);

      if (
        sql === `
  SELECT id, username, email, is_blocked
  FROM users
  WHERE id = ?
  LIMIT 1
`
      ) {
        return new Proxy(stmt, {
          get(target, prop, receiver) {
            if (prop === "get") {
              return () => undefined;
            }

            return Reflect.get(target, prop, receiver);
          }
        }) as typeof stmt;
      }

      return stmt;
    } as typeof Database.prototype.prepare;

    try {
      await expect(
        blogDb.createUser({
          username: "echo",
          email: "echo@example.com",
          passwordHash: "hash"
        })
      ).rejects.toThrow("User creation failed");
    } finally {
      Database.prototype.prepare = originalPrepare;
    }
  });

  it("returns null and empty query results for missing sqlite rows", async () => {
    const dbPath = createBaseDbPath();
    const blogDb = createSqliteDb({ dbPath });

    await blogDb.ensureSchema();

    const firstUser = await blogDb.createUser({
      username: "charlie",
      email: "charlie@example.com",
      passwordHash: "hash"
    });
    const secondUser = await blogDb.createUser({
      username: "delta",
      email: "delta@example.com",
      passwordHash: "hash"
    });

    await expect(blogDb.getUserByUsername("charlie")).resolves.toMatchObject({ id: firstUser.id });
    await expect(blogDb.getUserByUsername("missing-user")).resolves.toBeNull();
    await expect(blogDb.listUsers()).resolves.toEqual([
      {
        id: firstUser.id,
        username: "charlie",
        email: "charlie@example.com",
        is_blocked: 0
      },
      {
        id: secondUser.id,
        username: "delta",
        email: "delta@example.com",
        is_blocked: 0
      }
    ]);
    await expect(blogDb.getUserById(999)).resolves.toBeNull();
    await expect(blogDb.getCommentById(999)).resolves.toBeNull();
    await expect(blogDb.getPostByTitle("missing", { includeDrafts: true })).resolves.toBeNull();
  });
});