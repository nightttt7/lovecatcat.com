import { createApp, type AppOptions } from "../app";
import type { SiteConfig } from "../config";
import type {
  BlogDb,
  CommentRow,
  CreateCommentInput,
  CreatePostInput,
  CreateSessionInput,
  PostDetailRow,
  PostListRow,
  SessionUserRow,
  UpdatePostInput
  ,UserRow
} from "../db/types";

export type AppTestState = {
  sessionUser: SessionUserRow | null;
  adminEmails: string[];
  overrideIsAdmin: boolean;
  createdSession: CreateSessionInput | null;
  createdComment: CreateCommentInput | null;
  createdPost: CreatePostInput | null;
  updatedPost: UpdatePostInput | null;
  deletedCommentIds: number[];
  deletedPostIds: number[];
  userBlockedUpdates: Array<{ userId: number; blocked: boolean }>;
  deletedUserIds: number[];
  deletedSessionTokenHashes: string[];
  deletedSessionUserIds: number[];
};

export const createSessionUserFixture = (overrides: Partial<SessionUserRow> = {}): SessionUserRow => ({
  id: 5,
  username: "alice",
  email: "alice@example.com",
  password_hash: "hash",
  is_blocked: 0,
  session_id: 9,
  session_expires_at: "2099-01-01T00:00:00.000Z",
  ...overrides
});

export const createPostDetailFixture = (overrides: Partial<PostDetailRow> = {}): PostDetailRow => ({
  id: 7,
  title: "Draft Post",
  body: "Existing body",
  timestamp: "2024-01-01T00:00:00.000Z",
  tag: "news,draft,updates",
  author_id: 5,
  author_name: "alice",
  is_draft: 1,
  is_private: 0,
  ...overrides
});

export const createPostListFixture = (overrides: Partial<PostListRow> = {}): PostListRow => ({
  id: 9,
  title: "Admin Post",
  timestamp: "2024-01-02T00:00:00.000Z",
  tag: "news,draft",
  author_id: 5,
  author_name: "alice",
  is_draft: 1,
  is_private: 0,
  ...overrides
});

export const createUserFixture = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: 2,
  username: "bob",
  email: "bob@example.com",
  is_blocked: 0,
  ...overrides
});

export const createCommentFixture = (overrides: Partial<CommentRow> = {}): CommentRow => ({
  id: 1,
  name: "Commenter 1",
  body: "Great post!",
  is_user: 1,
  timestamp: "2024-01-01 11:00:00",
  post_id: 1,
  post_title: "Test Post",
  user_id: 1,
  ...overrides
});

export const createAppTestContext = () => {
  const state: AppTestState = {
    sessionUser: null,
    adminEmails: [],
    overrideIsAdmin: false,
    createdSession: null,
    createdComment: null,
    createdPost: null,
    updatedPost: null,
    deletedCommentIds: [],
    deletedPostIds: [],
    userBlockedUpdates: [],
    deletedUserIds: [],
    deletedSessionTokenHashes: [],
    deletedSessionUserIds: []
  };

  const mockSite: SiteConfig = {
    siteName: "Test Blog",
    siteDescription: "Test Description",
    navLinks: [
      { label: "Post", href: "/post", requiresAdmin: true },
      { label: "Admin", href: "/admin", requiresAdmin: true }
    ]
  };

  const mockDb: BlogDb = {
    ensureSchema: async () => {},
    listPosts: async () => [],
    countPosts: async () => 0,
    getPostById: async () => null,
    getPostByTitle: async () => null,
    listComments: async () => [],
    getCommentById: async () => null,
    createComment: async (input) => {
      state.createdComment = input;
      return 1;
    },
    deleteComment: async (id) => {
      state.deletedCommentIds.push(id);
    },
    listUserComments: async () => [],
    listAllComments: async () => [],
    getUserByEmail: async () => null,
    getUserByUsername: async () => null,
    getUserById: async () => null,
    createUser: async () => ({ id: 1, username: "tester", email: "tester@example.com", is_blocked: 0 }),
    listUsers: async () => [],
    listPostTags: async () => [],
    listAuthors: async () => [],
    updateUserBlocked: async (userId, blocked) => {
      state.userBlockedUpdates.push({ userId, blocked });
    },
    deleteUser: async (userId) => {
      state.deletedUserIds.push(userId);
    },
    countPostsByAuthor: async () => 0,
    listPostsByAuthor: async () => [],
    createPost: async (input) => {
      state.createdPost = input;
      return 77;
    },
    updatePost: async (input) => {
      state.updatedPost = input;
    },
    deletePost: async (id) => {
      state.deletedPostIds.push(id);
    },
    createSession: async (input) => {
      state.createdSession = input;
    },
    getSessionUserByTokenHash: async () => state.sessionUser,
    deleteSessionByTokenHash: async (tokenHash) => {
      state.deletedSessionTokenHashes.push(tokenHash);
    },
    deleteSessionsByUserId: async (userId) => {
      state.deletedSessionUserIds.push(userId);
    }
  };

  const mockOptions: AppOptions = {
    getSite: () => mockSite,
    getDb: () => mockDb,
    getIsAdmin: () => state.overrideIsAdmin,
    getAdminEmails: () => state.adminEmails
  };

  const createRequestHeaders = (extraHeaders?: HeadersInit, signedIn = false) => {
    const headers = new Headers(extraHeaders);

    if (signedIn) {
      headers.set("cookie", "lovecatcat_session=test-session-token");
    }

    return headers;
  };

  const request = (path: string, init?: RequestInit, signedIn = false) => {
    const headers = createRequestHeaders(init?.headers, signedIn);
    return createApp(mockOptions).request(path, { ...init, headers });
  };

  const submitForm = (path: string, values: Record<string, string>, signedIn = false, init?: Omit<RequestInit, "method" | "body">) => {
    const headers = createRequestHeaders(init?.headers);
    headers.set("content-type", "application/x-www-form-urlencoded");

    return request(
      path,
      {
        ...init,
        method: "POST",
        headers,
        body: new URLSearchParams(values).toString()
      },
      signedIn
    );
  };

  const setSignedInUser = (overrides: Partial<SessionUserRow> = {}) => {
    const sessionUser = createSessionUserFixture(overrides);
    state.sessionUser = sessionUser;
    return sessionUser;
  };

  const setSignedInAdmin = (overrides: Partial<SessionUserRow> = {}) => {
    const sessionUser = setSignedInUser(overrides);
    const email = sessionUser.email ?? "";

    if (email && !state.adminEmails.includes(email)) {
      state.adminEmails = [...state.adminEmails, email];
    }

    return sessionUser;
  };

  return {
    state,
    mockDb,
    mockSite,
    mockOptions,
    request,
    submitForm,
    createSessionUser: createSessionUserFixture,
    createPostDetail: createPostDetailFixture,
    createPostList: createPostListFixture,
    createUser: createUserFixture,
    createComment: createCommentFixture,
    setSignedInUser,
    setSignedInAdmin
  };
};