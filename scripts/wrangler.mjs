import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = resolve(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

if (!existsSync(wranglerCli)) {
  console.error("Wrangler is not installed. Run npm install first.");
  process.exit(1);
}

const token = process.env.CLOUDFLARE_API_TOKEN_LCC;

if (!token?.trim()) {
  console.error("CLOUDFLARE_API_TOKEN_LCC must be set in the system environment.");
  process.exit(1);
}

const args = process.argv.slice(2);
const isProductionWorkflow =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === "nightttt7/lovecatcat.com" &&
  process.env.GITHUB_REF === "refs/heads/master";
const targetsPreview = args.some(
  (arg, index) => arg === "--env=preview" || (arg === "--env" && args[index + 1] === "preview"),
);
const isIdentityCommand = ["whoami", "--help", "-h", "--version", "-v"].includes(args[0]);

if (!isProductionWorkflow && !targetsPreview && !isIdentityCommand) {
  console.error("Local Wrangler commands must explicitly target --env preview.");
  process.exit(1);
}

const env = { ...process.env, CLOUDFLARE_API_TOKEN: token };
delete env.CLOUDFLARE_API_TOKEN_LCC;

const result = spawnSync(process.execPath, [wranglerCli, ...args], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exitCode = result.status ?? 1;
