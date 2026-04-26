type PostsIndexParams = {
  page?: number | null;
  authorId?: number | null;
  tag?: string | null;
};

const appendQuery = (path: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

export const postRoutes = {
  index: ({ page, authorId, tag }: PostsIndexParams = {}) => {
    const params = new URLSearchParams();

    if (authorId !== null && authorId !== undefined) {
      params.set("authorId", String(authorId));
    }

    if (tag) {
      params.set("tag", tag);
    }

    if (page && page > 1) {
      params.set("page", String(page));
    }

    return appendQuery("/posts", params);
  },
  new: () => "/posts/new",
  create: () => "/posts",
  detail: (postId: number) => `/posts/${postId}`,
  original: (postId: number) => `/posts/${postId}/original`,
  translation: (postId: number) => `/posts/${postId}/translation`,
  originalEdit: (postId: number) => `/posts/${postId}/original/edit`,
  translationEdit: (postId: number) => `/posts/${postId}/translation/edit`,
  comments: (postId: number) => `/posts/${postId}/comments`,
  delete: (postId: number) => `/posts/${postId}/delete`,
  translationGenerate: (postId: number) => `/posts/${postId}/translation/generate`,
  translationDelete: (postId: number) => `/posts/${postId}/translation/delete`,
  translationUnpublish: (postId: number) => `/posts/${postId}/translation/unpublish`
};

export const postRoutePatterns = {
  index: "/posts",
  new: "/posts/new",
  create: "/posts",
  detail: "/posts/:id{[0-9]+}",
  original: "/posts/:id/original",
  translation: "/posts/:id/translation",
  originalEdit: "/posts/:id/original/edit",
  translationEdit: "/posts/:id/translation/edit",
  comments: "/posts/:id/comments",
  delete: "/posts/:id/delete",
  translationGenerate: "/posts/:id/translation/generate",
  translationDelete: "/posts/:id/translation/delete",
  translationUnpublish: "/posts/:id/translation/unpublish"
};
