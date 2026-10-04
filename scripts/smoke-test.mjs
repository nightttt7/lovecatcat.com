const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error("Usage: npm run smoke -- https://example.com");
  process.exit(1);
}

const base = new URL(baseUrl);
const checks = [
  ["/", "text/html"],
  ["/posts?page=2", "text/html"],
  ["/labels", "text/html"],
  ["/authors", "text/html"],
  ["/static/primer.css", "text/css"],
];

for (const [path, contentType] of checks) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
  if (response.status !== 200 || !response.headers.get("content-type")?.includes(contentType)) {
    throw new Error(`${path}: expected HTTP 200 ${contentType}, got HTTP ${response.status} ${response.headers.get("content-type")}`);
  }
  console.log(`PASS ${path}`);
}

const languageResponse = await fetch(new URL("/api/lang?to=en", base), {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});

if (languageResponse.status !== 302 || !languageResponse.headers.get("set-cookie")?.includes("lang=en")) {
  throw new Error("Language switch did not redirect and set lang=en");
}

console.log("PASS /api/lang?to=en");
