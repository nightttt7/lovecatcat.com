import type { TranslationKey } from "./utils/i18n";

export type NavLink = {
  label: string;
  labelKey?: TranslationKey;
  href: string;
  requiresAdmin?: boolean;
};

export type SiteConfig = {
  siteName: string;
  siteDescription: string;
  navLinks: NavLink[];
};

export const getSiteConfig = (): SiteConfig => {
  return {
    siteName: "LoveCatCat",
    siteDescription: "Hono full-stack blog",
    navLinks: [
      { label: "Post", labelKey: "newPost", href: "/post", requiresAdmin: true },
      { label: "Admin", labelKey: "adminDashboard", href: "/admin", requiresAdmin: true }
    ]
  };
};
