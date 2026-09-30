import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Share the project's root .env (ANTHROPIC_API_KEY, VOYAGE_API_KEY) with the demo app.
// Like node's --env-file, this never overrides variables already set in the environment.
const rootEnv = resolve(process.cwd(), "../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  turbopack: { root: process.cwd() },
  agentRules: false,
  devIndicators: false, // keep the Next.js badge out of screen recordings
};
export default config;
