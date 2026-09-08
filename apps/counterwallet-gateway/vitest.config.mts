import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        serviceBindings: {
          XCPDEX_API: async () => Response.json({ ok: true }),
        },
      },
    }),
  ],
  test: {
    include: ["runtime-tests/**/*.test.ts"],
  },
});
