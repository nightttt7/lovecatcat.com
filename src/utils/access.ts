export type AccessLevel = "public" | "user" | "admin";

export type AccessUser = {
  id: number;
  isAdmin: boolean;
} | null;

export const hasAccess = (user: AccessUser, level: AccessLevel) => {
  if (level === "public") {
    return true;
  }

  if (level === "user") {
    return user !== null;
  }

  return Boolean(user?.isAdmin);
};

export const canDeleteComment = (user: AccessUser, commentUserId: number | null) => {
  if (!user) {
    return false;
  }

  return user.isAdmin || (commentUserId !== null && commentUserId === user.id);
};

export const canEditOwnPost = (user: AccessUser, postAuthorId: number | null) => {
  return Boolean(user?.isAdmin && postAuthorId !== null && user.id === postAuthorId);
};

export const canDeletePost = (user: AccessUser) => Boolean(user?.isAdmin);

export const canManageUser = (user: AccessUser, targetUserId: number, targetIsAdmin: boolean) => {
  if (!user?.isAdmin) {
    return false;
  }

  if (targetIsAdmin) {
    return false;
  }

  return user.id !== targetUserId;
};