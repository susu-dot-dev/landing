import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";

// Static, client-only SPA: `rsbuild build` writes dist/, which is uploaded to
// S3/R2 and served as-is. There is no server runtime.
export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: { index: "./src/index.tsx" },
  },
  resolve: {
    alias: { "@": "./src" },
  },
  html: {
    template: "./src/index.html",
    title: "susu",
    meta: { "color-scheme": "light dark" },
  },
  output: {
    // Hashed filenames under static/ are safe to cache forever; index.html is not.
    filenameHash: true,
    cleanDistPath: true,
  },
  server: {
    // Client-side routing: unknown paths serve index.html (dev and preview).
    historyApiFallback: true,
    // Same-origin API in dev: run authsu with `make dev` (:8787).
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
