const operation = process.argv[2];
const token = process.env.CLOUDFLARE_API_TOKEN_LCC;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!["enable", "disable"].includes(operation) || !token || !accountId) {
  console.error("Usage: CLOUDFLARE_API_TOKEN_LCC=... CLOUDFLARE_ACCOUNT_ID=... node scripts/preview-subdomain.mjs enable|disable");
  process.exit(1);
}

const enabled = operation === "enable";
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/lovecatcat-preview/subdomain`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled, previews_enabled: false }),
    signal: AbortSignal.timeout(15000),
  },
);
const body = await response.json();

if (!response.ok || !body.success || body.result?.enabled !== enabled || body.result?.previews_enabled !== false) {
  throw new Error(`Could not ${operation} lovecatcat-preview workers.dev: ${JSON.stringify(body.errors ?? [])}`);
}

console.log(`lovecatcat-preview workers.dev ${enabled ? "enabled" : "disabled"}`);
