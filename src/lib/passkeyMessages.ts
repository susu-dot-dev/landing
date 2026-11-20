import type { LoginErrorCode } from "@/lib/login";
import type { RegisterErrorCode } from "@/lib/register";

const REJECTED =
  "Your passkey was rejected. Please try again, or try a different passkey provider, such as your device's built-in one or a different password manager.";

/** What a login failure means to the user. */
export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  invalid_login: `We couldn't match that passkey to an account. Try again, or pick a different passkey if you have more than one. If you haven't registered yet, you'll need an invitation.`,
  unavailable: "Login isn't available right now. Try again in a moment.",
  unsupported:
    "This browser can't use passkeys. Try a current browser on a device with a screen lock.",
  cancelled: "The passkey prompt was dismissed. Try again when you're ready.",
  authenticator_failed: "Your device couldn't use that passkey. Please try again.",
  network: "Can't reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

/** What a registration failure means to the user. */
export const REGISTER_ERROR_MESSAGES: Record<RegisterErrorCode, string> = {
  invitation_rejected:
    "That invitation code isn't valid. It may be wrong, already used, expired, or revoked.",
  invalid_invitation: "That invitation code isn't in the right format. Check it and try again.",
  invalid_name: "That name can't be used. Use a plain name without special characters.",
  invalid_challenge: "The sign-up attempt expired. Please try again.",
  invalid_credential: REJECTED,
  conflict: "This invitation was just used. If that wasn't you, ask for a new one.",
  unavailable: "The server can't take sign-ups right now. Try again in a moment.",
  unsupported:
    "This browser can't create passkeys. Try a current browser on a device with a screen lock.",
  cancelled: "The passkey prompt was dismissed. Try again when you're ready.",
  already_registered: "A passkey for this account already exists on this device.",
  authenticator_failed: "Your device couldn't create a passkey. Please try again.",
  network: "Can't reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};
