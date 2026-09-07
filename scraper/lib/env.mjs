import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In CI (GitHub Actions) env vars are injected directly and .env.local won't exist — that's fine.
const envPath = path.resolve(__dirname, "..", "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.startsWith("REPLACE_ME")) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}
