import { describe, expect, test } from "@rstest/core";
import { cn } from "./utils";

describe("cn", () => {
  test("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  test("lets later Tailwind classes win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
