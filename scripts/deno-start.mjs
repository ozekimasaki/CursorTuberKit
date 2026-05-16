Deno.env.set("NODE_ENV", "production")
await import(new URL("../dist/server/index.js", import.meta.url).href)
