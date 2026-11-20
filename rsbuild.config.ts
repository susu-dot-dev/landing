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
    // Keep <title> and all <meta> tags authored in src/index.html so Rsbuild's
    // defaults (charset, viewport, title) never duplicate or clobber them.
    title: "susu.dev",
    meta: () => ({}),
  },
  output: {
    // Hashed filenames under static/ are safe to cache forever; index.html is not.
    filenameHash: true,
    cleanDistPath: true,
  },
  server: {
    // Copy public/ assets (og-image.svg, robots.txt) cleanly into dist/.
    publicDir: { name: "public", copyOnBuild: true },
    // Client-side routing: unknown paths serve index.html (dev and preview).
    historyApiFallback: true,
  },
});
