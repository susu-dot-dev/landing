import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { authUrl, getAuthOrigin, LOCAL_AUTH_ORIGIN, PROD_AUTH_ORIGIN } from "./authUrl";

describe("authUrl", () => {
  afterEach(() => {
    rs.unstubAllGlobals();
  });

  test("uses localhost:8787 for local hostnames", () => {
    expect(getAuthOrigin("localhost")).toBe(LOCAL_AUTH_ORIGIN);
    expect(getAuthOrigin("127.0.0.1")).toBe(LOCAL_AUTH_ORIGIN);
    expect(getAuthOrigin("[::1]")).toBe(LOCAL_AUTH_ORIGIN);
    expect(getAuthOrigin("::1")).toBe(LOCAL_AUTH_ORIGIN);
    expect(authUrl("/api/session", "localhost")).toBe("http://localhost:8787/api/session");
  });

  test("uses https://auth.susu.dev in production and when location is absent", () => {
    expect(getAuthOrigin("susu.dev")).toBe(PROD_AUTH_ORIGIN);
    expect(getAuthOrigin("www.susu.dev")).toBe(PROD_AUTH_ORIGIN);
    expect(getAuthOrigin("")).toBe(PROD_AUTH_ORIGIN);
    expect(authUrl("/api/login/begin", "susu.dev")).toBe("https://auth.susu.dev/api/login/begin");

    rs.stubGlobal("location", undefined);
    expect(getAuthOrigin()).toBe(PROD_AUTH_ORIGIN);
  });

  test("defaults to globalThis.location.hostname", () => {
    expect(getAuthOrigin()).toBe(LOCAL_AUTH_ORIGIN);
    expect(authUrl("/api/logout")).toBe(`${LOCAL_AUTH_ORIGIN}/api/logout`);
  });
});
