/**
 * Client for authsu's passkey registration (see authsu docs/registration_design.md
 * and docs/invitations_design.md).
 *
 * Accounts are usernameless and passwordless: an account is a passkey, and the
 * only way to get one is an invitation code.
 */

import { authUrl } from "./authUrl";

/** Matches authsu's server-side caps. */
export const MAX_NAME_BYTES = 128;
export const MAX_CODE_BYTES = 256;

const encoder = new TextEncoder();

/**
 * Control (Cc) and format (Cf) characters, which the server rejects in names. A name is what
 * an admin recognises a person by, so unlike an agent name or a label it admits no format
 * character at all, not even the zero-width joiners.
 */
const DISALLOWED_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;

/** The name the server will see: NFC-normalized and trimmed. */
export const normalizeName = (name: string) => name.normalize("NFC").trim();

/** Client-side mirror of the server's name rules, so most mistakes never cost a round trip. */
export function isValidName(name: string): boolean {
  const normalized = normalizeName(name);
  if (normalized === "") return false;
  if (encoder.encode(normalized).length > MAX_NAME_BYTES) return false;
  return !DISALLOWED_NAME_CHARS.test(normalized);
}

export const normalizeCode = (code: string) => code.trim();

/** Every invitation token starts with this (authsu `secret.Prefix("inv")`). */
export const INVITE_CODE_PREFIX = "susu_inv_";

/** The alphabet of an invitation code; anything else is 400 invalid_invitation. */
const CODE_ALPHABET = /^[A-Za-z0-9_-]+$/;

/**
 * Shape check only: right prefix, something after it, and the server's alphabet and length
 * cap. Whether the code is actually redeemable is the server's call.
 */
export const isValidCode = (code: string) => {
  const normalized = normalizeCode(code);
  return (
    normalized.startsWith(INVITE_CODE_PREFIX) &&
    normalized.length > INVITE_CODE_PREFIX.length &&
    normalized.length <= MAX_CODE_BYTES &&
    CODE_ALPHABET.test(normalized)
  );
};

export type RegisterErrorCode =
  /** The code is unknown, revoked, expired, or used up (403). Deliberately not more specific. */
  | "invitation_rejected"
  /** The server found the code malformed (400): not 1 to 256 characters of A-Z, a-z, 0-9, "_" and "-". */
  | "invalid_invitation"
  | "invalid_name"
  /** The challenge expired or was minted for other input: starting again fixes it. */
  | "invalid_challenge"
  /** The authenticator's answer was refused. */
  | "invalid_credential"
  /** Lost a race, or this invitation was just used (409). */
  | "conflict"
  /** Server or database unavailable (5xx): retry later. */
  | "unavailable"
  /** The browser has no WebAuthn support. */
  | "unsupported"
  /** The user dismissed the passkey prompt. */
  | "cancelled"
  /** The passkey for this account already exists on this authenticator. */
  | "already_registered"
  /** The authenticator or platform could not create a passkey. */
  | "authenticator_failed"
  /** Network failure or an unreadable response. */
  | "network"
  | "unknown";

export type RegisterResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; code: RegisterErrorCode };

type ServerError = { status: number; code: string | undefined };

/** Maps an authsu error response (status + stable code) to what the UI branches on. */
export function classifyServerError({ status, code }: ServerError): RegisterErrorCode {
  // invalid_invitation is used at both 400 (malformed) and 403 (not redeemable).
  if (status === 403 && code === "invalid_invitation") return "invitation_rejected";
  if (status === 400) {
    switch (code) {
      case "invalid_invitation":
      case "invalid_name":
      case "invalid_challenge":
      case "invalid_credential":
        return code;
    }
  }
  if (status === 409) return "conflict";
  if (status >= 500) return "unavailable";
  return "unknown";
}

type JsonResult =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "error"; code: RegisterErrorCode };

/**
 * Classifies an error from POST /api/register/finish. The invitation and name
 * were already accepted by begin, so a 400 here means the passkey itself was
 * refused. That includes a response the server could not parse at all
 * (unknown_field, invalid_field_type, ...): from the user's side the passkey
 * their provider made is the thing that didn't work.
 */
export function classifyFinishError({ status, code }: ServerError): RegisterErrorCode {
  const classified = classifyServerError({ status, code });
  if (status === 400 && (classified === "unknown" || classified === "invalid_credential")) {
    return "invalid_credential";
  }
  return classified;
}

