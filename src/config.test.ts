import { describe, expect, it } from "vitest";
import { getSiteConfig } from "./config";

describe("getSiteConfig", () => {
  it("returns fixed site values", () => {
    const config = getSiteConfig();
    
    expect(config.siteName).toBe("LoveCatCat");
    expect(config.siteDescription).toBe("Hono full-stack blog");
  });

  it("includes correct navLinks structure", () => {
    const config = getSiteConfig();
    
    expect(config.navLinks).toHaveLength(2);
    expect(config.navLinks[0]).toEqual({ label: "Post", labelKey: "newPost", href: "/posts/new", requiresAdmin: true });
    expect(config.navLinks[1]).toEqual({ label: "Admin", labelKey: "adminDashboard", href: "/admin", requiresAdmin: true });
  });
});
