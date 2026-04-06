export type PostListRow = {
  id: number;
  title: string | null;
  timestamp: string | null;
  tag: string | null;
  author_id: number | null;
  author_name: string | null;
  is_draft: number | null;
  is_private?: number | null;
};

export type PostDetailRow = {
  id: number;
  title: string | null;
  body: string | null;
  timestamp: string | null;
  tag: string | null;
  author_id: number | null;
  author_name: string | null;
  is_draft: number | null;
  is_private?: number | null;
};

export type CommentRow = {
  id: number;
  name: string | null;
  body: string | null;
  is_user: number | null;
  timestamp: string | null;
  post_id: number | null;
  post_title: string | null;
  user_id: number | null;
};

export type UserRow = {
  id: number;
  username: string | null;
  email: string | null;
  is_blocked: number | null;
};

export type AuthUserRow = UserRow & {
  password_hash: string | null;
};

export type SessionUserRow = AuthUserRow & {
  session_id: number | null;
  session_expires_at: string | null;
};

export type PostTagRow = {
  tag: string | null;
};

export type AuthorSummaryRow = {
  id: number;
  username: string | null;
  post_count: number;
};

export type ListPostsOptions = {
  includeDrafts: boolean;
  limit: number;
  offset: number;
  viewerId?: number | null;
  authorId?: number | null;
  tag?: string | null;
};

export type CountPostsOptions = {
  includeDrafts: boolean;
  viewerId?: number | null;
  authorId?: number | null;
  tag?: string | null;
};

export type CreateUserInput = {
  username: string;
  email: string;
  passwordHash: string;
};

export type CreateCommentInput = {
  postId: number;
  name: string;
  body: string;
  isUser: boolean;
  userId: number | null;
  timestamp: string;
};

export type CreatePostInput = {
  title: string | null;
  body: string;
  timestamp: string;
  authorId: number;
  tag: string;
  isPrivate: boolean;
};

export type UpdatePostInput = {
  id: number;
  title: string | null;
  body: string;
  tag: string;
  isPrivate: boolean;
};

export type CreateSessionInput = {
  userId: number;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

export type BlogDb = {
  ensureSchema: () => Promise<void>;
  listPosts: (options: ListPostsOptions) => Promise<PostListRow[]>;
  countPosts: (options: CountPostsOptions) => Promise<number>;
  getPostById: (id: number, options: { includeDrafts: boolean; viewerId?: number | null }) => Promise<PostDetailRow | null>;
  getPostByTitle: (title: string, options: { includeDrafts: boolean; viewerId?: number | null }) => Promise<PostDetailRow | null>;
  listComments: (postId: number) => Promise<CommentRow[]>;
  getCommentById: (id: number) => Promise<CommentRow | null>;
  createComment: (input: CreateCommentInput) => Promise<number>;
  deleteComment: (id: number) => Promise<void>;
  listUserComments: (userId: number) => Promise<CommentRow[]>;
  listAllComments: () => Promise<CommentRow[]>;
  getUserByEmail: (email: string) => Promise<AuthUserRow | null>;
  getUserByUsername: (username: string) => Promise<AuthUserRow | null>;
  getUserById: (id: number) => Promise<UserRow | null>;
  createUser: (input: CreateUserInput) => Promise<UserRow>;
  listUsers: () => Promise<UserRow[]>;
  listPostTags: (includeDrafts: boolean, viewerId?: number | null) => Promise<PostTagRow[]>;
  listAuthors: (includeDrafts: boolean, viewerId?: number | null) => Promise<AuthorSummaryRow[]>;
  updateUserBlocked: (userId: number, blocked: boolean) => Promise<void>;
  deleteUser: (userId: number) => Promise<void>;
  countPostsByAuthor: (authorId: number) => Promise<number>;
  listPostsByAuthor: (authorId: number, includeDrafts: boolean, viewerId?: number | null) => Promise<PostListRow[]>;
  createPost: (input: CreatePostInput) => Promise<number>;
  updatePost: (input: UpdatePostInput) => Promise<void>;
  deletePost: (id: number) => Promise<void>;
  createSession: (input: CreateSessionInput) => Promise<void>;
  getSessionUserByTokenHash: (tokenHash: string, now: string) => Promise<SessionUserRow | null>;
  deleteSessionByTokenHash: (tokenHash: string) => Promise<void>;
  deleteSessionsByUserId: (userId: number) => Promise<void>;
};
