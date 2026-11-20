import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// rstest.setup.ts registers jest-dom's matchers with expect.extend; this
// declares their types on Rstest's Assertion.
declare module "@rstest/core" {
  // biome-ignore lint/suspicious/noExplicitAny: mirrors jest-dom's own matcher typing
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
}
