import { describe, expect, it } from "vitest";
import {
  canDeleteComment,
  canDeletePost,
  canEditOwnPost,
  canManageUser,
  hasAccess
} from "./access";

describe("access utilities", () => {
  it("checks public, user, and admin access levels", () => {
    expect(hasAccess(null, "public")).toBe(true);
    expect(hasAccess(null, "user")).toBe(false);
    expect(hasAccess({ id: 1, isAdmin: false }, "user")).toBe(true);
    expect(hasAccess({ id: 1, isAdmin: false }, "admin")).toBe(false);
    expect(hasAccess({ id: 1, isAdmin: true }, "admin")).toBe(true);
  });

  it("allows users to delete their own comments and admins to delete any comment", () => {
    expect(canDeleteComment(null, 2)).toBe(false);
    expect(canDeleteComment({ id: 2, isAdmin: false }, 2)).toBe(true);
    expect(canDeleteComment({ id: 2, isAdmin: false }, null)).toBe(false);
    expect(canDeleteComment({ id: 2, isAdmin: false }, 3)).toBe(false);
    expect(canDeleteComment({ id: 1, isAdmin: true }, 3)).toBe(true);
  });

  it("restricts post editing to the owning admin", () => {
    expect(canEditOwnPost({ id: 5, isAdmin: true }, 5)).toBe(true);
    expect(canEditOwnPost({ id: 5, isAdmin: true }, null)).toBe(false);
    expect(canEditOwnPost({ id: 5, isAdmin: true }, 6)).toBe(false);
    expect(canEditOwnPost({ id: 5, isAdmin: false }, 5)).toBe(false);
  });

  it("allows only admins to delete posts", () => {
    expect(canDeletePost(null)).toBe(false);
    expect(canDeletePost({ id: 3, isAdmin: false })).toBe(false);
    expect(canDeletePost({ id: 3, isAdmin: true })).toBe(true);
  });

  it("prevents admins from managing themselves or other admin accounts", () => {
    expect(canManageUser(null, 2, false)).toBe(false);
    expect(canManageUser({ id: 2, isAdmin: false }, 3, false)).toBe(false);
    expect(canManageUser({ id: 1, isAdmin: true }, 2, false)).toBe(true);
    expect(canManageUser({ id: 1, isAdmin: true }, 1, false)).toBe(false);
    expect(canManageUser({ id: 1, isAdmin: true }, 2, true)).toBe(false);
  });
});