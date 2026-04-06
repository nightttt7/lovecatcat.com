export const createSessionsTableSql = `
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`;

export const createSessionTokenIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
  ON sessions(token_hash)
`;

export const createSessionUserIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions(user_id)
`;

export const createCommentsUserIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON comments(user_id)
`;

export const createUsersTableSql = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    is_blocked INTEGER DEFAULT 0
  )
`;

export const createCommentsTableSql = `
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    body TEXT,
    is_user INTEGER,
    timestamp DATETIME,
    post_id INTEGER,
    user_id INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`;

export const addUsersBlockedColumnSql = `
  ALTER TABLE users
  ADD COLUMN is_blocked INTEGER DEFAULT 0
`;

export const addCommentsUserIdColumnSql = `
  ALTER TABLE comments
  ADD COLUMN user_id INTEGER
`;

export const addPostsPrivateColumnSql = `
  ALTER TABLE posts
  ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0
`;

export const backfillCommentUserIdsSql = `
  UPDATE comments
  SET user_id = (
    SELECT users.id
    FROM users
    WHERE users.username = comments.name
  )
  WHERE user_id IS NULL
    AND is_user = 1
    AND name IS NOT NULL
`;

export const createPostsTableWithRequiredTagSql = `
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    timestamp DATETIME,
    author_id INTEGER,
    is_private INTEGER NOT NULL DEFAULT 0,
    tag TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  )
`;

export const createPostsTimestampIndexSql = `
  CREATE INDEX IF NOT EXISTS ix_posts_timestamp
  ON posts(timestamp)
`;

export const createPostsAuthorIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_posts_author_id
  ON posts(author_id)
`;