/** POSTs JSON to the API. Never throws. */
async function postJson(
  fetchFn: typeof fetch,
  path: string,
  payload: unknown,
  classify: (error: ServerError) => RegisterErrorCode = classifyServerError,
): Promise<JsonResult> {
  let response: Response;
  try {
    response = await fetchFn(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: "error", code: "network" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (response.ok) return { kind: "ok", status: response.status, body };

  const error = (body as { error?: { code?: unknown } } | null | undefined)?.error;
  const code = typeof error?.code === "string" ? error.code : undefined;
  return { kind: "error", code: classify({ status: response.status, code }) };
}

/** The WebAuthn surface registration needs; injectable so tests need no browser. */
export type CredentialsApi = {
  create(options: { publicKey: PublicKeyCredentialCreationOptions }): Promise<Credential | null>;
};

type CreationOptionsJSON = Parameters<typeof PublicKeyCredential.parseCreationOptionsFromJSON>[0];

/** The slice of the PublicKeyCredential statics registration relies on. */
export type WebAuthnStatics = {
  parseCreationOptionsFromJSON(options: CreationOptionsJSON): PublicKeyCredentialCreationOptions;
};

function defaultCredentials(): CredentialsApi | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.credentials;
}

function defaultStatics(): WebAuthnStatics | undefined {
  return typeof PublicKeyCredential === "undefined" ? undefined : PublicKeyCredential;
}

/** Whether the given WebAuthn pieces can run the ceremony at all. */
export function isWebAuthnSupported(
  credentials: CredentialsApi | undefined,
  statics: WebAuthnStatics | undefined,
): credentials is CredentialsApi {
  return (
    credentials !== undefined &&
    statics !== undefined &&
    typeof statics.parseCreationOptionsFromJSON === "function"
  );
}

/** Maps a failure from navigator.credentials.create to a UI category. */
export function classifyCredentialError(error: unknown): RegisterErrorCode {
  const name = (error as { name?: unknown } | null)?.name;
  // NotAllowedError covers cancel, timeout and "no user gesture"; browsers do not tell them apart.
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "already_registered";
  return "authenticator_failed";
}

export type RegisterDeps = {
  fetchFn?: typeof fetch;
  credentials?: CredentialsApi;
  statics?: WebAuthnStatics;
};

const isCreationOptions = (body: unknown): body is { publicKey: CreationOptionsJSON } => {
  const publicKey = (body as { publicKey?: unknown } | null | undefined)?.publicKey;
  return typeof publicKey === "object" && publicKey !== null;
};

const isPublicKeyCredential = (
  credential: Credential | null,
): credential is PublicKeyCredential & { toJSON(): unknown } =>
  credential !== null &&
  credential.type === "public-key" &&
  typeof (credential as { toJSON?: unknown }).toJSON === "function";

const isFinishBody = (body: unknown): body is { userId: string; role: string } => {
  const value = body as { userId?: unknown; role?: unknown } | null | undefined;
  return typeof value?.userId === "string" && typeof value?.role === "string";
};

/**
 * Runs the whole registration ceremony: begin, create a passkey, finish.
 * Never throws; every failure is a RegisterErrorCode.
 *
 * `begin` writes nothing, so a wrong code fails before any biometric prompt.
 * `finish` issues no session: the caller sends the user on to log in.
 */
export async function register(
  input: { code: string; name: string },
  deps: RegisterDeps = {},
): Promise<RegisterResult> {
  const fetchFn = deps.fetchFn ?? ((...args) => fetch(...args));
  const credentials = deps.credentials ?? defaultCredentials();
  const statics = deps.statics ?? defaultStatics();
  if (!credentials || !statics || !isWebAuthnSupported(credentials, statics)) {
    return { ok: false, code: "unsupported" };
  }

  // The challenge is bound to the code and name, so both are sent again on finish.
  const invitationCode = normalizeCode(input.code);
  const name = normalizeName(input.name);

  const begin = await postJson(fetchFn, authUrl("/api/register/begin"), { invitationCode, name });
  if (begin.kind === "error") return { ok: false, code: begin.code };
  if (!isCreationOptions(begin.body)) return { ok: false, code: "unknown" };

  let credential: Credential | null;
  try {
    const publicKey = statics.parseCreationOptionsFromJSON(begin.body.publicKey);
    credential = await credentials.create({ publicKey });
  } catch (error) {
    return { ok: false, code: classifyCredentialError(error) };
  }
  if (!isPublicKeyCredential(credential)) return { ok: false, code: "authenticator_failed" };

  const finish = await postJson(
    fetchFn,
    authUrl("/api/register/finish"),
    {
      invitationCode,
      name,
      // Posted unmodified: the server accepts toJSON() output as-is.
      credential: credential.toJSON(),
    },
    classifyFinishError,
  );
  if (finish.kind === "error") return { ok: false, code: finish.code };
  if (!isFinishBody(finish.body)) return { ok: false, code: "unknown" };
  return { ok: true, userId: finish.body.userId, role: finish.body.role };
}
