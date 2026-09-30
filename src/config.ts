import { z } from "zod";

// Each section is validated only when first used, so e.g. `db:init` runs without API keys.
function section<T extends z.ZodRawShape>(shape: T) {
  let cached: z.infer<z.ZodObject<T>> | undefined;
  return () => (cached ??= z.object(shape).parse(process.env));
}

export const dbEnv = section({
  DB_PATH: z.string().default("data/reddit.db"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),
});

// Needed by every Reddit request (RSS and API). Reddit asks for <platform>:<app>:<version> (by /u/<user>).
export const userAgentEnv = section({
  REDDIT_USER_AGENT: z.string().regex(/^\S+:\S+:\S+ \(by \/u\/\S+\)$/, "format: platform:app:version (by /u/username)"),
});

// Thread discovery: You.com is used when its key is set, otherwise Brave.
export const searchEnv = section({
  YOU_API_KEY: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
});

export const redditEnv = section({
  REDDIT_CLIENT_ID: z.string().min(1),
  REDDIT_CLIENT_SECRET: z.string().min(1),
  REDDIT_USERNAME: z.string().min(1),
  REDDIT_PASSWORD: z.string().min(1),
  REDDIT_USER_AGENT: z.string().min(1),
});

export const anthropicEnv = section({
  ANTHROPIC_API_KEY: z.string().min(1),
});

export const voyageEnv = section({
  VOYAGE_API_KEY: z.string().min(1),
  VOYAGE_MODEL: z.string().default("voyage-3.5"),
});
