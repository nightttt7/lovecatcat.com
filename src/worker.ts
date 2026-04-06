import { createApp } from "./app";
import { getSiteConfig } from "./config";
import { createD1Db } from "./db/d1";
import { parseAdminEmails } from "./utils/auth";

export type Bindings = {
  DB: D1Database;
  ADMIN_EMAILS?: string;
};

const app = createApp<Bindings>({
  getSite: () => getSiteConfig(),
  getDb: (c) => createD1Db(c.env.DB),
  getAdminEmails: (c) => Array.from(parseAdminEmails(c.env.ADMIN_EMAILS))
});

export default app;
