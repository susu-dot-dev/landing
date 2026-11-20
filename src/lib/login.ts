/**
 * Client for authsu's passkey login and logout (see authsu docs/login_design.md).
 *
 * Login is usernameless: begin returns a challenge with an empty
 * allowCredentials list, the browser offers any discoverable passkey, and
 * finish verifies the assertion and sets the HttpOnly `__Host-session` cookie.
 * Script never sees that cookie. Whether we are signed in is a question for
 * the server (GET /api/session, see `fetchSession` in ./session).
 */

import { authUrl } from "./authUrl";

/** What the UI branches on after a login or logout attempt. */
export type LoginErrorCode =
  /** The server refused the assertion. Deliberately one answer for every cause. */
  | "invalid_login"
  /** Server or database unavailable (5xx): retry later. */
  | "unavailable"
  /** The browser has no WebAuthn support. */
  | "unsupported"
  /** The user dismissed the passkey prompt, or it timed out. */
  | "cancelled"
  /** The authenticator or platform could not produce an assertion. */
  | "authenticator_failed"
  /** Network failure or an unreadable response. */
  | "network"
  | "unknown";

export type LoginResult = { ok: true } | { ok: false; code: LoginErrorCode };

/** Maps an authsu error response to what the UI branches on. */
export function classifyLoginError(status: number, code: string | undefined): LoginErrorCode {
  if (status >= 500) return "unavailable";
  if (code === "invalid_login") return "invalid_login";
  return "unknown";
}

/** Maps a failure from navigator.credentials.get to a UI category. */
export function classifyAssertionError(error: unknown): LoginErrorCode {
  const name = (error as { name?: unknown } | null)?.name;
  // NotAllowedError covers cancel, timeout and "no passkey"; browsers do not tell them apart.
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  return "authenticator_failed";
}

type RequestOptionsJSON = Parameters<typeof PublicKeyCredential.parseRequestOptionsFromJSON>[0];

/** The WebAuthn surface login needs; injectable so tests need no browser. */
export type LoginCredentialsApi = {
  get(options: { publicKey: PublicKeyCredentialRequestOptions }): Promise<Credential | null>;
};

/** The slice of the PublicKeyCredential statics login relies on. */
export type LoginWebAuthnStatics = {
  parseRequestOptionsFromJSON(options: RequestOptionsJSON): PublicKeyCredentialRequestOptions;
};

export type LoginDeps = {
  fetchFn?: typeof fetch;
  credentials?: LoginCredentialsApi;
  statics?: LoginWebAuthnStatics;
};

const isRequestOptions = (body: unknown): body is { publicKey: RequestOptionsJSON } => {
  const publicKey = (body as { publicKey?: unknown } | null | undefined)?.publicKey;
  return typeof publicKey === "object" && publicKey !== null;
};

const isPublicKeyCredential = (
  credential: Credential | null,
): credential is PublicKeyCredential & { toJSON(): unknown } =>
  credential !== null &&
  credential.type === "public-key" &&
  typeof (credential as { toJSON?: unknown }).toJSON === "function";

type JsonResult =
  | { kind: "ok"; body: unknown }
  | { kind: "error"; status: number; code: string | undefined }
  | { kind: "network" };

/** POSTs to the API with credentials, so the session cookie is stored or sent. Never throws. */
async function post(fetchFn: typeof fetch, path: string, payload?: unknown): Promise<JsonResult> {
  let response: Response;
  try {
    response = await fetchFn(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    return { kind: "network" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (response.ok) return { kind: "ok", body };
  const error = (body as { error?: { code?: unknown } } | null | undefined)?.error;
  return {
    kind: "error",
    status: response.status,
    code: typeof error?.code === "string" ? error.code : undefined,
  };
}

const toFailure = (result: Exclude<JsonResult, { kind: "ok" }>): LoginResult => ({
  ok: false,
  code: result.kind === "network" ? "network" : classifyLoginError(result.status, result.code),
});

/**
 * Runs the whole login ceremony: begin, get an assertion, finish. On success
 * the browser has stored the HttpOnly session cookie. Never throws.
 */
export async function login(deps: LoginDeps = {}): Promise<LoginResult> {
  const fetchFn = deps.fetchFn ?? ((...args) => fetch(...args));
  const credentials = deps.credentials ?? globalThis.navigator?.credentials;
  const statics = deps.statics ?? globalThis.PublicKeyCredential;
  if (
    typeof credentials?.get !== "function" ||
    typeof statics?.parseRequestOptionsFromJSON !== "function"
  ) {
    return { ok: false, code: "unsupported" };
  }

  const begin = await post(fetchFn, authUrl("/api/login/begin"));
  if (begin.kind !== "ok") return toFailure(begin);
  if (!isRequestOptions(begin.body)) return { ok: false, code: "unknown" };

  let credential: Credential | null;
  try {
    const publicKey = statics.parseRequestOptionsFromJSON(begin.body.publicKey);
    credential = await credentials.get({ publicKey });
  } catch (error) {
    return { ok: false, code: classifyAssertionError(error) };
  }
  if (!isPublicKeyCredential(credential)) return { ok: false, code: "authenticator_failed" };

  // Posted unmodified: the server accepts toJSON() output as-is.
  const finish = await post(fetchFn, authUrl("/api/login/finish"), credential.toJSON());
  if (finish.kind !== "ok") return toFailure(finish);
  return { ok: true };
}

/**
 * POST /api/logout. The server revokes the session and clears the cookie.
 * A 401 means there was no session anyway, which is the state we wanted.
 */
export async function logout(
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<LoginResult> {
  const result = await post(fetchFn, authUrl("/api/logout"));
  if (result.kind === "ok") return { ok: true };
  if (result.kind === "error" && result.status === 401) return { ok: true };
  return toFailure(result);
}
