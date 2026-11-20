import { withRsbuildConfig } from "@rstest/adapter-rsbuild";
import { defineConfig } from "@rstest/core";

export default defineConfig({
  extends: withRsbuildConfig(),
  testEnvironment: "happy-dom",
  setupFiles: ["./rstest.setup.ts"],
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    provider: "istanbul",
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["src/**/*.test.{ts,tsx}", "src/index.tsx", "src/env.d.ts"],
    reporters: ["text", "html", "lcov"],
    reportsDirectory: "./coverage",
    thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
});
